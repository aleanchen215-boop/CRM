import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { productInputSchema, productUpdateSchema } from "@/lib/validation/product";
import { requirePermission, router } from "@/server/trpc/trpc";
import { getAvailableStock } from "@/server/stock/availability";

function toNumber(product: { cost: unknown; price: unknown; priceApps: unknown }) {
  return { cost: Number(product.cost), price: Number(product.price), priceApps: Number(product.priceApps) };
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
  categories: requirePermission("products:read").query(async ({ ctx }) => {
    return ctx.prisma.productCategory.findMany({ orderBy: { name: "asc" } });
  }),

  list: requirePermission("products:read")
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

  // Cuánto queda de cada sabor con receta cargada (ProductSupplyUsage) en
  // esta sucursal — lo usa el formulario de "Nuevo pedido"/"Editar pedido"
  // para no dejar agregar a la venta un sabor sin stock. Productos sin
  // receta no aparecen en el resultado (sin tope conocido).
  availableStock: requirePermission("products:read")
    .input(z.object({ sucursalId: z.string() }))
    .query(async ({ ctx, input }) => {
      const products = await ctx.prisma.product.findMany({ select: { id: true } });
      const stock = await getAvailableStock(products.map((p) => p.id), input.sucursalId);
      return Object.fromEntries(stock);
    }),

  getById: requirePermission("products:read")
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const product = await ctx.prisma.product.findUnique({
        where: { id: input.id },
        include: { category: true, supplier: true },
      });

      if (!product) throw new TRPCError({ code: "NOT_FOUND" });

      return { ...product, ...toNumber(product) };
    }),

  create: requirePermission("products:write")
    .input(productInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.sku) {
        const existing = await ctx.prisma.product.findUnique({ where: { sku: input.sku } });
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Ya existe un producto con ese SKU." });
        }
      }

      const product = await ctx.prisma.$transaction(async (tx) => {
        const [categoryId, supplierId] = await Promise.all([
          resolveCategoryId(tx, input.category),
          resolveSupplierId(tx, input.supplier),
        ]);

        return tx.product.create({
          data: {
            sku: input.sku || undefined,
            internalCode: input.internalCode || undefined,
            name: input.name,
            categoryId,
            supplierId,
            cost: input.cost,
            price: input.price,
            priceApps: input.priceApps,
            ingredients: input.ingredients || undefined,
          },
        });
      });

      return { ...product, ...toNumber(product) };
    }),

  update: requirePermission("products:write")
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
            sku: data.sku || null,
            internalCode: data.internalCode || undefined,
            ...(categoryId ? { categoryId } : {}),
            ...(supplierId ? { supplierId } : {}),
          },
        });
      });

      return { ...product, ...toNumber(product) };
    }),
});
