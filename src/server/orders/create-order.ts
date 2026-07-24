import { TRPCError } from "@trpc/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { OrderInput } from "@/lib/validation/order";

type OrderItemInput = OrderInput["items"][number];

async function resolveOrderItem(
  tx: Prisma.TransactionClient,
  item: OrderItemInput,
): Promise<{ data: Prisma.OrderItemCreateManyOrderInput; price: number }> {
  if (item.kind === "PRODUCTO") {
    const product = await tx.product.findUnique({ where: { id: item.productId } });
    if (!product) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Producto no encontrado." });
    }
    return {
      data: { productId: product.id, quantity: item.quantity, unitPrice: product.price },
      price: Number(product.price) * item.quantity,
    };
  }

  const promotion = await tx.promotion.findUnique({
    where: { id: item.promotionId },
    include: { items: { include: { product: true, category: true } } },
  });
  if (!promotion) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Promoción no encontrada." });
  }

  const selections: Array<Record<string, unknown>> = [];

  for (const promoItem of promotion.items) {
    if (promoItem.kind === "FIJO") {
      selections.push({
        type: "FIJO",
        productId: promoItem.productId,
        nombre: promoItem.product?.name ?? "Producto",
        cantidad: promoItem.quantity,
      });
      continue;
    }

    const selection = item.variableSelections.find((s) => s.promotionItemId === promoItem.id);
    if (!selection || selection.productIds.length !== promoItem.quantity) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Faltan elegir ${promoItem.quantity} unidad(es) de "${promoItem.category?.name ?? "una categoría"}" en la promo "${promotion.name}".`,
      });
    }

    const chosenProducts = await tx.product.findMany({
      where: { id: { in: selection.productIds } },
    });
    if (chosenProducts.length !== selection.productIds.length) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Producto elegido no encontrado." });
    }
    const invalid = chosenProducts.find((product) => product.categoryId !== promoItem.categoryId);
    if (invalid) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `"${invalid.name}" no pertenece a la categoría "${promoItem.category?.name ?? ""}" que pide la promo.`,
      });
    }

    selections.push({
      type: "VARIABLE",
      categoria: promoItem.category?.name ?? "",
      productos: selection.productIds.map((id) => ({
        productId: id,
        nombre: chosenProducts.find((p) => p.id === id)?.name ?? "",
      })),
    });
  }

  return {
    data: {
      promotionId: promotion.id,
      quantity: 1,
      unitPrice: promotion.price,
      selections: selections as Prisma.InputJsonValue,
    },
    price: Number(promotion.price),
  };
}

export type CreateOrderInput = OrderInput & {
  employeeId?: string;
  changeFor?: number;
};

// Compartido entre el router de tRPC (alta manual) y el asistente de IA
// (alta por WhatsApp) — misma validación, mismos efectos, un solo lugar.
export async function createOrder(input: CreateOrderInput) {
  return prisma.$transaction(async (tx) => {
    let total = 0;
    const itemsData: Prisma.OrderItemCreateManyOrderInput[] = [];

    for (const item of input.items) {
      const resolved = await resolveOrderItem(tx, item);
      total += resolved.price;
      itemsData.push(resolved.data);
    }

    return tx.order.create({
      data: {
        customerId: input.customerId,
        method: input.method,
        channel: input.channel,
        channelSource: input.channel === "APPS" ? input.channelSource : undefined,
        status: "PENDIENTE",
        total,
        changeFor: input.changeFor,
        employeeId: input.employeeId,
        items: { createMany: { data: itemsData } },
        invoice: { create: { type: "INTERNO", status: "EMITIDO" } },
      },
    });
  });
}
