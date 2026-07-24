import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { orderInputSchema, orderStatusUpdateSchema } from "@/lib/validation/order";
import { requirePermission, router } from "@/server/trpc/trpc";

function toNumber<T extends { total: unknown }>(order: T) {
  return { ...order, total: Number(order.total) };
}

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
          total += Number(product.price) * item.quantity;
        }

        return tx.order.create({
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
      });

      return toNumber(order);
    }),

  updateStatus: requirePermission("orders:write")
    .input(orderStatusUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.prisma.order.findUnique({ where: { id: input.id } });
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });

      const order = await ctx.prisma.order.update({
        where: { id: input.id },
        data: { status: input.status },
      });

      return toNumber(order);
    }),
});
