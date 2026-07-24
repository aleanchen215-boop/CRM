import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { prisma } from "@/lib/prisma";
import { createOrder } from "@/server/orders/create-order";
import { createMercadoPagoPreference } from "@/server/integrations/mercadopago/client";
import type { OrderInput } from "@/lib/validation/order";

export const CREATE_ORDER_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: "crear_pedido",
    description:
      "Crea el pedido en el sistema. Llamar UNA sola vez, solo cuando ya están confirmados: los productos/promociones (con sabores elegidos si aplica), si es para retirar o para envío, el método de pago, y si es efectivo con cuánto paga (o que paga justo).",
    parameters: {
      type: "object",
      properties: {
        canal: {
          type: "string",
          enum: ["MOSTRADOR", "DELIVERY"],
          description: "MOSTRADOR si retira por el local, DELIVERY si se lo enviamos.",
        },
        metodoPago: { type: "string", enum: ["EFECTIVO", "TRANSFERENCIA"] },
        pagaCon: {
          type: "number",
          description:
            "Solo si metodoPago=EFECTIVO y el cliente va a pagar con un billete más grande (necesita cambio). Omitir si paga justo o no es efectivo.",
        },
        items: {
          type: "array",
          description:
            "Un elemento por cada producto o promoción del pedido, tal como lo devolvió buscar_productos/buscar_promociones.",
          items: {
            type: "object",
            properties: {
              nombre: {
                type: "string",
                description: "Nombre exacto del producto o de la promoción.",
              },
              cantidad: {
                type: "number",
                description: "Cuántas unidades de este producto. Omitir para promociones (siempre es 1).",
              },
              sabores: {
                type: "array",
                items: { type: "string" },
                description:
                  "Solo si nombre es una promoción con partes a elección: un nombre de producto por cada unidad elegida (ej. si la promo trae 3 empanadas a elección, poné 3 nombres de empanadas acá, repetidos si son del mismo sabor).",
              },
            },
            required: ["nombre"],
          },
        },
      },
      required: ["canal", "metodoPago", "items"],
    },
  },
};

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function findBestMatch<T>(items: T[], name: (item: T) => string, query: string): T | undefined {
  const normalizedQuery = normalize(query);
  return (
    items.find((item) => normalize(name(item)) === normalizedQuery) ??
    items.find((item) => normalize(name(item)).includes(normalizedQuery)) ??
    items.find((item) => normalizedQuery.includes(normalize(name(item))))
  );
}

interface CreateOrderArgs {
  canal: "MOSTRADOR" | "DELIVERY";
  metodoPago: "EFECTIVO" | "TRANSFERENCIA";
  pagaCon?: number;
  items: Array<{
    nombre: string;
    cantidad?: number;
    sabores?: string[];
  }>;
}

export async function handleCreateOrder(
  customerId: string,
  args: CreateOrderArgs,
): Promise<string> {
  const products = await prisma.product.findMany({ include: { category: true } });
  const promotions = await prisma.promotion.findMany({
    where: { active: true },
    include: { items: { include: { product: true, category: true } } },
  });

  const orderItems: OrderInput["items"] = [];

  for (const item of args.items) {
    // Se prueba primero como promoción (nombres de combo suelen ser más
    // distintivos) y si no matchea se prueba como producto suelto — así el
    // modelo no tiene que decidir "tipo", que es justo el campo que un
    // modelo chico suele completar mal.
    const promotion = findBestMatch(promotions, (p) => p.name, item.nombre);

    if (!promotion) {
      const product = findBestMatch(products, (p) => p.name, item.nombre);
      if (!product) {
        return `No encontré "${item.nombre}" en el catálogo ni en las promociones — confirmá el nombre exacto con el cliente antes de reintentar.`;
      }
      orderItems.push({
        kind: "PRODUCTO",
        productId: product.id,
        quantity: item.cantidad && item.cantidad > 0 ? item.cantidad : 1,
      });
      continue;
    }

    // Cada línea VARIABLE de la promo se llena por categoría a medida que se
    // resuelven los sabores — así el modelo solo tiene que listar nombres de
    // producto, sin tener que agrupar por categoría él mismo.
    const slots = new Map(
      promotion.items
        .filter((promoItem) => promoItem.kind === "VARIABLE")
        .map((promoItem) => [
          promoItem.id,
          { categoryId: promoItem.categoryId, quantity: promoItem.quantity, chosen: [] as string[] },
        ]),
    );

    for (const sabor of item.sabores ?? []) {
      const match = findBestMatch(products, (p) => p.name, sabor);
      if (!match) {
        return `No encontré el sabor "${sabor}" para la promo "${promotion.name}" — confirmá el nombre con el cliente antes de reintentar.`;
      }
      const slot = [...slots.values()].find(
        (entry) => entry.categoryId === match.categoryId && entry.chosen.length < entry.quantity,
      );
      if (!slot) {
        return `"${sabor}" no corresponde a ninguna parte a elección disponible de la promo "${promotion.name}" (o ya se completó esa categoría) — confirmá con el cliente.`;
      }
      slot.chosen.push(match.id);
    }

    const variableSelections: { promotionItemId: string; productIds: string[] }[] = [];
    for (const [promotionItemId, slot] of slots) {
      if (slot.chosen.length !== slot.quantity) {
        const categoryName = products.find((p) => p.categoryId === slot.categoryId)?.category?.name ?? "una categoría";
        return `Para la promo "${promotion.name}" faltan confirmar ${slot.quantity} sabor(es) de "${categoryName}" — preguntáselo al cliente antes de reintentar.`;
      }
      variableSelections.push({ promotionItemId, productIds: slot.chosen });
    }

    orderItems.push({ kind: "PROMOCION", promotionId: promotion.id, variableSelections });
  }

  const order = await createOrder({
    customerId,
    method: args.metodoPago,
    channel: args.canal,
    changeFor: args.metodoPago === "EFECTIVO" ? args.pagaCon : undefined,
    items: orderItems,
  });

  const total = Number(order.total);

  if (args.metodoPago === "TRANSFERENCIA") {
    const preference = await createMercadoPagoPreference(order.id, total);
    if (preference) {
      return `Pedido creado (total $${total.toLocaleString("es-AR")}). Pasale este link de pago al cliente para que transfiera con Mercado Pago: ${preference.initPoint}`;
    }
    return `Pedido creado (total $${total.toLocaleString("es-AR")}). Todavía no está configurado Mercado Pago, así que avisale al cliente que le vas a pasar los datos para transferir por separado.`;
  }

  if (args.pagaCon && args.pagaCon > total) {
    return `Pedido creado (total $${total.toLocaleString("es-AR")}). El cliente paga con $${args.pagaCon.toLocaleString("es-AR")}, hay que llevarle $${(args.pagaCon - total).toLocaleString("es-AR")} de vuelto.`;
  }

  return `Pedido creado (total $${total.toLocaleString("es-AR")}), paga en efectivo sin vuelto.`;
}
