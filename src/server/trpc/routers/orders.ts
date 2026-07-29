import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { orderInputSchema, orderItemInputSchema, orderStatusUpdateSchema, getAllowedPaymentMethods, paymentMethodValues } from "@/lib/validation/order";
import type { OrderInput } from "@/lib/validation/order";
import { requirePermission, router } from "@/server/trpc/trpc";
import { resolveSucursalFilter, resolveSucursalForWrite } from "@/server/trpc/sucursal";
import { sendWhatsappTextMessage } from "@/server/integrations/whatsapp/client";
import {
  createOrder,
  addItemsToOrder,
  removeOrderItemRow,
  reconcilePromotions,
  cancelOrder,
  updatePendingOrderPayment,
  applyDiscount,
  setPaymentMode,
  recordSplitPayment,
} from "@/server/orders/create-order";
import { getAvailableStock, computeRequestedQuantities } from "@/server/stock/availability";
import { getOrCreateWalkInCustomer } from "@/server/customers/walk-in";
import type { PrismaClient } from "@/generated/prisma/client";

function toNumber<T extends { total: unknown }>(order: T) {
  return { ...order, total: Number(order.total) };
}

// Corta la venta manual (CRM) si algún renglón pide más de lo que queda de
// stock trackeado (ProductSupplyUsage) — a diferencia del descuento real al
// vender (que deja el stock ir a negativo a propósito, ver
// applySupplyDeductions), acá SÍ conviene frenar antes de confirmar: quien
// carga la venta a mano puede elegir otro sabor en el momento en vez de
// enterarse después de que se vendió algo que no había.
async function assertStockAvailable(prisma: PrismaClient, items: OrderInput["items"], sucursalId: string) {
  const requested = computeRequestedQuantities(items);
  if (requested.size === 0) return;

  const available = await getAvailableStock([...requested.keys()], sucursalId);
  for (const [productId, quantity] of requested) {
    const stock = available.get(productId);
    if (stock === undefined || quantity <= stock) continue;

    const product = await prisma.product.findUnique({ where: { id: productId } });
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `No hay stock suficiente de "${product?.name ?? "ese producto"}" — quedan ${stock}, el pedido tiene ${quantity}.`,
    });
  }
}

const NOTIFICATION_MESSAGES = {
  LISTO: "¡Hola! Tu pedido ya está listo para retirar por el local. Te esperamos 😊",
  EN_CAMINO: "¡Hola! Tu pedido ya salió con el cadete, en breve llega a tu casa 🛵",
} as const;

