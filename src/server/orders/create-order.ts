import { TRPCError } from "@trpc/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { OrderInput } from "@/lib/validation/order";

type OrderItemInput = OrderInput["items"][number];

// Costo fijo de envío, se suma al total de todo pedido con channel=DELIVERY.
// Vive acá (no en create-order-tool.ts) porque tanto la creación como el
// cambio de canal de un pedido existente lo necesitan.
export const DELIVERY_FEE = 3500;

// Un pedido se puede seguir tocando (agregar cosas, cambiar pago/canal)
// mientras siga PENDIENTE o ya CONFIRMADO — recién deja de poder tocarse
// cuando pasa a ENVIADO (salió el cadete) o más allá. Antes solo se permitía
// PENDIENTE, pero un pedido puede quedar CONFIRMADO casi al instante (ej. el
// mismo cliente lo marca "listo" en el panel) sin que eso signifique que ya
// es tarde para sumarle algo.
const MODIFIABLE_STATUSES = ["PENDIENTE", "CONFIRMADO"] as const;
function isModifiable(status: string): boolean {
  return (MODIFIABLE_STATUSES as readonly string[]).includes(status);
}

// Un renglón de pedido (producto suelto o promo) siempre se traduce a una
// lista de "productos reales x cantidad" a los efectos de descontar stock —
// para un producto suelto es él mismo; para una promo, los productos FIJOS y
// VARIABLES que la componen (una promo nunca consume su propio insumo, sino
// el de los productos que la arman).
type SupplyDeduction = { productId: string; quantity: number };

