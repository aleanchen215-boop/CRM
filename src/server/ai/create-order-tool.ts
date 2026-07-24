import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { prisma } from "@/lib/prisma";
import {
  DELIVERY_FEE,
  addItemsToOrder,
  createOrder,
  updatePendingOrderChannel,
  updatePendingOrderPayment,
} from "@/server/orders/create-order";
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
                  "SOLO si nombre es el nombre exacto de una PROMOCIÓN (tal como lo devolvió buscar_promociones) que tiene partes a elección: un nombre de producto por cada unidad elegida. Si nombre es un producto suelto (no una promo), NUNCA uses este campo — usá cantidad en cambio, aunque el cliente haya pedido varias unidades del mismo sabor (ej. 6 empanadas de jamón y queso sueltas = nombre: \"Jamon y queso\", cantidad: 6 — NO nombre: \"6 empanadas a elección\" con sabores repetidos).",
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

type ItemArg = { nombre: string; cantidad?: number; sabores?: string[] };

// Compartido entre crear_pedido y modificar_pedido: mismo matching de
// producto/promo/cantidad para los dos, así un arreglo acá (ej. el de
// cantidad-adentro-del-nombre) no queda resuelto en un solo lugar.
async function resolveItemsForOrder(
  items: ItemArg[],
): Promise<{ orderItems: OrderInput["items"] } | { error: string }> {
  const products = await prisma.product.findMany({ include: { category: true } });
  const promotions = await prisma.promotion.findMany({
    where: { active: true },
    include: { items: { include: { product: true, category: true } } },
  });

  const orderItems: OrderInput["items"] = [];

  for (const item of items) {
    // Se prueba primero como promoción (nombres de combo suelen ser más
    // distintivos) y si no matchea se prueba como producto suelto — así el
    // modelo no tiene que decidir "tipo", que es justo el campo que un
    // modelo chico suele completar mal.
    const promotion = findExactPromotion(promotions, (p) => p.name, item.nombre);

    if (!promotion) {
      const { quantity: quantityFromName, rest: nameForMatch } = extractLeadingQuantity(item.nombre);
      let product =
        findBestMatch(products, (p) => p.name, nameForMatch) ??
        findBestMatch(products, (p) => p.name, item.nombre);
      let quantity = item.cantidad && item.cantidad > 0 ? item.cantidad : (quantityFromName ?? 1);

      // El modelo a veces manda un producto suelto con cantidad > 1 como si
      // fuera una promo "a elección" (nombre inventado tipo "6 Empanadas a
      // elección" + un array de `sabores` repetido) en vez de usar
      // simplemente `cantidad`. Si el nombre no matcheó pero todos los
      // sabores apuntan al mismo producto, lo tomamos como ese producto con
      // esa cantidad en vez de fallar.
      if (!product && item.sabores && item.sabores.length > 0) {
        const saborProducts = item.sabores.map((sabor) => findBestMatch(products, (p) => p.name, sabor));
        const first = saborProducts[0];
        if (first && saborProducts.every((p) => p?.id === first.id)) {
          product = first;
          quantity = item.sabores.length;
        }
      }

      if (!product) {
        return { error: `No encontré "${item.nombre}" en el catálogo ni en las promociones — confirmá el nombre exacto con el cliente antes de reintentar.` };
      }
      orderItems.push({
        kind: "PRODUCTO",
        productId: product.id,
        quantity,
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
        return { error: `No encontré el sabor "${sabor}" para la promo "${promotion.name}" — confirmá el nombre con el cliente antes de reintentar.` };
      }
      const slot = [...slots.values()].find(
        (entry) => entry.categoryId === match.categoryId && entry.chosen.length < entry.quantity,
      );
      if (!slot) {
        return { error: `"${sabor}" no corresponde a ninguna parte a elección disponible de la promo "${promotion.name}" (o ya se completó esa categoría) — confirmá con el cliente.` };
      }
      slot.chosen.push(match.id);
    }

    const variableSelections: { promotionItemId: string; productIds: string[] }[] = [];
    for (const [promotionItemId, slot] of slots) {
      if (slot.chosen.length !== slot.quantity) {
        const categoryName = products.find((p) => p.categoryId === slot.categoryId)?.category?.name ?? "una categoría";
        return { error: `Para la promo "${promotion.name}" faltan confirmar ${slot.quantity} sabor(es) de "${categoryName}" — preguntáselo al cliente antes de reintentar.` };
      }
      variableSelections.push({ promotionItemId, productIds: slot.chosen });
    }

    orderItems.push({ kind: "PROMOCION", promotionId: promotion.id, variableSelections });
  }

  return { orderItems };
}

export async function handleCreateOrder(
  customerId: string,
  args: CreateOrderArgs,
): Promise<string> {
  // Evita duplicar pedidos: si ya hay uno PENDIENTE de este cliente (ej. el
  // cliente pide agregar algo después de confirmar), no se crea uno nuevo —
  // hay que sumarlo al que ya existe con modificar_pedido en su lugar. Sin
  // esta guarda el modelo a veces llamaba crear_pedido de nuevo en vez de
  // modificar_pedido, dejando dos pedidos pendientes sueltos para el mismo
  // cliente.
  const existingPending = await prisma.order.findFirst({
    where: { customerId, status: "PENDIENTE" },
  });
  if (existingPending) {
    return "Este cliente YA tiene un pedido pendiente (todavía no se despachó) — no crees uno nuevo. Para agregarle productos o cambiar el pago de ESE pedido, llamá a modificar_pedido en su lugar.";
  }

  if (args.canal === "DELIVERY" && !args.direccion?.trim()) {
    return "Para un pedido por envío hace falta la dirección de entrega — preguntásela al cliente antes de reintentar.";
  }

  const resolved = await resolveItemsForOrder(args.items);
  if ("error" in resolved) return resolved.error;
  const orderItems = resolved.orderItems;

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

export const MODIFY_ORDER_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: "modificar_pedido",
    description:
      "Modifica el pedido PENDIENTE más reciente de este cliente: agrega productos/promos y/o cambia el método de pago. Usar cuando el cliente YA hizo un pedido en esta conversación y ahora quiere sumarle algo, pedir de nuevo el link de pago, o cambiar cómo paga — siempre que el pedido todavía no haya salido a entregar. Si no hay ningún pedido pendiente, esta herramienta te va a avisar; en ese caso decile al cliente que hagas un pedido nuevo con crear_pedido.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description:
            "SOLO los productos/promos NUEVOS que el cliente pide agregar en su ÚLTIMO mensaje — se suman a lo que el pedido ya tenía, no lo reemplazan. Si en su último mensaje el cliente no pidió agregar nada nuevo (ej. solo cambia el método de pago o pide el link de pago de nuevo), omitir este campo por completo — NO repitas acá productos que ya se habían agregado antes en la conversación, porque se sumarían dos veces.",
          items: {
            type: "object",
            properties: {
              nombre: {
                type: "string",
                description:
                  "Nombre exacto del producto o de la promoción, SIN la cantidad adentro. La cantidad va en el campo cantidad.",
              },
              cantidad: {
                type: "number",
                description: "Cuántas unidades. Omitir para promociones (siempre es 1).",
              },
              sabores: {
                type: "array",
                items: { type: "string" },
                description: "Solo si nombre es una promoción con partes a elección.",
              },
            },
            required: ["nombre"],
          },
        },
        canal: {
          type: "string",
          enum: ["MOSTRADOR", "DELIVERY"],
          description:
            "Solo si el cliente cambia entre retirar y envío respecto de lo que ya tenía (ej. había pedido retirar y ahora quiere que se lo envíen, o al revés). Omitir si no cambia. Si pasa a DELIVERY hace falta la dirección en el campo direccion.",
        },
        direccion: {
          type: "string",
          description:
            "Dirección de entrega. Obligatorio si canal=DELIVERY (y el pedido todavía no tenía una dirección guardada). También se puede usar solo para corregir la dirección de un pedido que ya era DELIVERY, sin cambiar canal.",
        },
        metodoPago: {
          type: "string",
          enum: ["EFECTIVO", "TRANSFERENCIA"],
          description:
            "Solo si el cliente cambia cómo va a pagar respecto de lo que ya tenía (ej. pidió el link de Mercado Pago, o dice que ahora paga distinto). Omitir si no cambia.",
        },
        pagaCon: {
          type: "number",
          description:
            "Solo si metodoPago=EFECTIVO y aclara con cuánto paga (para el vuelto). Omitir si no aplica.",
        },
      },
      required: [],
    },
  },
};

