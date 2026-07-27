import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { orderInputSchema, orderItemInputSchema, orderStatusUpdateSchema, getAllowedPaymentMethods } from "@/lib/validation/order";
import { requirePermission, router } from "@/server/trpc/trpc";
import { resolveSucursalFilter, resolveSucursalForWrite } from "@/server/trpc/sucursal";
import { sendWhatsappTextMessage } from "@/server/integrations/whatsapp/client";
import { createOrder, addItemsToOrder, removeOrderItemRow, reconcilePromotions } from "@/server/orders/create-order";

function toNumber<T extends { total: unknown }>(order: T) {
  return { ...order, total: Number(order.total) };
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

      const sucursalId = resolveSucursalForWrite(ctx.user, input.sucursalId);
      const order = await createOrder({ ...input, sucursalId, employeeId: ctx.user.id });
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
    .mutation(async ({ input }) => {
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

      const order = await ctx.prisma.order.update({
        where: { id: input.id },
        data: { status: input.status },
      });

      return toNumber(order);
    }),

  // Marca que la comanda ya se imprimió al menos una vez — apaga el resalte
  // de "pedido por WhatsApp todavía no visto" en Ventas. Idempotente: no
  // pisa la hora si ya se había marcado antes (ej. reimprimir de nuevo).
  markComandaPrinted: requirePermission("orders:write")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.prisma.order.findUnique({ where: { id: input.id } });
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });
      if (current.comandaPrintedAt) return toNumber(current);

      const order = await ctx.prisma.order.update({
        where: { id: input.id },
        data: { comandaPrintedAt: new Date() },
      });
      return toNumber(order);
    }),

  cancel: requirePermission("orders:cancel")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.prisma.order.findUnique({ where: { id: input.id } });
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });

      const order = await ctx.prisma.order.update({
        where: { id: input.id },
        data: { status: "CANCELADO" },
      });

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
