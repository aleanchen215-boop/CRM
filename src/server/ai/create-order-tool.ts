import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { prisma } from "@/lib/prisma";
import {
  DELIVERY_FEE,
  addItemsToOrder,
  createOrder,
  flagCancellationRequest,
  quoteOrderItems,
  reconcilePromotions,
  removeItemsFromOrder,
  updatePendingOrderChannel,
  updatePendingOrderNotes,
  updatePendingOrderPayment,
  updatePendingOrderSchedule,
} from "@/server/orders/create-order";
import { createMercadoPagoPreference } from "@/server/integrations/mercadopago/client";
import { getAvailableStock } from "@/server/stock/availability";
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
                  "Cuántas unidades de este producto. Poné el número acá, no dentro de nombre. Omitir para promociones (siempre es 1). Para pizza: si el cliente pide MEDIA pizza de un solo sabor (sin combinar con otro), poné acá 0.5 — el sistema cobra el precio entero / 2 + $1.000.",
              },
              sabores: {
                type: "array",
                items: { type: "string" },
                description:
                  "SOLO si nombre es el nombre exacto de una PROMOCIÓN (tal como lo devolvió buscar_promociones) que tiene partes a elección. Poné un elemento por cada sabor DISTINTO con la cantidad al frente (ej. para una docena 10 carne + 2 jamón y queso: [\"10 Carne Con Aceitunas\", \"2 Jamon y queso\"]) — NO hace falta repetir el mismo sabor varias veces en el array, y evitá contar mal en promos grandes (docena, 15 empanadas). Si nombre es un producto suelto (no una promo), NUNCA uses este campo — usá cantidad en cambio (ej. 6 empanadas de jamón y queso sueltas = nombre: \"Jamon y queso\", cantidad: 6 — NO nombre: \"6 empanadas a elección\" con sabores).",
              },
              mitad2: {
                type: "string",
                description:
                  "SOLO para pizza mitad y mitad con DOS sabores distintos (ej. \"media muzzarella, media especial\"): poné el primer sabor en nombre y el segundo acá. Si es media pizza de UN solo sabor, no uses este campo — usá cantidad: 0.5 en cambio. El precio se calcula siempre solo (no lo calcules vos).",
              },
            },
            required: ["nombre"],
          },
        },
        observaciones: {
          type: "string",
          description:
            "Pedidos especiales del cliente sobre la preparación (ej. \"bien dorada\", \"sin cebolla\", \"cortada en 8\"). SOLO si el cliente dice algo así explícitamente — no inventes ni asumas nada. Omitir si no dijo nada especial.",
        },
        horaProgramada: {
          type: "string",
          description:
            "SOLO si el cliente pide una hora puntual para retirar o para que le llevemos el pedido (ej. \"para las 21:30\", \"retiro a las 8 de la noche\", \"que llegue a las 20\"). Formato 24hs HH:MM (ej. \"21:30\", \"20:00\"). Esto NO es lo mismo que una pregunta de \"cuánto tardan\" — es cuando el cliente da un horario concreto. Omitir si no pidió ninguna hora en particular (se prepara/envía normal, apenas esté listo).",
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

// Un pedido PENDIENTE/CONFIRMADO de días anteriores NO cuenta como "el
// pedido en curso" — si quedó sin cerrar de ayer y el cliente escribe hoy,
// tiene que ser una venta nueva y separada, no seguir sumándole cosas a la
// de ayer. Solo un pedido del mismo día calendario (huso horario del
// negocio) se considera "en curso" a los efectos de crear_pedido/
// modificar_pedido/cancelar_pedido.
const BUSINESS_TIMEZONE = "America/Argentina/Buenos_Aires";
const businessDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function isSameBusinessDay(a: Date, b: Date): boolean {
  return businessDayFormatter.format(a) === businessDayFormatter.format(b);
}

// Convierte la hora HH:MM que dio el modelo (siempre referida al día de hoy,
// hora del negocio) en un instante real — Buenos Aires no tiene horario de
// verano, así que el offset fijo -03:00 alcanza. Devuelve null si no viene o
// no tiene el formato esperado, para no guardar basura.
function parseScheduledTime(hhmm: string | undefined): Date | null {
  if (!hhmm?.trim()) return null;
  const match = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;

  const today = businessDayFormatter.format(new Date());
  const padded = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
  return new Date(`${today}T${padded}:00-03:00`);
}

// Tres niveles de matching (exacto, contiene, está-contenido) que devuelve
// TODOS los que empatan en el nivel ganador en vez de quedarse con el
// primero — así se puede distinguir "un solo producto matcheó" de "varios
// matchean y hay que preguntar cuál" (ver findProductMatches).
function findAllMatches<T>(items: T[], name: (item: T) => string, query: string): T[] {
  const normalizedQuery = normalize(query);
  const exact = items.filter((item) => normalize(name(item)) === normalizedQuery);
  if (exact.length > 0) return exact;
  const contains = items.filter((item) => normalize(name(item)).includes(normalizedQuery));
  if (contains.length > 0) return contains;
  return items.filter((item) => normalizedQuery.includes(normalize(name(item))));
}

// Muchos clientes abrevian el sabor con el SKU (ej. "EP" por Entraña y
// Provoleta) — se chequea primero porque el matching por nombre nunca
// encuentra nada con un código de 2 letras, y sin esto el modelo terminaba
// inventando un sabor que no existe en el catálogo.
function findProductMatch<T extends { name: string; sku: string | null }>(
  products: T[],
  query: string,
): T | undefined {
  return findProductMatches(products, query)[0];
}

// Igual que findProductMatch pero devuelve todos los productos que empatan
// en el nivel de matching ganador, para poder detectar ambigüedad (ej. el
// cliente dice "carne" y hay Carne Con Aceitunas, Carne Dulce y Carne
// Cortada a Cuchillo — no hay forma de saber cuál quiso sin preguntarle).
function findProductMatches<T extends { name: string; sku: string | null }>(
  products: T[],
  query: string,
): T[] {
  const normalizedQuery = normalize(query);
  const skuMatch = products.find((product) => product.sku && normalize(product.sku) === normalizedQuery);
  if (skuMatch) return [skuMatch];
  return findAllMatches(products, (p) => p.name, query);
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

// Cuando un sabor dicho por el cliente matchea más de un producto (ej.
// "carne" con Carne Con Aceitunas / Carne Dulce / Carne Cortada a Cuchillo
// cargadas), nunca hay que elegir uno por nuestra cuenta — se corta la
// creación del pedido acá con un error que lista las opciones, para que el
// modelo se lo pregunte al cliente en vez de adivinar.
function ambiguousFlavorError(query: string, matches: { name: string }[]): string {
  const options = matches.map((m) => m.name).join(", ");
  return `"${query}" es ambiguo, puede ser cualquiera de estos sabores: ${options} — preguntale al cliente cuál de esos quiere exactamente (no elijas vos uno) antes de reintentar.`;
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
  observaciones?: string;
  horaProgramada?: string;
}

type ItemArg = { nombre: string; cantidad?: number; sabores?: string[]; mitad2?: string };

// Compartido entre crear_pedido y modificar_pedido: mismo matching de
// producto/promo/cantidad para los dos, así un arreglo acá (ej. el de
// cantidad-adentro-del-nombre) no queda resuelto en un solo lugar.
async function resolveItemsForOrder(
  items: ItemArg[],
  sucursalId: string,
): Promise<{ orderItems: OrderInput["items"] } | { error: string }> {
  const products = await prisma.product.findMany({ include: { category: true } });
  const promotions = await prisma.promotion.findMany({
    where: { active: true },
    include: { items: { include: { product: true, category: true } } },
  });

  const orderItems: OrderInput["items"] = [];

  for (const item of items) {
    // mitad2 presente = pizza mitad y mitad (dos sabores). cantidad=0.5 sin
    // mitad2 = media pizza de un solo sabor, sola.
    if (item.mitad2?.trim() || item.cantidad === 0.5) {
      const matches1 = findProductMatches(products, item.nombre);
      if (matches1.length === 0) {
        return { error: `No encontré "${item.nombre}" en el catálogo — confirmá el sabor con el cliente antes de reintentar.` };
      }
      if (matches1.length > 1) {
        return { error: ambiguousFlavorError(item.nombre, matches1) };
      }
      const product1 = matches1[0];
      let product2: typeof product1 | undefined;
      if (item.mitad2?.trim()) {
        const matches2 = findProductMatches(products, item.mitad2);
        if (matches2.length === 0) {
          return { error: `No encontré "${item.mitad2}" en el catálogo — confirmá el segundo sabor con el cliente antes de reintentar.` };
        }
        if (matches2.length > 1) {
          return { error: ambiguousFlavorError(item.mitad2, matches2) };
        }
        product2 = matches2[0];
      }
      orderItems.push({
        kind: "MEDIA_MEDIA",
        productId1: product1.id,
        productId2: product2?.id,
        quantity: item.mitad2 && item.cantidad && item.cantidad > 0 ? item.cantidad : 1,
      });
      continue;
    }

    // Se prueba primero como promoción (nombres de combo suelen ser más
    // distintivos) y si no matchea se prueba como producto suelto — así el
    // modelo no tiene que decidir "tipo", que es justo el campo que un
    // modelo chico suele completar mal.
    const promotion = findExactPromotion(promotions, (p) => p.name, item.nombre);

    if (!promotion) {
      const { quantity: quantityFromName, rest: nameForMatch } = extractLeadingQuantity(item.nombre);
      let matches = findProductMatches(products, nameForMatch);
      if (matches.length === 0) matches = findProductMatches(products, item.nombre);
      if (matches.length > 1) {
        return { error: ambiguousFlavorError(item.nombre, matches) };
      }
      let product = matches[0];
      let quantity = item.cantidad && item.cantidad > 0 ? item.cantidad : (quantityFromName ?? 1);

      // El modelo a veces manda un producto suelto con cantidad > 1 como si
      // fuera una promo "a elección" (nombre inventado tipo "6 Empanadas a
      // elección" + un array de `sabores` repetido) en vez de usar
      // simplemente `cantidad`. Si el nombre no matcheó pero todos los
      // sabores apuntan al mismo producto, lo tomamos como ese producto con
      // esa cantidad en vez de fallar.
      if (!product && item.sabores && item.sabores.length > 0) {
        const saborProducts = item.sabores.map((sabor) => findProductMatch(products, sabor));
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

    for (const saborEntry of item.sabores ?? []) {
      // El modelo a veces manda "10 Carne Con Aceitunas" en vez de repetir el
      // sabor 10 veces en el array (que le pedíamos antes) — con promos
      // grandes (docena, 15 empanadas) contar y repetir 12-15 elementos a
      // mano es justo el tipo de cuenta en la que un modelo chico se
      // equivoca, y esa falla silenciosa dejaba al cliente trabado
      // confirmando en loop sin que la IA supiera por qué. Se acepta ambos
      // formatos: con cantidad al frente (se repite esa cantidad de veces) o
      // un elemento por unidad como antes (cantidad implícita 1).
      const { quantity: leadingQty, rest: saborName } = extractLeadingQuantity(saborEntry);
      const repeatCount = leadingQty && leadingQty > 0 ? leadingQty : 1;
      const saborMatches = findProductMatches(products, saborName);
      if (saborMatches.length === 0) {
        return { error: `No encontré el sabor "${saborEntry}" para la promo "${promotion.name}" — confirmá el nombre con el cliente antes de reintentar.` };
      }
      if (saborMatches.length > 1) {
        return { error: ambiguousFlavorError(saborName, saborMatches) };
      }
      const match = saborMatches[0];
      for (let i = 0; i < repeatCount; i++) {
        const slot = [...slots.values()].find(
          (entry) => entry.categoryId === match.categoryId && entry.chosen.length < entry.quantity,
        );
        if (!slot) {
          return { error: `"${saborName}" no corresponde a ninguna parte a elección disponible de la promo "${promotion.name}" (o ya se completó esa categoría) — confirmá con el cliente.` };
        }
        slot.chosen.push(match.id);
      }
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

  // La IA todavía está charlando con el cliente en este punto, así que
  // conviene frenar acá con un mensaje claro (en vez de dejar que falle más
  // abajo al confirmar, ver applySupplyDeductions) para que pueda
  // preguntarle con qué quiere completar el pedido.
  const requestedByProduct = new Map<string, number>();
  const addRequested = (productId: string, quantity: number) => {
    requestedByProduct.set(productId, (requestedByProduct.get(productId) ?? 0) + quantity);
  };
  for (const orderItem of orderItems) {
    if (orderItem.kind === "PRODUCTO") {
      addRequested(orderItem.productId, orderItem.quantity);
    } else if (orderItem.kind === "MEDIA_MEDIA") {
      // Mismo criterio que al descontar stock real (ver create-order.ts):
      // el insumo se cuenta una sola vez por pizza física, con la receta
      // del primer sabor.
      addRequested(orderItem.productId1, orderItem.quantity);
    } else {
      for (const selection of orderItem.variableSelections) {
        for (const productId of selection.productIds) {
          addRequested(productId, 1);
        }
      }
    }
  }

  if (requestedByProduct.size > 0) {
    const availableByProduct = await getAvailableStock([...requestedByProduct.keys()], sucursalId);
    for (const [productId, requested] of requestedByProduct) {
      const available = availableByProduct.get(productId);
      if (available === undefined || requested <= available) continue;

      const product = products.find((p) => p.id === productId);
      const productName = product?.name ?? "ese sabor";

      return {
        error:
          available === 0
            ? `No tenemos stock de "${productName}" — avisale al cliente que no queda ese sabor y preguntale con qué lo quiere reemplazar. NO le sugieras ni le listes sabores puntuales, solo preguntá.`
            : `Solo quedan ${available} unidad(es) de "${productName}" en stock (el pedido tiene ${requested}) — avisale al cliente cuánto queda de verdad y preguntale con qué sabor quiere completar los ${requested - available} que faltan. NO le sugieras ni le listes sabores puntuales, solo preguntá.`,
      };
    }
  }

  return { orderItems };
}

export async function handleCreateOrder(
  customerId: string,
  sucursalId: string,
  args: CreateOrderArgs,
): Promise<string> {
  // Evita duplicar pedidos: si ya hay uno PENDIENTE o CONFIRMADO de este
  // cliente en ESTA sucursal (ej. el cliente pide agregar algo después de
  // confirmar), no se crea uno nuevo — hay que sumarlo al que ya existe con
  // modificar_pedido en su lugar. Sin esta guarda el modelo a veces llamaba
  // crear_pedido de nuevo en vez de modificar_pedido, dejando dos pedidos
  // sueltos para el mismo cliente. Se filtra por sucursal porque un mismo
  // cliente puede tener un pedido en curso en cada sucursal a la vez.
  const existingPending = await prisma.order.findFirst({
    where: { customerId, sucursalId, status: { in: ["PENDIENTE", "CONFIRMADO"] } },
    orderBy: { createdAt: "desc" },
  });
  if (existingPending && isSameBusinessDay(existingPending.createdAt, new Date())) {
    return "Este cliente YA tiene un pedido en curso de hoy (todavía no salió a entregar) — no crees uno nuevo. Para agregarle productos o cambiar el pago de ESE pedido, llamá a modificar_pedido en su lugar.";
  }

  if (args.canal === "DELIVERY" && !args.direccion?.trim()) {
    return "Para un pedido por envío hace falta la dirección de entrega — preguntásela al cliente antes de reintentar.";
  }

  const resolved = await resolveItemsForOrder(args.items, sucursalId);
  if ("error" in resolved) return resolved.error;
  const orderItems = resolved.orderItems;

  const metodoPago = args.metodoPago ?? "EFECTIVO";
  const deliveryFee = args.canal === "DELIVERY" ? DELIVERY_FEE : undefined;

  const order = await createOrder({
    customerId,
    sucursalId,
    method: metodoPago,
    channel: args.canal,
    changeFor: metodoPago === "EFECTIVO" ? args.pagaCon : undefined,
    shippingAddress: args.canal === "DELIVERY" ? args.direccion : undefined,
    deliveryFee,
    notes: args.observaciones?.trim() || undefined,
    scheduledFor: parseScheduledTime(args.horaProgramada) ?? undefined,
    items: orderItems,
  });

  // Por si el modelo no detectó que los productos sueltos que pidió arman
  // una promo (no siempre lo hace bien) — se corrige acá siempre, sin
  // depender de que lo haya pedido explícitamente.
  const reconciled = (await reconcilePromotions(order.id)) ?? order;
  const total = Number(reconciled.total);
  const deliveryNote = deliveryFee ? ` (incluye $${deliveryFee.toLocaleString("es-AR")} de envío)` : "";
  const scheduleNote = reconciled.scheduledFor
    ? ` Anotado para las ${reconciled.scheduledFor.toLocaleTimeString("es-AR", { timeZone: BUSINESS_TIMEZONE, hour: "2-digit", minute: "2-digit" })}hs.`
    : "";

  if (metodoPago === "TRANSFERENCIA") {
    const preference = await createMercadoPagoPreference(order.id, total);
    if (preference) {
      return `Pedido creado (total $${total.toLocaleString("es-AR")}${deliveryNote}).${scheduleNote} Pasale este link de pago al cliente para que transfiera con Mercado Pago: ${preference.initPoint}`;
    }
    return `Pedido creado (total $${total.toLocaleString("es-AR")}${deliveryNote}).${scheduleNote} Todavía no está configurado Mercado Pago, así que avisale al cliente que le vas a pasar los datos para transferir por separado.`;
  }

  if (args.canal === "MOSTRADOR") {
    return `Pedido creado (total $${total.toLocaleString("es-AR")}) para retirar por el local.${scheduleNote} Paga ahí, no hace falta preguntar nada más de pago.`;
  }

  if (args.pagaCon && args.pagaCon > total) {
    return `Pedido creado (total $${total.toLocaleString("es-AR")}${deliveryNote}).${scheduleNote} El cliente paga con $${args.pagaCon.toLocaleString("es-AR")}, hay que llevarle $${(args.pagaCon - total).toLocaleString("es-AR")} de vuelto.`;
  }

  return `Pedido creado (total $${total.toLocaleString("es-AR")}${deliveryNote}),${scheduleNote} paga en efectivo sin vuelto.`;
}

export const QUOTE_ORDER_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: "cotizar_pedido",
    description:
      "Calcula el total de VARIOS productos/promociones juntos (y el envío si corresponde), antes de que el cliente confirme el pedido. Llamala SIEMPRE que el cliente pregunte cuánto sale el total de más de un producto, o el total con envío incluido — NUNCA sumes los subtotales vos de memoria, ahí es donde te equivocás. Para un solo producto sin envío, mejor usá buscar_productos. No crea ningún pedido, solo informa el total.",
    parameters: {
      type: "object",
      properties: {
        canal: {
          type: "string",
          enum: ["MOSTRADOR", "DELIVERY"],
          description: "DELIVERY si hay que sumar el envío ($3.500), MOSTRADOR si no.",
        },
        items: {
          type: "array",
          description: "Mismo formato que en crear_pedido: un elemento por cada producto o promoción a cotizar.",
          items: {
            type: "object",
            properties: {
              nombre: { type: "string", description: "Nombre exacto del producto o promoción." },
              cantidad: { type: "number", description: "Cantidad de unidades. Omitir para promociones." },
              sabores: {
                type: "array",
                items: { type: "string" },
                description: "Solo si nombre es una promoción con partes a elección, igual que en crear_pedido.",
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

interface QuoteOrderArgs {
  canal: "MOSTRADOR" | "DELIVERY";
  items: ItemArg[];
}

export async function handleQuoteOrder(sucursalId: string, args: QuoteOrderArgs): Promise<string> {
  const resolved = await resolveItemsForOrder(args.items, sucursalId);
  if ("error" in resolved) return resolved.error;

  const deliveryFee = args.canal === "DELIVERY" ? DELIVERY_FEE : undefined;
  const { lines, total } = await quoteOrderItems(resolved.orderItems, deliveryFee);

  const breakdown = lines.map((line) => `${line.label}: $${line.price.toLocaleString("es-AR")}`).join("\n");
  return `${breakdown}\nTotal: $${total.toLocaleString("es-AR")}`;
}

export const MODIFY_ORDER_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: "modificar_pedido",
    description:
      "Modifica el pedido PENDIENTE más reciente de este cliente: agrega o QUITA productos, y/o cambia el método de pago. Usar cuando el cliente YA hizo un pedido en esta conversación y ahora quiere sumarle algo, sacarle o reducir algo, pedir de nuevo el link de pago, o cambiar cómo paga — siempre que el pedido todavía no haya salido a entregar. Si al agregar o quitar algo la combinación resultante arma una promo, el sistema la aplica solo. Si no hay ningún pedido pendiente, esta herramienta te va a avisar; en ese caso decile al cliente que hagas un pedido nuevo con crear_pedido.",
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
                description:
                  "Cuántas unidades. Omitir para promociones (siempre es 1). Para media pizza de un solo sabor, poné 0.5.",
              },
              sabores: {
                type: "array",
                items: { type: "string" },
                description:
                  "Solo si nombre es una promoción con partes a elección. Poné un elemento por cada sabor DISTINTO con la cantidad al frente (ej. [\"10 Carne Con Aceitunas\", \"2 Jamon y queso\"]) — no hace falta repetir el mismo sabor varias veces.",
              },
              mitad2: {
                type: "string",
                description:
                  "SOLO para pizza mitad y mitad con DOS sabores: primer sabor en nombre, segundo sabor acá. Para un solo sabor usá cantidad: 0.5 en cambio. El precio se calcula solo.",
              },
            },
            required: ["nombre"],
          },
        },
        quitar: {
          type: "array",
          description:
            "Productos sueltos (no promos) que el cliente pide sacar, reducir, o dejar en una cantidad puntual. Usá SOLO uno de los dos campos de cantidad por renglón, el que corresponda a cómo lo dijo el cliente — no calcules vos la resta. Omitir todo el campo si no pidió sacar nada.",
          items: {
            type: "object",
            properties: {
              nombre: {
                type: "string",
                description: "Nombre exacto del producto suelto a sacar/reducir.",
              },
              cantidadASacar: {
                type: "number",
                description:
                  "Usar cuando el cliente dice cuánto sacar directamente (ej. \"sacame 2 empanadas de jamón y queso\" → 2). NO usar junto con cantidadFinal.",
              },
              cantidadFinal: {
                type: "number",
                description:
                  "Usar cuando el cliente dice cuánto quiere que QUEDE en total (ej. \"tenía 9, dejame solo 3\", \"que queden 3\") — poné el número final (3), el sistema calcula solo cuánto restar. NO restes vos ni uses cantidadASacar en este caso.",
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
        observaciones: {
          type: "string",
          description:
            "Pedidos especiales nuevos sobre la preparación que el cliente menciona ahora (ej. \"bien dorada\"). Se suman a las que ya hubiera, no las reemplazan. Omitir si no dijo nada especial en este mensaje.",
        },
        horaProgramada: {
          type: "string",
          description:
            "Solo si el cliente ahora pide (o cambia) una hora puntual para retirar/recibir el pedido. Formato 24hs HH:MM (ej. \"21:30\"). Omitir si no lo menciona en este mensaje.",
        },
      },
      required: [],
    },
  },
};

interface ModifyOrderArgs {
  items?: ItemArg[];
  quitar?: { nombre: string; cantidadASacar?: number; cantidadFinal?: number }[];
  canal?: "MOSTRADOR" | "DELIVERY";
  direccion?: string;
  metodoPago?: "EFECTIVO" | "TRANSFERENCIA";
  pagaCon?: number;
  observaciones?: string;
  horaProgramada?: string;
}

export async function handleModifyOrder(
  customerId: string,
  sucursalId: string,
  args: ModifyOrderArgs,
): Promise<string> {
  const order = await prisma.order.findFirst({
    where: { customerId, sucursalId, status: { in: ["PENDIENTE", "CONFIRMADO"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!order || !isSameBusinessDay(order.createdAt, new Date())) {
    return "Este cliente no tiene ningún pedido en curso de hoy para modificar — si quiere pedir algo, hay que hacer un pedido nuevo con crear_pedido, no esta herramienta.";
  }

  if (args.items && args.items.length > 0) {
    const resolved = await resolveItemsForOrder(args.items, sucursalId);
    if ("error" in resolved) return resolved.error;

    // El modelo a veces reenvía en `items` cosas que ya se habían agregado
    // antes en la misma conversación (en vez de solo lo nuevo) — a veces
    // porque el cliente solo hizo una pregunta y el modelo igual llamó a
    // esta herramienta — lo que sumaría el mismo producto dos veces y
    // cobraría de más. Si un producto/promo con la misma cantidad ya está
    // en el pedido (suelto O ya consolidado adentro de una promo), no se
    // vuelve a agregar.
    const existingItems = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    const countProductInPromoSelections = (selections: unknown, productId: string): number => {
      if (!Array.isArray(selections)) return 0;
      let count = 0;
      for (const selection of selections as Array<Record<string, unknown>>) {
        if (selection?.type === "FIJO" && selection.productId === productId) {
          count += typeof selection.cantidad === "number" ? selection.cantidad : 1;
        }
        if (selection?.type === "VARIABLE" && Array.isArray(selection.productos)) {
          count += (selection.productos as Array<{ productId?: string }>).filter(
            (p) => p?.productId === productId,
          ).length;
        }
      }
      return count;
    };
    const isAlreadyOnOrder = (item: OrderInput["items"][number]) => {
      if (item.kind === "MEDIA_MEDIA") {
        const newPair = [item.productId1, item.productId2].sort();
        return existingItems.some((existing) => {
          if (!Array.isArray(existing.selections)) return false;
          const selection = (existing.selections as Array<Record<string, unknown>>)[0];
          if (selection?.type !== "MEDIA_MEDIA" || !Array.isArray(selection.productos)) return false;
          const existingPair = (selection.productos as Array<{ productId?: string }>)
            .map((p) => p.productId)
            .sort();
          return existingPair[0] === newPair[0] && existingPair[1] === newPair[1] && existing.quantity === item.quantity;
        });
      }
      if (item.kind === "PROMOCION") {
        return existingItems.some((existing) => existing.promotionId === item.promotionId);
      }
      const looseMatch = existingItems.some(
        (existing) => existing.productId === item.productId && existing.quantity === item.quantity,
      );
      if (looseMatch) return true;
      const insidePromos = existingItems
        .filter((existing) => existing.promotionId)
        .reduce((sum, existing) => sum + countProductInPromoSelections(existing.selections, item.productId), 0);
      return insidePromos >= item.quantity;
    };

    const newItems = resolved.orderItems.filter((item) => !isAlreadyOnOrder(item));

    if (newItems.length > 0) {
      const updated = await addItemsToOrder(order.id, newItems);
      if (!updated) {
        return "Este pedido ya no se puede modificar (ya está en preparación o ya salió) — si el cliente quiere algo más, hay que hacer un pedido nuevo.";
      }
    }
  }

  if (args.quitar && args.quitar.length > 0) {
    const products = await prisma.product.findMany();
    // Cantidad actual por producto en el pedido (post cualquier agregado de
    // arriba), para poder calcular la resta cuando el cliente da la
    // cantidad final en vez de cuánto sacar.
    const currentItems = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    const currentQtyByProduct = new Map<string, number>();
    for (const item of currentItems) {
      if (!item.productId) continue;
      currentQtyByProduct.set(item.productId, (currentQtyByProduct.get(item.productId) ?? 0) + item.quantity);
    }

    const removals = args.quitar
      .map((item) => {
        const product = findProductMatch(products, item.nombre);
        if (!product) return null;

        let quantity: number;
        if (item.cantidadFinal !== undefined) {
          const current = currentQtyByProduct.get(product.id) ?? 0;
          quantity = current - item.cantidadFinal;
        } else {
          quantity = item.cantidadASacar ?? 0;
        }
        return quantity > 0 ? { productId: product.id, quantity } : null;
      })
      .filter((r): r is { productId: string; quantity: number } => r !== null);

    if (removals.length > 0) {
      const updated = await removeItemsFromOrder(order.id, removals);
      if (!updated) {
        return "Este pedido ya no se puede modificar (ya está en preparación o ya salió).";
      }
    }
  }

  if ((args.items && args.items.length > 0) || (args.quitar && args.quitar.length > 0)) {
    // Si agregar o sacar algo deja una combinación que arma una promo (ej.
    // quedan 3 empanadas sueltas + 1 pizza recién agregada), se consolida
    // sola para que salga al precio de la promo.
    await reconcilePromotions(order.id);
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

  if (args.observaciones?.trim()) {
    await updatePendingOrderNotes(order.id, args.observaciones.trim());
  }

  const scheduledFor = parseScheduledTime(args.horaProgramada);
  if (scheduledFor) {
    await updatePendingOrderSchedule(order.id, scheduledFor);
  }

  const finalOrder = await prisma.order.findUnique({ where: { id: order.id } });
  if (!finalOrder) return "Hubo un problema actualizando el pedido, reintentá.";

  const total = Number(finalOrder.total);
  const deliveryNote = finalOrder.deliveryFee
    ? ` (incluye $${Number(finalOrder.deliveryFee).toLocaleString("es-AR")} de envío a ${finalOrder.shippingAddress})`
    : "";
  const scheduleNote = finalOrder.scheduledFor
    ? ` Anotado para las ${finalOrder.scheduledFor.toLocaleTimeString("es-AR", { timeZone: BUSINESS_TIMEZONE, hour: "2-digit", minute: "2-digit" })}hs.`
    : "";

  if (finalOrder.method === "TRANSFERENCIA") {
    const preference = await createMercadoPagoPreference(finalOrder.id, total);
    if (preference) {
      return `Pedido actualizado (nuevo total $${total.toLocaleString("es-AR")}${deliveryNote}).${scheduleNote} Pasale este link de pago al cliente para que transfiera con Mercado Pago: ${preference.initPoint}`;
    }
    return `Pedido actualizado (nuevo total $${total.toLocaleString("es-AR")}${deliveryNote}).${scheduleNote} Todavía no está configurado Mercado Pago.`;
  }

  return `Pedido actualizado. Nuevo total: $${total.toLocaleString("es-AR")}${deliveryNote}, paga en efectivo.${scheduleNote}`;
}

export const CANCEL_ORDER_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: "cancelar_pedido",
    description:
      "Cancela el pedido en curso de este cliente (el más reciente que no haya salido a entregar todavía). Usar SOLO cuando el cliente confirma explícitamente que ya no lo quiere — no la llames por dudas ambiguas, primero preguntale si está seguro. Si no hay ningún pedido para cancelar, o ya está muy avanzado para cancelarlo, esta herramienta te va a avisar.",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

export async function handleCancelOrder(customerId: string, sucursalId: string): Promise<string> {
  const order = await prisma.order.findFirst({
    where: { customerId, sucursalId, status: { in: ["PENDIENTE", "CONFIRMADO"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!order || !isSameBusinessDay(order.createdAt, new Date())) {
    return "Este cliente no tiene ningún pedido en curso de hoy para cancelar.";
  }

  // No se cancela solo: queda marcado para que un cajero/vendedor lo
  // confirme a mano desde el CRM (ve un cartel grande). De cara al cliente
  // la respuesta es la misma que si ya estuviera cancelado.
  const flagged = await flagCancellationRequest(order.id);
  if (!flagged) {
    return "Este pedido ya no se puede cancelar por acá (ya salió a entregar o ya se entregó) — avisale al cliente que se comunique directo con el local.";
  }

  return "Listo, cancelamos el pedido.";
}
