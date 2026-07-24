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
      "Crea el pedido en el sistema. Llamar UNA sola vez, solo cuando ya están confirmados: los productos/promociones (con sabores elegidos si aplica), si es para retirar o para envío, y — solo si es para envío — la dirección y el método de pago (y si es efectivo con cuánto paga, o que paga justo). Si es para retirar por el local NO hace falta preguntar ni completar dirección ni método de pago. Los envíos tienen un costo fijo de $3.500 que se suma solo, no hace falta que lo calcules.",
    parameters: {
      type: "object",
      properties: {
        canal: {
          type: "string",
          enum: ["MOSTRADOR", "DELIVERY"],
          description: "MOSTRADOR si retira por el local, DELIVERY si se lo enviamos.",
        },
        direccion: {
          type: "string",
          description:
            "Dirección de entrega. Obligatorio (y hay que preguntarlo) si canal=DELIVERY. Si canal=MOSTRADOR, omitir.",
        },
        metodoPago: {
          type: "string",
          enum: ["EFECTIVO", "TRANSFERENCIA"],
          description:
            "Cómo paga. Obligatorio (y hay que preguntarlo) si canal=DELIVERY. Si canal=MOSTRADOR, omitir este campo — no se le pregunta al cliente.",
        },
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
                description:
                  "Nombre exacto del producto o de la promoción, SIN la cantidad adentro (ej. \"Jamón y Queso\", no \"6 Jamón y Queso\"). La cantidad va aparte, en el campo cantidad.",
              },
              cantidad: {
                type: "number",
                description:
                  "Cuántas unidades de este producto. Poné el número acá, no dentro de nombre. Omitir para promociones (siempre es 1).",
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
      required: ["canal", "items"],
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

// El modelo a veces mete la cantidad adentro del texto de "nombre" (ej.
// "6 Empanadas de Jamón y Queso") en vez de usar el campo `cantidad` —
// si no se detecta esto, la cantidad cae en 1 sin que nadie lo note y el
// pedido se cobra de menos. Se extrae el número inicial (si hay) para usarlo
// como cantidad y se matchea el producto contra el resto del texto.
function extractLeadingQuantity(nombre: string): { quantity?: number; rest: string } {
  const match = nombre.match(/^\s*(\d+)\s*x?\s+(.+)$/i);
  if (!match) return { rest: nombre };
  const quantity = Number(match[1]);
  return { quantity: quantity > 0 ? quantity : undefined, rest: match[2] };
}

// Las promos solo matchean por nombre EXACTO (no por substring): sus nombres
// suelen incluir el de algún producto suelto (ej. "Muzzarella + 3
// Empanadas" contiene "Muzzarella"), así que el matching difuso de
// findBestMatch terminaba confundiendo un pedido de la pizza sola con la
// promo. El modelo siempre recibe los nombres de promos tal cual en el
// prompt y en buscar_promociones, así que puede copiarlos literales.
function findExactPromotion<T>(items: T[], name: (item: T) => string, query: string): T | undefined {
  const normalizedQuery = normalize(query);
  return items.find((item) => normalize(name(item)) === normalizedQuery);
}

// Costo fijo de envío, se suma al total de todo pedido con canal=DELIVERY.
const DELIVERY_FEE = 3500;

interface CreateOrderArgs {
  canal: "MOSTRADOR" | "DELIVERY";
  direccion?: string;
  // Solo se pregunta cuando canal=DELIVERY; para retiro en el local no hace
  // falta y el modelo puede omitirlo, así que cae en EFECTIVO por default.
  metodoPago?: "EFECTIVO" | "TRANSFERENCIA";
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
  if (args.canal === "DELIVERY" && !args.direccion?.trim()) {
    return "Para un pedido por envío hace falta la dirección de entrega — preguntásela al cliente antes de reintentar.";
  }

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
    const promotion = findExactPromotion(promotions, (p) => p.name, item.nombre);

    if (!promotion) {
      const { quantity: quantityFromName, rest: nameForMatch } = extractLeadingQuantity(item.nombre);
      const product =
        findBestMatch(products, (p) => p.name, nameForMatch) ??
        findBestMatch(products, (p) => p.name, item.nombre);
      if (!product) {
        return `No encontré "${item.nombre}" en el catálogo ni en las promociones — confirmá el nombre exacto con el cliente antes de reintentar.`;
      }
      orderItems.push({
        kind: "PRODUCTO",
        productId: product.id,
        quantity: item.cantidad && item.cantidad > 0 ? item.cantidad : (quantityFromName ?? 1),
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

  const metodoPago = args.metodoPago ?? "EFECTIVO";
  const deliveryFee = args.canal === "DELIVERY" ? DELIVERY_FEE : undefined;

  const order = await createOrder({
    customerId,
    method: metodoPago,
    channel: args.canal,
    changeFor: metodoPago === "EFECTIVO" ? args.pagaCon : undefined,
    shippingAddress: args.canal === "DELIVERY" ? args.direccion : undefined,
    deliveryFee,
    items: orderItems,
  });

  const total = Number(order.total);
  const deliveryNote = deliveryFee ? ` (incluye $${deliveryFee.toLocaleString("es-AR")} de envío)` : "";

  if (metodoPago === "TRANSFERENCIA") {
    const preference = await createMercadoPagoPreference(order.id, total);
    if (preference) {
      return `Pedido creado (total $${total.toLocaleString("es-AR")}${deliveryNote}). Pasale este link de pago al cliente para que transfiera con Mercado Pago: ${preference.initPoint}`;
    }
    return `Pedido creado (total $${total.toLocaleString("es-AR")}${deliveryNote}). Todavía no está configurado Mercado Pago, así que avisale al cliente que le vas a pasar los datos para transferir por separado.`;
  }

  if (args.canal === "MOSTRADOR") {
    return `Pedido creado (total $${total.toLocaleString("es-AR")}) para retirar por el local. Paga ahí, no hace falta preguntar nada más de pago.`;
  }

  if (args.pagaCon && args.pagaCon > total) {
    return `Pedido creado (total $${total.toLocaleString("es-AR")}${deliveryNote}). El cliente paga con $${args.pagaCon.toLocaleString("es-AR")}, hay que llevarle $${(args.pagaCon - total).toLocaleString("es-AR")} de vuelto.`;
  }

  return `Pedido creado (total $${total.toLocaleString("es-AR")}${deliveryNote}), paga en efectivo sin vuelto.`;
}
