import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  supplyInputSchema,
  supplyMovementInputSchema,
  supplyUpdateSchema,
} from "@/lib/validation/supply";
import { requirePermission, router } from "@/server/trpc/trpc";

export const suppliesRouter = router({
  list: requirePermission("stock:read")
    .input(z.object({ search: z.string().trim().optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.supply.findMany({
        where: input.search
          ? { name: { contains: input.search, mode: "insensitive" } }
          : {},
        orderBy: { name: "asc" },
      });
    }),

  getById: requirePermission("stock:read")
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const supply = await ctx.prisma.supply.findUnique({
        where: { id: input.id },
        include: { movements: { orderBy: { createdAt: "desc" }, take: 20 } },
      });
      if (!supply) throw new TRPCError({ code: "NOT_FOUND" });
      return supply;
    }),

  create: requirePermission("stock:write")
    .input(supplyInputSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.supply.findUnique({ where: { name: input.name } });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Ya existe un insumo con ese nombre." });
      }

      return ctx.prisma.$transaction(async (tx) => {
        const supply = await tx.supply.create({
          data: {
            name: input.name,
            unit: input.unit,
            stockMinimo: input.stockMinimo,
            stockIdeal: input.stockIdeal,
            quantity: input.initialQuantity,
          },
        });

        if (input.initialQuantity > 0) {
          await tx.supplyMovement.create({
            data: {
              supplyId: supply.id,
              type: "ENTRADA",
              quantity: input.initialQuantity,
              reason: "Carga inicial",
            },
          });
        }

        return supply;
      });
    }),

  update: requirePermission("stock:write")
    .input(z.object({ id: z.string() }).merge(supplyUpdateSchema))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.supply.update({ where: { id }, data });
    }),

  addMovement: requirePermission("stock:write")
    .input(supplyMovementInputSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const supply = await tx.supply.findUnique({ where: { id: input.supplyId } });
        if (!supply) throw new TRPCError({ code: "NOT_FOUND" });

        let newQuantity: number;
        let movementQuantity: number;

        if (input.type === "ENTRADA") {
          movementQuantity = input.quantity;
          newQuantity = supply.quantity + input.quantity;
        } else if (input.type === "SALIDA") {
          if (supply.quantity - input.quantity < 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "No hay suficiente cantidad disponible." });
          }
          movementQuantity = input.quantity;
          newQuantity = supply.quantity - input.quantity;
        } else {
          // AJUSTE: la cantidad ingresada es la nueva cantidad total.
          newQuantity = input.quantity;
          movementQuantity = input.quantity - supply.quantity;
        }

        await tx.supply.update({ where: { id: input.supplyId }, data: { quantity: newQuantity } });

        return tx.supplyMovement.create({
          data: {
            supplyId: input.supplyId,
            type: input.type,
            quantity: movementQuantity,
            reason: input.reason,
          },
        });
      });
    }),
});