async function resolveOrderItem(
  tx: Prisma.TransactionClient,
  item: OrderItemInput,
): Promise<{ data: Prisma.OrderItemCreateManyOrderInput; price: number; deductions: SupplyDeduction[] }> {
  if (item.kind === "PRODUCTO") {
    const product = await tx.product.findUnique({ where: { id: item.productId } });
    if (!product) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Producto no encontrado." });
    }
    return {
      data: { productId: product.id, quantity: item.quantity, unitPrice: product.price },
      price: Number(product.price) * item.quantity,
      deductions: [{ productId: product.id, quantity: item.quantity }],
    };
  }

  if (item.kind === "MEDIA_MEDIA") {
    const product1 = await tx.product.findUnique({ where: { id: item.productId1 } });
    if (!product1) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Producto no encontrado para la media pizza." });
    }
    const product2 = item.productId2 ? await tx.product.findUnique({ where: { id: item.productId2 } }) : null;
    if (item.productId2 && !product2) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Producto no encontrado para la media pizza." });
    }

    // Cada mitad sale (precio entero / 2) + $1.000. Con un solo sabor es
    // media pizza sola; con dos, es una mitad y mitad y el total es la suma
    // de las dos mitades: (precio1 + precio2) / 2 + $2.000.
    const unitPrice = product2
      ? Math.round((Number(product1.price) + Number(product2.price)) / 2 + 2000)
      : Math.round(Number(product1.price) / 2 + 1000);

    const productos = product2
      ? [
          { productId: product1.id, nombre: product1.name },
          { productId: product2.id, nombre: product2.name },
        ]
      : [{ productId: product1.id, nombre: product1.name }];

    return {
      data: {
        // Se ancla al primer producto por la FK — el detalle real de qué
        // sabor(es) lleva vive en `selections`, que es donde lo lee la UI y
        // el armado de la promo (que no debe contar esto como "1 pizza
        // entera").
        productId: product1.id,
        quantity: item.quantity,
        unitPrice,
        selections: [{ type: "MEDIA_MEDIA", productos }] as Prisma.InputJsonValue,
      },
      price: unitPrice * item.quantity,
      // Insumo se descuenta una sola vez por pizza física (no el doble) —
      // usa la receta del primer producto, que es la misma para cualquier
      // pizza (1 Prepizza + 1 Bolsas de Muzzarella).
      deductions: [{ productId: product1.id, quantity: item.quantity }],
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
  const deductions: SupplyDeduction[] = [];

  for (const promoItem of promotion.items) {
    if (promoItem.kind === "FIJO") {
      selections.push({
        type: "FIJO",
        productId: promoItem.productId,
        nombre: promoItem.product?.name ?? "Producto",
        cantidad: promoItem.quantity,
      });
      if (promoItem.productId) {
        deductions.push({ productId: promoItem.productId, quantity: promoItem.quantity });
      }
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
    for (const id of selection.productIds) {
      deductions.push({ productId: id, quantity: 1 });
    }
  }

  return {
    deductions,
    data: {
      promotionId: promotion.id,
      quantity: 1,
      unitPrice: promotion.price,
      selections: selections as Prisma.InputJsonValue,
    },
    price: Number(promotion.price),
  };
}

// Descuenta Stock según la receta cargada en ProductSupplyUsage (si el
// producto no tiene receta, no pasa nada — no todos los productos la
// necesitan). Deja que la cantidad de un insumo quede en negativo en vez de
// bloquear la venta: es más importante poder tomar el pedido que tener el
// conteo de stock perfecto, el negativo queda como aviso visual para
// reponer/corregir.
// mode SALIDA: se vendió (resta). mode ENTRADA: se sacó del pedido después
// de haber sido descontado (devuelve al stock).
async function applySupplyDeductions(
  tx: Prisma.TransactionClient,
  deductions: SupplyDeduction[],
  mode: "SALIDA" | "ENTRADA" = "SALIDA",
) {
  if (deductions.length === 0) return;

  const totalsByProduct = new Map<string, number>();
  for (const deduction of deductions) {
    totalsByProduct.set(deduction.productId, (totalsByProduct.get(deduction.productId) ?? 0) + deduction.quantity);
  }

  const usages = await tx.productSupplyUsage.findMany({
    where: { productId: { in: [...totalsByProduct.keys()] } },
  });

  const totalsBySupply = new Map<string, number>();
  for (const usage of usages) {
    const productQty = totalsByProduct.get(usage.productId) ?? 0;
    totalsBySupply.set(usage.supplyId, (totalsBySupply.get(usage.supplyId) ?? 0) + usage.quantity * productQty);
  }

  for (const [supplyId, quantity] of totalsBySupply) {
    if (quantity <= 0) continue;
    await tx.supply.update({
      where: { id: supplyId },
      data: { quantity: mode === "SALIDA" ? { decrement: quantity } : { increment: quantity } },
    });
    await tx.supplyMovement.create({
      data: { supplyId, type: mode, quantity, reason: mode === "SALIDA" ? "Venta" : "Corrección de pedido" },
    });
  }
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
    const deductions: SupplyDeduction[] = [];

    for (const item of input.items) {
      const resolved = await resolveOrderItem(tx, item);
      total += resolved.price;
      itemsData.push(resolved.data);
      deductions.push(...resolved.deductions);
    }

    const deliveryFee = input.channel === "DELIVERY" ? (input.deliveryFee ?? DELIVERY_FEE) : undefined;
    total += deliveryFee ?? 0;

    const order = await tx.order.create({
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
        notes: input.notes,
        employeeId: input.employeeId,
        items: { createMany: { data: itemsData } },
        invoice: { create: { type: "INTERNO", status: "EMITIDO" } },
      },
    });

    await applySupplyDeductions(tx, deductions);

    return order;
  });
}

// Permite sumar productos/promos a un pedido que el cliente ya hizo, mientras
// siga PENDIENTE (todavía no salió el cadete ni se marcó en preparación) —
// pensado para cuando el cliente por WhatsApp pide agregar algo a último
// momento. Devuelve null si el pedido ya no está en un estado modificable.
export async function addItemsToOrder(orderId: string, items: OrderInput["items"]) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || !isModifiable(order.status)) return null;

    let addedTotal = 0;
    const itemsData: Prisma.OrderItemCreateManyOrderInput[] = [];
    const deductions: SupplyDeduction[] = [];
    for (const item of items) {
      const resolved = await resolveOrderItem(tx, item);
      addedTotal += resolved.price;
      itemsData.push(resolved.data);
      deductions.push(...resolved.deductions);
    }

    await tx.orderItem.createMany({
      data: itemsData.map((data) => ({ ...data, orderId })),
    });

    const updated = await tx.order.update({
      where: { id: orderId },
      data: { total: Number(order.total) + addedTotal },
    });

    await applySupplyDeductions(tx, deductions);

    return updated;
  });
}