export const ordersRouter = router({
  // Los cancelados y los ya entregados no aparecen en el tablero de ventas
  // (quedan afuera de la vista, no se borran de la base) — el detalle sigue
  // accesible por link directo, y lo entregado pasa a contar en el
  // Dashboard/Reportes en vez de seguir ocupando la vista de "en curso".
  list: requirePermission("orders:read")
    .input(z.object({ sucursalId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const sucursalId = resolveSucursalFilter(ctx.user, input?.sucursalId);
      const orders = await ctx.prisma.order.findMany({
        where: {
          status: { notIn: ["CANCELADO", "ENTREGADO"] },
          ...(sucursalId ? { sucursalId } : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
          customer: true,
          sucursal: true,
          _count: { select: { items: true } },
          payments: { select: { status: true } },
        },
      });
      return orders.map(toNumber);
    }),

  getById: requirePermission("orders:read")
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const order = await ctx.prisma.order.findUnique({
        where: { id: input.id },
        include: {
          customer: true,
          sucursal: true,
          items: { include: { product: true, promotion: true } },
          invoice: true,
          payments: true,
        },
      });
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.sucursalId && order.sucursalId !== ctx.user.sucursalId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return {
        ...toNumber(order),
        items: order.items.map((item) => ({ ...item, unitPrice: Number(item.unitPrice) })),
      };
    }),

  // Limpia el aviso "!" de modificado-por-el-cliente al abrir el detalle —
  // no es una escritura de negocio real, solo "ya lo vi", por eso alcanza
  // con orders:read en vez de orders:write.
  acknowledgeChanges: requirePermission("orders:read")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.orderItem.updateMany({
        where: { orderId: input.id, addedByCustomerAt: { not: null } },
        data: { addedByCustomerAt: null },
      });
      const order = await ctx.prisma.order.update({
        where: { id: input.id },
        data: { modifiedByCustomerAt: null },
      });
      return toNumber(order);
    }),

  // Observación interna (no se imprime, no tiene que ver con los
  // productos) — pensada para dejar constancia de cosas como "cliente
  // canceló por demora" cuando Cajero no puede cancelar la venta él mismo,
  // o anotar a mano una hora de retiro. Reemplaza el texto entero cada vez
  // (se confirma con el tilde en la UI, no se va acumulando como `notes`).
  updateStaffNotes: requirePermission("orders:write")
    .input(z.object({ id: z.string(), staffNotes: z.string().trim().max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.prisma.order.update({
        where: { id: input.id },
        data: { staffNotes: input.staffNotes || null },
      });
      return toNumber(order);
    }),

  // Cambiar el método de pago de un pedido ya creado — ej. el cliente dijo
  // que pagaba en efectivo al cargar la venta y terminó pagando con QR/MP.
  // Solo mientras el pedido siga en un estado modificable (ver isModifiable
  // en create-order.ts). El vuelto (changeFor) se limpia si deja de ser
  // efectivo; para efectivo no se pide acá, se puede anotar aparte.
  updatePayment: requirePermission("orders:write")
    .input(z.object({ id: z.string(), method: z.enum(paymentMethodValues) }))
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.prisma.order.findUnique({ where: { id: input.id } });
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });

      const allowedMethods = getAllowedPaymentMethods(order.channel, order.channelSource ?? undefined);
      if (!allowedMethods.includes(input.method)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Ese método de pago no corresponde a este canal.",
        });
      }

      const updated = await updatePendingOrderPayment(input.id, {
        method: input.method,
        changeFor: input.method === "EFECTIVO" ? undefined : null,
      });
      if (!updated) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Este pedido ya no se puede modificar (ya está en preparación o ya salió).",
        });
      }
      return toNumber(updated);
    }),

  // Aplica, cambia o saca (discountType: null) un descuento manual sobre un
  // pedido ya cargado — recalcula el total de cero a partir de los
  // renglones actuales, así queda bien sin importar qué se haya
  // agregado/sacado antes. Nunca la usa el asistente de WhatsApp.
  applyDiscount: requirePermission("orders:write")
    .input(
      z.object({
        id: z.string(),
        discountType: z.enum(["PORCENTAJE", "MONTO_FIJO"]).nullable(),
        discountValue: z.coerce.number().positive().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const discount =
        input.discountType && input.discountValue
          ? { type: input.discountType, value: input.discountValue }
          : null;
      const updated = await applyDiscount(input.id, discount);
      if (!updated) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Este pedido ya no se puede modificar (ya está en preparación o ya salió).",
        });
      }
      return toNumber(updated);
    }),

  create: requirePermission("orders:write")
    .input(orderInputSchema)
    .mutation(async ({ ctx, input }) => {
      const allowedMethods = getAllowedPaymentMethods(input.channel, input.channelSource);
      if (!allowedMethods.includes(input.method)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Ese método de pago no corresponde a este canal.",
        });
      }

      // Solo Mostrador admite venta sin cliente cargado (walk-in) — se
      // resuelve a un cliente genérico compartido. Delivery/Apps siguen
      // necesitando uno real (hay que saber a quién/dónde enviar).
      let customerId = input.customerId;
      if (!customerId) {
        if (input.channel !== "MOSTRADOR") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Elegí un cliente para este pedido." });
        }
        customerId = (await getOrCreateWalkInCustomer(ctx.prisma)).id;
      }

      const sucursalId = resolveSucursalForWrite(ctx.user, input.sucursalId);
      await assertStockAvailable(ctx.prisma, input.items, sucursalId);
      const order = await createOrder({ ...input, customerId, sucursalId, employeeId: ctx.user.id });
      return toNumber(order);
    }),

  // Edición manual desde el CRM (botón "Editar pedido" en el detalle) —
  // agrega un renglón a un pedido ya creado (producto suelto, promo, o
  // mitad y mitad — misma forma que crear un pedido nuevo), mientras siga
  // en un estado modificable (ver isModifiable en create-order.ts).
  // Reconcilia promos después por si la combinación resultante arma una,
  // igual que hace el asistente de WhatsApp.
  addItems: requirePermission("orders:write")
    .input(z.object({ orderId: z.string(), items: z.array(orderItemInputSchema).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.prisma.order.findUnique({ where: { id: input.orderId } });
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      await assertStockAvailable(ctx.prisma, input.items, order.sucursalId);

      const updated = await addItemsToOrder(input.orderId, input.items);
      if (!updated) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Este pedido ya no se puede modificar (ya está en preparación o ya salió).",
        });
      }
      const reconciled = (await reconcilePromotions(updated.id)) ?? updated;
      return toNumber(reconciled);
    }),

  // Saca un renglón ENTERO de un pedido ya creado (producto suelto, promo,
  // o mitad y mitad) — nunca puede dejarlo sin ningún renglón (eso
  // equivale a cancelarlo, y para eso está el botón Cancelar venta): se
  // valida ANTES de tocar nada, contando cuántos renglones quedarían.
  removeItemRow: requirePermission("orders:write")
    .input(z.object({ orderId: z.string(), orderItemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentCount = await ctx.prisma.orderItem.count({ where: { orderId: input.orderId } });
      if (currentCount <= 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No podés sacar el único producto del pedido — eso lo dejaría vacío. Para cancelarlo, usá el botón Cancelar venta.",
        });
      }

      const updated = await removeOrderItemRow(input.orderId, input.orderItemId);
      if (!updated) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Este pedido ya no se puede modificar (ya está en preparación o ya salió).",
        });
      }
      return toNumber(updated);
    }),

  // CANCELADO queda afuera a propósito: pasar por acá dejaría cancelar una
  // venta a cualquiera con orders:write (ej. Cajero), esquivando el
  // permiso más estricto de orders:cancel — para eso está la mutation
  // `cancel` dedicada, más abajo.
  updateStatus: requirePermission("orders:write")
    .input(orderStatusUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.status === "CANCELADO") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Para cancelar una venta usá el botón Cancelar venta, no este selector.",
        });
      }

      const current = await ctx.prisma.order.findUnique({ where: { id: input.id } });
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });

      // Pago múltiple no se confirma acá: hay que cargar cómo se repartió
      // entre los medios de pago primero (ver recordSplitPayment), que ya
      // deja el pedido en ENTREGADO como parte de esa misma mutation.
      if (input.status === "ENTREGADO" && current.paymentMode === "MULTIPLE") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Este pedido es de pago múltiple — cargá cómo se repartió el pago para marcarlo entregado.",
        });
      }

      const order = await ctx.prisma.order.update({
        where: { id: input.id },
        data: { status: input.status },
      });

      return toNumber(order);
    }),

  // Pago simple (un solo método) vs. múltiple (se reparte entre varios al
  // marcar el pedido entregado, ver recordSplitPayment).
  setPaymentMode: requirePermission("orders:write")
    .input(z.object({ id: z.string(), paymentMode: z.enum(["SIMPLE", "MULTIPLE"]) }))
    .mutation(async ({ input }) => {
      const updated = await setPaymentMode(input.id, input.paymentMode);
      if (!updated) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este pedido ya no se puede modificar." });
      }
      return toNumber(updated);
    }),

  // Carga los montos de cada medio de pago (tienen que sumar exacto el
  // total) y marca el pedido ENTREGADO en el mismo paso.
  recordSplitPayment: requirePermission("orders:write")
    .input(
      z.object({
        id: z.string(),
        payments: z
          .array(z.object({ method: z.enum(paymentMethodValues), amount: z.coerce.number().positive() }))
          .min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const result = await recordSplitPayment(input.id, input.payments);
      if (result === null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este pedido ya no se puede modificar." });
      }
      if (result === "MISMATCH") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Los montos cargados no suman el total del pedido.",
        });
      }
      return toNumber(result);
    }),

  // Marca que la comanda ya se imprimió al menos una vez — apaga el resalte
  // de "pedido por WhatsApp todavía no visto" en Ventas, y de paso confirma
  // el pedido (PENDIENTE -> CONFIRMADO): imprimir la comanda es la señal de
  // que alguien del local ya lo vio y lo está preparando, sea que haya
  // entrado por WhatsApp o se haya cargado a mano. Idempotente: no pisa la
  // hora ni el status de nuevo si ya se había marcado antes (ej. reimprimir).
  markComandaPrinted: requirePermission("orders:write")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.prisma.order.findUnique({ where: { id: input.id } });
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });
      if (current.comandaPrintedAt) return toNumber(current);

      const order = await ctx.prisma.order.update({
        where: { id: input.id },
        data: {
          comandaPrintedAt: new Date(),
          status: current.status === "PENDIENTE" ? "CONFIRMADO" : current.status,
        },
      });
      return toNumber(order);
    }),

  cancel: requirePermission("orders:cancel")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const order = await cancelOrder(input.id);
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      return toNumber(order);
    }),

  notifyStatus: requirePermission("orders:write")
    .input(z.object({ orderId: z.string(), kind: z.enum(["LISTO", "EN_CAMINO"]) }))
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.prisma.order.findUnique({
        where: { id: input.orderId },
        include: { customer: true },
      });
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });

      const content = NOTIFICATION_MESSAGES[input.kind];

      let whatsappMessageId: string;
      try {
        whatsappMessageId = await sendWhatsappTextMessage(order.customer.whatsapp, content, order.sucursalId);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "No se pudo enviar el WhatsApp.",
        });
      }

      let conversation = await ctx.prisma.conversation.findFirst({
        where: { customerId: order.customerId, sucursalId: order.sucursalId, status: { not: "CERRADA" } },
        orderBy: { lastMessageAt: "desc" },
      });
      if (!conversation) {
        conversation = await ctx.prisma.conversation.create({
          data: { customerId: order.customerId, sucursalId: order.sucursalId, status: "ABIERTA", aiActive: true },
        });
      }

      await ctx.prisma.message.create({
        data: {
          conversationId: conversation.id,
          sender: "IA",
          content,
          type: "TEXTO",
          approved: true,
          whatsappMessageId: whatsappMessageId || undefined,
        },
      });
      await ctx.prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      });

      return { ok: true };
    }),
});
