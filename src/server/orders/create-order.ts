import { TRPCError } from "@trpc/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { OrderInput } from "@/lib/validation/order";

type OrderItemInput = OrderInput["items"][number];

// Costo fijo de envío, se suma al total de todo pedido con channel=DELIVERY.
// Vive acá (no en create-order-tool.ts) porque tanto la creación como el
// cambio de canal de un pedido existente lo necesitan.
export const DELIVERY_FEE = 3500;

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

    // `id: { in: [...] }` dedupe repetidos (ej. 2x el mismo sabor) — por eso
    // se consulta por ids únicos y se valida contra ese set, no contra la
    // cantidad de productIds pedidos.
    const uniqueIds = [...new Set(selection.productIds)];
    const chosenProducts = await tx.product.findMany({
      where: { id: { in: uniqueIds } },
    });
    if (chosenProducts.length !== uniqueIds.length) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Producto elegido no encontrado." });
    }
    const productById = new Map(chosenProducts.map((product) => [product.id, product]));
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
        nombre: productById.get(id)?.name ?? "",
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
  // Solo tiene sentido cuando channel = DELIVERY.
  shippingAddress?: string;
  deliveryFee?: number;
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

    const deliveryFee = input.channel === "DELIVERY" ? (input.deliveryFee ?? DELIVERY_FEE) : undefined;
    total += deliveryFee ?? 0;

    return tx.order.create({
      data: {
        customerId: input.customerId,
        method: input.method,
        channel: input.channel,
        channelSource: input.channel === "APPS" ? input.channelSource : undefined,
        status: "PENDIENTE",
        total,
        changeFor: input.changeFor,
        shippingAddress: input.channel === "DELIVERY" ? input.shippingAddress : undefined,
        deliveryFee,
        employeeId: input.employeeId,
        items: { createMany: { data: itemsData } },
        invoice: { create: { type: "INTERNO", status: "EMITIDO" } },
      },
    });
  });
}

// Permite sumar productos/promos a un pedido que el cliente ya hizo, mientras
// siga PENDIENTE (todavía no salió el cadete ni se marcó en preparación) —
// pensado para cuando el cliente por WhatsApp pide agregar algo a último
// momento. Devuelve null si el pedido ya no está en un estado modificable.
export async function addItemsToOrder(orderId: string, items: OrderInput["items"]) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.status !== "PENDIENTE") return null;

    let addedTotal = 0;
    const itemsData: Prisma.OrderItemCreateManyOrderInput[] = [];
    for (const item of items) {
      const resolved = await resolveOrderItem(tx, item);
      addedTotal += resolved.price;
      itemsData.push(resolved.data);
    }

    await tx.orderItem.createMany({
      data: itemsData.map((data) => ({ ...data, orderId })),
    });

    return tx.order.update({
      where: { id: orderId },
      data: { total: Number(order.total) + addedTotal },
    });
  });
}

// Cambia método de pago y/o el dato de vuelto de un pedido PENDIENTE (ej. el
// cliente decide pagar por transferencia en vez de efectivo). Devuelve null
// si el pedido ya no está en un estado modificable.
export async function updatePendingOrderPayment(
  orderId: string,
  data: { method?: OrderInput["method"]; changeFor?: number | null },
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "PENDIENTE") return null;

  return prisma.order.update({
    where: { id: orderId },
    data: {
      method: data.method ?? order.method,
      changeFor: data.changeFor,
    },
  });
}

// Cambia MOSTRADOR<->DELIVERY (o solo la dirección) de un pedido PENDIENTE —
// ej. el cliente pidió retirar y después decide que se lo enviemos. Ajusta
// el total sumando o restando el costo fijo de envío según corresponda.
// Devuelve null si el pedido ya no está en un estado modificable.
export async function updatePendingOrderChannel(
  orderId: string,
  data: { channel: "MOSTRADOR" | "DELIVERY"; shippingAddress?: string },
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.status !== "PENDIENTE") return null;

    const previousFee = Number(order.deliveryFee ?? 0);
    const newFee = data.channel === "DELIVERY" ? DELIVERY_FEE : 0;
    const total = Number(order.total) - previousFee + newFee;

    return tx.order.update({
      where: { id: orderId },
      data: {
        channel: data.channel,
        deliveryFee: data.channel === "DELIVERY" ? newFee : null,
        shippingAddress: data.channel === "DELIVERY" ? (data.shippingAddress ?? order.shippingAddress) : null,
        total,
      },
    });
  });
}
