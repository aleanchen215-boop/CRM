import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { orderInputSchema, orderStatusUpdateSchema } from "@/lib/validation/order";
import { requirePermission, router } from "@/server/trpc/trpc";

function toNumber<T extends { total: unknown }>(order: T) {
  return { ...order, total: Number(order.total) };
}

// Transiciones de estado y su efecto sobre el stock reservado/real.
// - CANCELADO libera la reserva, pero solo si el pedido no se había
//   despachado todavía (una devolución post-envío queda fuera del MVP).
// - ENVIADO "cumple" la reserva: descuenta stock real y genera el
//   movimiento de salida correspondiente.
const FULFILLED_STATUSES = new Set(["ENVIADO", "ENTREGADO"]);

export const ordersRouter = router({
  list: requirePermission("orders:read").query(async ({ ctx }) => {
    const orders = await ctx.prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      include: { customer: true, _count: { select: { items: true } } },
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
          items: { include: { product: true } },
          invoice: true,
          payments: true,
        },
      });
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });

      return {
        ...toNumber(order),
        items: order.items.map((item) => ({ ...item, unitPrice: Number(item.unitPrice) })),
      };
    }),

  create: requirePermission("orders:write")
    .input(orderInputSchema)
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.prisma.$transaction(async (tx) => {
        const productIds = input.items.map((item) => item.productId);
        const products = await tx.product.findMany({ where: { id: { in: productIds } } });

        const productById = new Map(products.map((product) => [product.id, product]));
        let total = 0;

        for (const item of input.items) {
          const product = productById.get(item.productId);
          if (!product) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Producto no encontrado." });
          }
          const available = product.stockActual - product.stockReservado;
          if (available < item.quantity) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Stock insuficiente para "${product.name}" (disponible: ${available}).`,
            });
          }
          total += Number(product.price) * item.quantity;
        }

        const created = await tx.order.create({
          data: {
            customerId: input.customerId,
            method: input.method,
            channel: input.channel,
            channelSource: input.channel === "APPS" ? input.channelSource : undefined,
            status: "PENDIENTE",
            total,
            employeeId: ctx.user.id,
            items: {
              create: input.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: productById.get(item.productId)!.price,
              })),
            },
            invoice: { create: { type: "INTERNO", status: "EMITIDO" } },
          },
        });

        for (const item of input.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stockReservado: { increment: item.quantity } },
          });
        }

        return created;
      });

      return toNumber(order);
    }),

  updateStatus: requirePermission("orders:write")
    .input(orderStatusUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.prisma.$transaction(async (tx) => {
        const current = await tx.order.findUnique({
          where: { id: input.id },
          include: { items: true },
        });
        if (!current) throw new TRPCError({ code: "NOT_FOUND" });

        if (current.status === input.status) {
          return current;
        }

        if (input.status === "CANCELADO") {
          if (FULFILLED_STATUSES.has(current.status)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "El pedido ya fue despachado, no se puede cancelar (sería una devolución).",
            });
          }
          for (const item of current.items) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stockReservado: { decrement: item.quantity } },
            });
          }
        }

        // Al despachar se cumple la reserva: sale stock real y queda registrado el movimiento.
        // Se dispara al entrar a CUALQUIER estado "cumplido" (Enviado o Entregado) viniendo
        // de uno que no lo era — para no depender de que el pedido pase por Enviado primero.
        if (FULFILLED_STATUSES.has(input.status) && !FULFILLED_STATUSES.has(current.status)) {
          for (const item of current.items) {
            await tx.product.update({
              where: { id: item.productId },
              data: {
                stockActual: { decrement: item.quantity },
                stockReservado: { decrement: item.quantity },
              },
            });
            await tx.stockMovement.create({
              data: {
                productId: item.productId,
                type: "SALIDA",
                quantity: item.quantity,
                reason: "Despacho de pedido",
                orderId: current.id,
              },
            });
          }
        }

        return tx.order.update({ where: { id: input.id }, data: { status: input.status } });
      });

      return toNumber(order);
    }),
});