interface ModifyOrderArgs {
  items?: ItemArg[];
  canal?: "MOSTRADOR" | "DELIVERY";
  direccion?: string;
  metodoPago?: "EFECTIVO" | "TRANSFERENCIA";
  pagaCon?: number;
}

export async function handleModifyOrder(customerId: string, args: ModifyOrderArgs): Promise<string> {
  const order = await prisma.order.findFirst({
    where: { customerId, status: "PENDIENTE" },
    orderBy: { createdAt: "desc" },
  });
  if (!order) {
    return "Este cliente no tiene ningún pedido pendiente para modificar — si quiere pedir algo, hay que hacer un pedido nuevo con crear_pedido, no esta herramienta.";
  }

  if (args.items && args.items.length > 0) {
    const resolved = await resolveItemsForOrder(args.items);
    if ("error" in resolved) return resolved.error;

    // El modelo a veces reenvía en `items` cosas que ya se habían agregado
    // antes en la misma conversación (en vez de solo lo nuevo), lo que
    // sumaría el mismo producto dos veces y cobraría de más. Si un
    // producto/promo con la misma cantidad ya está en el pedido, no se
    // vuelve a agregar.
    const existingItems = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    const isAlreadyOnOrder = (item: OrderInput["items"][number]) =>
      item.kind === "PRODUCTO"
        ? existingItems.some((existing) => existing.productId === item.productId && existing.quantity === item.quantity)
        : existingItems.some((existing) => existing.promotionId === item.promotionId);

    const newItems = resolved.orderItems.filter((item) => !isAlreadyOnOrder(item));

    if (newItems.length > 0) {
      const updated = await addItemsToOrder(order.id, newItems);
      if (!updated) {
        return "Este pedido ya no se puede modificar (ya está en preparación o ya salió) — si el cliente quiere algo más, hay que hacer un pedido nuevo.";
      }
    }
  }

  if (args.canal && args.canal !== order.channel) {
    if (args.canal === "DELIVERY" && !args.direccion?.trim() && !order.shippingAddress) {
      return "Para cambiar el pedido a envío hace falta la dirección de entrega — preguntásela al cliente antes de reintentar.";
    }
    const updated = await updatePendingOrderChannel(order.id, { channel: args.canal, shippingAddress: args.direccion });
    if (!updated) {
      return "Este pedido ya no se puede modificar (ya está en preparación o ya salió).";
    }
  } else if (args.direccion?.trim() && order.channel === "DELIVERY") {
    await updatePendingOrderChannel(order.id, { channel: "DELIVERY", shippingAddress: args.direccion });
  }

  if (args.metodoPago && args.metodoPago !== order.method) {
    const updated = await updatePendingOrderPayment(order.id, {
      method: args.metodoPago,
      changeFor: args.metodoPago === "EFECTIVO" ? (args.pagaCon ?? null) : null,
    });
    if (!updated) {
      return "Este pedido ya no se puede modificar (ya está en preparación o ya salió).";
    }
  } else if (args.pagaCon !== undefined && order.method === "EFECTIVO") {
    await updatePendingOrderPayment(order.id, { changeFor: args.pagaCon });
  }

  const finalOrder = await prisma.order.findUnique({ where: { id: order.id } });
  if (!finalOrder) return "Hubo un problema actualizando el pedido, reintentá.";

  const total = Number(finalOrder.total);
  const deliveryNote = finalOrder.deliveryFee
    ? ` (incluye $${Number(finalOrder.deliveryFee).toLocaleString("es-AR")} de envío a ${finalOrder.shippingAddress})`
    : "";

  if (finalOrder.method === "TRANSFERENCIA") {
    const preference = await createMercadoPagoPreference(finalOrder.id, total);
    if (preference) {
      return `Pedido actualizado (nuevo total $${total.toLocaleString("es-AR")}${deliveryNote}). Pasale este link de pago al cliente para que transfiera con Mercado Pago: ${preference.initPoint}`;
    }
    return `Pedido actualizado (nuevo total $${total.toLocaleString("es-AR")}${deliveryNote}). Todavía no está configurado Mercado Pago.`;
  }

  return `Pedido actualizado. Nuevo total: $${total.toLocaleString("es-AR")}${deliveryNote}, paga en efectivo.`;
}
