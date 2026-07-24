import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { promotionInputSchema, promotionUpdateSchema } from "@/lib/validation/promotion";
import { requirePermission, router } from "@/server/trpc/trpc";

function toNumber<T extends { price: unknown }>(promotion: T) {
  return { ...promotion, price: Number(promotion.price) };
}

export const promotionsRouter = router({
  list: requirePermission("products:read").query(async ({ ctx }) => {
    const promotions = await ctx.prisma.promotion.findMany({
      orderBy: { name: "asc" },
      include: { items: { include: { product: true, category: true } } },
    });
    return promotions.map(toNumber);
  }),

  getById: requirePermission("products:read")
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const promotion = await ctx.prisma.promotion.findUnique({
        where: { id: input.id },
        include: { items: { include: { product: true, category: true } } },
      });
      if (!promotion) throw new TRPCError({ code: "NOT_FOUND" });
      return toNumber(promotion);
    }),

  create: requirePermission("products:write")
    .input(promotionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const promotion = await ctx.prisma.promotion.create({
        data: {
          name: input.name,
          price: input.price,
          items: {
            create: input.items.map((item) => ({
              kind: item.kind,
              quantity: item.quantity,
              productId: item.kind === "FIJO" ? item.productId : undefined,
              categoryId: item.kind === "VARIABLE" ? item.categoryId : undefined,
            })),
          },
        },
      });
      return toNumber(promotion);
    }),

  update: requirePermission("products:write")
    .input(promotionUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, items, ...data } = input;

      const promotion = await ctx.prisma.$transaction(async (tx) => {
        if (items) {
          await tx.promotionItem.deleteMany({ where: { promotionId: id } });
        }

        return tx.promotion.update({
          where: { id },
          data: {
            ...data,
            ...(items
              ? {
                  items: {
                    create: items.map((item) => ({
                      kind: item.kind,
                      quantity: item.quantity,
                      productId: item.kind === "FIJO" ? item.productId : undefined,
                      categoryId: item.kind === "VARIABLE" ? item.categoryId : undefined,
                    })),
                  },
                }
              : {}),
          },
        });
      });

      return toNumber(promotion);
    }),

  delete: requirePermission("products:write")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.promotion.delete({ where: { id: input.id } });
      return { ok: true };
    }),
});
