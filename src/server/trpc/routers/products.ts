import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import {
  productInputSchema,
  productUpdateSchema,
  stockMovementInputSchema,
} from "@/lib/validation/product";
import { requirePermission, router } from "@/server/trpc/trpc";

function toNumber(product: { cost: unknown; price: unknown }) {
  return { cost: Number(product.cost), price: Number(product.price) };
}

// Categoría y proveedor se cargan como texto libre en el form; acá se
// resuelven a un registro existente o se crean si son nuevos.
async function resolveCategoryId(tx: Prisma.TransactionClient, name?: string) {
  if (!name) return undefined;
  const category = await tx.productCategory.upsert({
    where: { name },
    create: { name },
    update: {},
  });
  return category.id;
}

async function resolveSupplierId(tx: Prisma.TransactionClient, name?: string) {
  if (!name) return undefined;
  const existing = await tx.supplier.findFirst({ where: { name } });
  if (existing) return existing.id;
  const created = await tx.supplier.create({ data: { name } });
  return created.id;
}

export const productsRouter = router({
  list: requirePermission("stock:read")
    .input(z.object({ search: z.string().trim().optional() }))
    .query(async ({ ctx, input }) => {
      const where: Prisma.ProductWhereInput = input.search
        ? {
            OR: [
              { name: { contains: input.search, mode: "insensitive" } },
              { sku: { contains: input.search, mode: "insensitive" } },
            ],
          }
        : {};

      const products = await ctx.prisma.product.findMany({
        where,
        orderBy: { name: "asc" },
        include: { category: true, supplier: true },
      });

      return products.map((product) => ({ ...product, ...toNumber(product) }));
    }),

  getById: requirePermission("stock:read")
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const product = await ctx.prisma.product.findUnique({
        where: { id: input.id },
        include: {
          category: true,
          supplier: true,
          movements: { orderBy: { createdAt: "desc" }, take: 20 },
        },
      });

      if (!product) throw new TRPCError({ code: "NOT_FOUND" });

      return { ...product, ...toNumber(product) };
    }),

  create: requirePermission("stock:write")
    .input(productInputSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.product.findUnique({ where: { sku: input.sku } });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Ya existe un producto con ese SKU." });
      }

      const product = await ctx.prisma.$transaction(async (tx) => {
        const [categoryId, supplierId] = await Promise.all([
          resolveCategoryId(tx, input.category),
          resolveSupplierId(tx, input.supplier),
        ]);

        const created = await tx.product.create({
          data: {
            sku: input.sku,
            internalCode: input.internalCode || undefined,
            name: input.name,
            categoryId,
            supplierId,
            cost: input.cost,
            price: input.price,
            stockMinimo: input.stockMinimo,
            stockIdeal: input.stockIdeal,
            location: input.location,
            stockActual: input.initialStock,
          },
        });

        if (input.initialStock > 0) {
          await tx.stockMovement.create({
            data: {
              productId: created.id,
              type: "ENTRADA",
              quantity: input.initialStock,
              reason: "Carga inicial",
            },
          });
        }

        return created;
      });

      return { ...product, ...toNumber(product) };
    }),

  update: requirePermission("stock:write")
    .input(z.object({ id: z.string() }).merge(productUpdateSchema))
    .mutation(async ({ ctx, input }) => {
      const { id, category, supplier, ...data } = input;

      const product = await ctx.prisma.$transaction(async (tx) => {
        const [categoryId, supplierId] = await Promise.all([
          resolveCategoryId(tx, category),
          resolveSupplierId(tx, supplier),
        ]);

        return tx.product.update({
          where: { id },
          data: {
            ...data,
            internalCode: data.internalCode || undefined,
            ...(categoryId ? { categoryId } : {}),
            ...(supplierId ? { supplierId } : {}),
          },
        });
      });

      return { ...product, ...toNumber(product) };
    }),

  addMovement: requirePermission("stock:write")
    .input(stockMovementInputSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const product = await tx.product.findUnique({ where: { id: input.productId } });
        if (!product) throw new TRPCError({ code: "NOT_FOUND" });

        let newStock: number;
        let movementQuantity: number;

        if (input.type === "ENTRADA") {
          movementQuantity = input.quantity;
          newStock = product.stockActual + input.quantity;
        } else if (input.type === "SALIDA") {
          if (product.stockActual - input.quantity < 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Stock insuficiente." });
          }
          movementQuantity = input.quantity;
          newStock = product.stockActual - input.quantity;
        } else {
          // AJUSTE: la cantidad ingresada es el nuevo stock total.
          newStock = input.quantity;
          movementQuantity = input.quantity - product.stockActual;
        }

        await tx.product.update({ where: { id: input.productId }, data: { stockActual: newStock } });

        return tx.stockMovement.create({
          data: {
            productId: input.productId,
            type: input.type,
            quantity: movementQuantity,
            reason: input.reason,
          },
        });
      });
    }),
});