// Saca (o reduce la cantidad de) productos sueltos de un pedido PENDIENTE o
// CONFIRMADO — ej. el cliente pidió 9 empanadas y después dijo que en
// realidad quiere solo 3. Solo opera sobre renglones PRODUCTO (no
// desarma una promo ya formada). Devuelve el pedido actualizado, o null si
// ya no se puede tocar; si algún producto pedido no está en el pedido con
// esa cantidad, lo ignora (no rompe el resto de la operación).
export async function removeItemsFromOrder(
  orderId: string,
  removals: { productId: string; quantity: number }[],
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || !isModifiable(order.status)) return null;

    // Las pizzas mitad y mitad quedan afuera: "sacame la muzzarella" no
    // debería tocar una mitad-muzza-mitad-otra-cosa por compartir el mismo
    // producto ancla.
    const looseItems = (
      await tx.orderItem.findMany({
        where: { orderId, productId: { not: null } },
        include: { product: true },
      })
    ).filter((item) => !isHalfAndHalfItem(item.selections));

    let removedTotal = 0;
    const restored: SupplyDeduction[] = [];

    for (const removal of removals) {
      let remaining = removal.quantity;
      const rows = looseItems.filter((item) => item.productId === removal.productId);
      for (const row of rows) {
        if (remaining <= 0) break;
        const take = Math.min(row.quantity, remaining);
        removedTotal += Number(row.unitPrice) * take;
        restored.push({ productId: removal.productId, quantity: take });

        if (take === row.quantity) {
          await tx.orderItem.delete({ where: { id: row.id } });
        } else {
          await tx.orderItem.update({ where: { id: row.id }, data: { quantity: row.quantity - take } });
        }
        remaining -= take;
      }
    }

    const updated = await tx.order.update({
      where: { id: orderId },
      data: { total: Number(order.total) - removedTotal },
    });

    await applySupplyDeductions(tx, restored, "ENTRADA");

    return updated;
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
  if (!order || !isModifiable(order.status)) return null;

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
    if (!order || !isModifiable(order.status)) return null;

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

// Agrega/reemplaza las observaciones de preparación de un pedido PENDIENTE o
// CONFIRMADO (ej. "bien dorada", pedido por WhatsApp después de confirmar).
// Si ya había una nota, se le suma la nueva separada por punto y coma en vez
// de perderla. Devuelve null si el pedido ya no se puede tocar.
export async function updatePendingOrderNotes(orderId: string, note: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || !isModifiable(order.status)) return null;

  // El modelo a veces reenvía la misma observación que ya había guardado
  // (igual que pasa con items) — si ya está anotada tal cual, no se repite.
  const existing = order.notes?.split(";").map((part) => part.trim().toLowerCase()) ?? [];
  if (existing.includes(note.trim().toLowerCase())) return order;

  const notes = order.notes ? `${order.notes}; ${note}` : note;

  return prisma.order.update({ where: { id: orderId }, data: { notes } });
}

// Cancela un pedido PENDIENTE o CONFIRMADO (ej. el cliente avisa por
// WhatsApp que ya no lo quiere). Devuelve null si ya no se puede tocar (ya
// salió a entregar, ya se entregó, o ya estaba cancelado).
export async function cancelPendingOrder(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || !isModifiable(order.status)) return null;

  return prisma.order.update({ where: { id: orderId }, data: { status: "CANCELADO" } });
}

// Después de agregar productos sueltos a un pedido (ej. el cliente ya tenía
// una pizza y le suma empanadas por separado), puede pasar que la
// combinación resultante coincida con una promo activa — en ese caso sale
// más barato como promo que como productos sueltos, así que se consolida
// automáticamente: se consumen las unidades sueltas que arma la promo (se
// reducen o se borran esos renglones) y se agrega un renglón de promoción en
// su lugar. Corre en un loop por si alcanza para formar más de una promo (o
// más de una vez la misma). No hace nada si no hay ningún match.
function isHalfAndHalfItem(selections: unknown): boolean {
  return Array.isArray(selections) && (selections as Array<{ type?: string }>)[0]?.type === "MEDIA_MEDIA";
}

