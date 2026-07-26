import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  supplyInputSchema,
  supplyMovementInputSchema,
  supplyUpdateSchema,
} from "@/lib/validation/supply";
import { requirePermission, router } from "@/server/trpc/trpc";
import { resolveSucursalFilter, resolveSucursalForWrite } from "@/server/trpc/sucursal";

function assertSucursalAccess(user: { sucursalId: string | null }, supplySucursalId: string) {
  if (user.sucursalId && user.sucursalId !== supplySucursalId) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
}

export const suppliesRouter = router({
  // Incluye a qué categoría de producto pertenece cada insumo (vía la
  // receta en ProductSupplyUsage) para que la pantalla de Stock pueda
  // agrupar empanadas primero y el resto (prepizzas, insumos sueltos)
  // después. Sin sucursal resuelta (ej. Productor, que ve ambas a la vez)
  // trae todo junto, con la sucursal de cada renglón incluida.
  list: requirePermission("stock:read")
    .input(z.object({ search: z.string().trim().optional(), sucursalId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const sucursalId = resolveSucursalFilter(ctx.user, input?.sucursalId);
      return ctx.prisma.supply.findMany({
        where: {
          ...(sucursalId ? { sucursalId } : {}),
          ...(input?.search ? { name: { contains: input.search, mode: "insensitive" } } : {}),
        },
        orderBy: { name: "asc" },
        include: {
          sucursal: true,
          productUsages: { include: { product: { include: { category: true } } } },
        },
      });
    }),

  getById: requirePermission("stock:read")
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const supply = await ctx.prisma.supply.findUnique({
        where: { id: input.id },
        include: { sucursal: true, movements: { orderBy: { createdAt: "desc" }, take: 20 } },
      });
      if (!supply) throw new TRPCError({ code: "NOT_FOUND" });
      assertSucursalAccess(ctx.user, supply.sucursalId);
      return supply;
    }),

  create: requirePermission("stock:write")
    .input(supplyInputSchema.extend({ sucursalId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const sucursalId = resolveSucursalForWrite(ctx.user, input.sucursalId);

      const existing = await ctx.prisma.supply.findUnique({
        where: { name_sucursalId: { name: input.name, sucursalId } },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Ya existe un insumo con ese nombre en esta sucursal.",
        });
      }

      return ctx.prisma.$transaction(async (tx) => {
        const supply = await tx.supply.create({
          data: {
            name: input.name,
            sucursalId,
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
      const current = await ctx.prisma.supply.findUnique({ where: { id } });
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });
      assertSucursalAccess(ctx.user, current.sucursalId);
      return ctx.prisma.supply.update({ where: { id }, data });
    }),

  addMovement: requirePermission("stock:write")
    .input(supplyMovementInputSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const supply = await tx.supply.findUnique({ where: { id: input.supplyId } });
        if (!supply) throw new TRPCError({ code: "NOT_FOUND" });
        assertSucursalAccess(ctx.user, supply.sucursalId);

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

  // Suma cantidad a un insumo que ya existe (siempre ENTRADA) — pensado
  // para Repartidor, que solo puede sumar stock, nunca crear/editar
  // insumos ni sacar/ajustar cantidades (eso sigue siendo stock:write).
  restock: requirePermission("stock:add")
    .input(z.object({ supplyId: z.string(), quantity: z.coerce.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const supply = await tx.supply.findUnique({ where: { id: input.supplyId } });
        if (!supply) throw new TRPCError({ code: "NOT_FOUND" });
        assertSucursalAccess(ctx.user, supply.sucursalId);

        await tx.supply.update({
          where: { id: input.supplyId },
          data: { quantity: supply.quantity + input.quantity },
        });

        return tx.supplyMovement.create({
          data: {
            supplyId: input.supplyId,
            type: "ENTRADA",
            quantity: input.quantity,
            reason: "Reparto",
          },
        });
      });
    }),

  // Lista de compras rápida ("insumos faltantes"): cualquiera con acceso a
  // Stock puede anotar algo que se está por terminar, y tacharlo cuando ya
  // se compró. No pisa el modelo de Supply — es solo una nota.
  missingList: requirePermission("stock:read")
    .input(z.object({ sucursalId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const sucursalId = resolveSucursalFilter(ctx.user, input?.sucursalId);
      return ctx.prisma.missingSupplyItem.findMany({
        where: { resolvedAt: null, ...(sucursalId ? { sucursalId } : {}) },
        orderBy: { createdAt: "asc" },
        include: { sucursal: true },
      });
    }),

  // stock:reportMissing (no stock:write): el vendedor de cada sucursal
  // también puede anotar un faltante, sin poder crear/editar insumos.
  missingCreate: requirePermission("stock:reportMissing")
    .input(z.object({ text: z.string().trim().min(1).max(200), sucursalId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const sucursalId = resolveSucursalForWrite(ctx.user, input.sucursalId);
      return ctx.prisma.missingSupplyItem.create({ data: { text: input.text, sucursalId } });
    }),

  // stock:add (no stock:write): Repartidor también puede marcar un
  // faltante como ya llevado, sin poder anotar uno nuevo.
  missingResolve: requirePermission("stock:add")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.prisma.missingSupplyItem.findUnique({ where: { id: input.id } });
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });
      assertSucursalAccess(ctx.user, current.sucursalId);
      return ctx.prisma.missingSupplyItem.update({
        where: { id: input.id },
        data: { resolvedAt: new Date() },
      });
    }),
});