export async function reconcilePromotions(orderId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) return null;

    const allLooseItems = await tx.orderItem.findMany({
      where: { orderId, productId: { not: null } },
      include: { product: true },
    });
    // Una pizza mitad y mitad NO cuenta como "1 pizza entera suelta" para
    // armar una promo (arma un producto propio con precio especial) — se
    // excluye del pool aunque tenga productId seteado (es solo la FK ancla).
    const looseItems = allLooseItems.filter((item) => !isHalfAndHalfItem(item.selections));
    if (looseItems.length === 0) return order;

    const promotions = await tx.promotion.findMany({
      where: { active: true },
      include: { items: { include: { product: true, category: true } } },
    });
    if (promotions.length === 0) return order;

    type PoolEntry = { quantity: number; categoryId: string | null; name: string };
    const pool = new Map<string, PoolEntry>();
    for (const item of looseItems) {
      if (!item.productId) continue;
      const entry = pool.get(item.productId) ?? {
        quantity: 0,
        categoryId: item.product?.categoryId ?? null,
        name: item.product?.name ?? "",
      };
      entry.quantity += item.quantity;
      pool.set(item.productId, entry);
    }

    const consumed = new Map<string, number>();
    const available = (productId: string) => (pool.get(productId)?.quantity ?? 0) - (consumed.get(productId) ?? 0);
    const consume = (productId: string, qty: number) => consumed.set(productId, (consumed.get(productId) ?? 0) + qty);

    const formed: { promotionId: string; price: number; selections: Record<string, unknown>[] }[] = [];

    let matchedSomething = true;
    while (matchedSomething) {
      matchedSomething = false;

      for (const promotion of promotions) {
        const fijoParts = promotion.items.filter((i) => i.kind === "FIJO");
        const variableParts = promotion.items.filter((i) => i.kind === "VARIABLE");

        const fijoOk = fijoParts.every((part) => part.productId && available(part.productId) >= part.quantity);
        const variableOk = variableParts.every((part) => {
          const total = [...pool.entries()]
            .filter(([, entry]) => entry.categoryId === part.categoryId)
            .reduce((sum, [productId]) => sum + available(productId), 0);
          return total >= part.quantity;
        });
        if (!fijoOk || !variableOk) continue;

        const selections: Record<string, unknown>[] = [];
        for (const part of fijoParts) {
          if (!part.productId) continue;
          consume(part.productId, part.quantity);
          selections.push({
            type: "FIJO",
            productId: part.productId,
            nombre: pool.get(part.productId)?.name ?? "",
            cantidad: part.quantity,
          });
        }
        for (const part of variableParts) {
          let remaining = part.quantity;
          const chosen: { productId: string; nombre: string }[] = [];
          for (const [productId, entry] of pool.entries()) {
            if (remaining <= 0) break;
            if (entry.categoryId !== part.categoryId) continue;
            const take = Math.min(available(productId), remaining);
            if (take <= 0) continue;
            consume(productId, take);
            for (let i = 0; i < take; i++) chosen.push({ productId, nombre: entry.name });
            remaining -= take;
          }
          selections.push({ type: "VARIABLE", categoria: "", productos: chosen });
        }

        formed.push({ promotionId: promotion.id, price: Number(promotion.price), selections });
        matchedSomething = true;
      }
    }

    if (formed.length === 0) return order;

    // Reduce/borra los renglones sueltos según lo que se consumió.
    for (const [productId, consumedQty] of consumed) {
      let remainingToRemove = consumedQty;
      const rows = looseItems.filter((item) => item.productId === productId);
      for (const row of rows) {
        if (remainingToRemove <= 0) break;
        const take = Math.min(row.quantity, remainingToRemove);
        if (take === row.quantity) {
          await tx.orderItem.delete({ where: { id: row.id } });
        } else {
          await tx.orderItem.update({ where: { id: row.id }, data: { quantity: row.quantity - take } });
        }
        remainingToRemove -= take;
      }
    }

    for (const promo of formed) {
      await tx.orderItem.create({
        data: {
          orderId,
          promotionId: promo.promotionId,
          quantity: 1,
          unitPrice: promo.price,
          selections: promo.selections as Prisma.InputJsonValue,
        },
      });
    }

    const finalItems = await tx.orderItem.findMany({ where: { orderId } });
    const itemsTotal = finalItems.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);

    return tx.order.update({
      where: { id: orderId },
      data: { total: itemsTotal + Number(order.deliveryFee ?? 0) },
    });
  });
}
