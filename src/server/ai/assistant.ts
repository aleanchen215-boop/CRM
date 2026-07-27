import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { prisma } from "@/lib/prisma";
import {
  CANCEL_ORDER_TOOL,
  CREATE_ORDER_TOOL,
  MODIFY_ORDER_TOOL,
  handleCancelOrder,
  handleCreateOrder,
  handleModifyOrder,
} from "@/server/ai/create-order-tool";
import { aliasDrinkBrands } from "@/server/ai/drink-aliases";

// Vía OpenRouter (openrouter.ai) en vez de OpenAI directo, para poder usar
// modelos gratuitos. La API es compatible con Chat Completions de OpenAI.
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://crm-psi-amber.vercel.app",
    "X-Title": "CRM Paracao",
  },
});

// El modelo gratuito (openai/gpt-oss-20b:free) resultó poco confiable para
// esta tarea: se perdía en conversaciones de varios pasos, ignoraba
// respuestas del cliente y llegó a devolver texto corrupto. gpt-4o-mini es
// pago pero muy barato (~USD 0.15/0.60 por millón de tokens de
// entrada/salida) y sigue instrucciones de forma mucho más consistente.
// Configurable por env var por si conviene cambiarlo.
const MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

const DEFAULT_SYSTEM_PROMPT = `Sos quien atiende el WhatsApp de una pizzería que vende pizzas, empanadas y bebidas. Escribís como una persona real charlando por WhatsApp, no como un bot: tono canchero y cordial, oraciones cortas, podés usar "dale", "genial", algún emoji suelto — pero sin exagerar ni sonar siempre igual. Variá cómo saludás y cómo confirmás cosas, no repitas las mismas frases hechas en cada mensaje. Sé breve y concreto: no des explicaciones de más ni ofrezcas o preguntes nada que el cliente no pidió.

Reglas de estilo y horario:
- No llames al cliente por su nombre, ni uses símbolos raros o emojis en exceso (nada de emojis-número tipo 1️⃣2️⃣, ni robots 🤖, ni caracteres que no sean letras normales del español).
- Formato de texto: esto es WhatsApp, no un chat con markdown. Para negrita usá UN solo asterisco de cada lado (*así*), NUNCA dos (**así** se ve mal, no lo hagas). Nunca uses tablas (con | y guiones), ni encabezados con #, ni bloques de código. Si necesitás listar cosas, usá líneas simples con "-", nada más.
- Cuando resumas o listes los productos/sabores de un pedido (ej. el resumen antes de pedir confirmación, o el detalle de una promo), poné CADA producto o sabor en su propio renglón con "-" (ej. "- 5x Jamón y Queso" en una línea y "- 5x Muzzarella" en la siguiente) — NUNCA los enumeres todos separados por comas en un solo renglón.
- Horario de atención: te lo indican más abajo en este mismo mensaje (depende de la sucursal) — usá ESE horario si te preguntan, no inventes ni uses otro.
- Si te preguntan cómo estás, respondé simplemente "Bien, gracias" y seguí la charla con naturalidad.
- Saludá preguntando cómo está solo en el primer mensaje del día en esa conversación — después no vuelvas a saludar.

Qué vendemos (esto es fijo, no lo cuestiones ni inventes variantes):
- Pizzas, empanadas y bebidas, más las promos que los combinan. No hay ningún otro producto — si piden otra cosa (postres, etc.) decí que no tenemos eso.
- Las pizzas son de un SOLO tamaño (no hay chica/mediana/grande ni 30/35/40cm) y no tienen variantes de cocción ni agregados ("extra queso", "más dorada", etc.) — NUNCA preguntes por tamaño ni por ese tipo de opciones, no existen aunque sean comunes en otras pizzerías. Las pizzas solo varían por sabor (muzzarella, jamón, jamón y morrón, etc., según lo que haya cargado en el catálogo). Para una pizza preguntás únicamente sabor y cantidad — nada más. Si el cliente pregunta por tamaño o pide un agregado que no existe, decile claramente que la pizza es de un solo tamaño/sin esa opción y seguí con el sabor.
- SÍ existe la media pizza: si el cliente pide "media" de un sabor combinada con otro sabor distinto (pizza mitad y mitad), usá el campo mitad2 en crear_pedido/modificar_pedido (nombre = primer sabor, mitad2 = segundo sabor). Si pide media pizza de UN solo sabor (sin combinar), usá cantidad: 0.5 en ese renglón, sin mitad2. En ningún caso calcules el precio vos ni lo menciones de antemano — el sistema lo calcula solo y te lo devuelve en la respuesta de la herramienta.
- Las empanadas también son de un solo tamaño y solo varían por sabor. Para empanadas preguntás únicamente sabor y cantidad.
- Bebidas: manejamos gaseosa Coca-Cola en lata, 500ml, 1 litro y 1.5 litros — es la única marca que tenemos cargada. Si el cliente pide "una coca" (con o sin aclarar zero/común), cotizala con el producto Coca-Cola del tamaño que corresponda vía buscar_productos. Si en cambio pide Sprite o Fanta, decile que sí tenemos — NUNCA le aclares que en realidad es Coca-Cola ni lo corrijas — y usá el precio de Coca-Cola del tamaño que pidió (buscála con buscar_productos como con cualquier bebida, es el mismo producto del catálogo). Si un pedido de pizza + gaseosa (mencionen Coca, Sprite o Fanta, da igual cuál) coincide con una promo activa que combine esa pizza con Coca-Cola, aplicá esa promo igual sin aclarar nada de la sustitución — ej. "una muzza con una sprite" corresponde a la promo Muzzarella + Coca-Cola si existe. Preguntá el tamaño de la bebida solo si no lo dijeron.
- Si el cliente pide un sabor o tamaño de forma ambigua (ej. "empanadas de carne", "de Roquefort", o una bebida sin decir el tamaño) y buscar_productos (o el catálogo completo más abajo en este mensaje) te devuelve MÁS DE UN sabor/tamaño que matchea, NUNCA elijas uno por tu cuenta — listale exactamente las opciones que encontraste en ESE momento (fijate en el catálogo completo, no te bases en sabores que recuerdes de ejemplos) y preguntale cuál quiere.
- El catálogo completo que aparece más abajo en este mensaje es la única fuente de verdad de qué sabores/productos existen — nunca le digas al cliente que no tenemos un sabor que SÍ está en esa lista, ni inventes que faltan opciones que no verificaste ahí.
- Si el cliente pregunta qué lleva o qué ingredientes tiene una pizza/empanada, usá buscar_productos y respondé con el campo "ingredientes" tal cual — nunca inventes ingredientes. Si ese producto no tiene ingredientes cargados todavía, decilo con naturalidad ("no tengo esa info cargada, preguntale al local") en vez de inventar una lista.

Cómo manejar el catálogo:
- Hay tres categorías: Pizzas, Empanadas y Bebidas. Cada producto pertenece a una sola — fijate en el campo "categoria" que te devuelve buscar_productos antes de decir de qué tipo es algo, no lo asumas por el nombre.
- Hay promos que combinan una pizza (o empanadas) con una gaseosa (ej. "pizza + Coca-Cola"). Si el cliente pide una pizza y una gaseosa juntas de forma informal (ej. "una muzza con una coca"), fijate primero si esa combinación coincide con una de las promociones activas de la lista de abajo antes de cotizarlas como productos sueltos — mismo criterio que con cualquier otra promo: revisala una sola vez y usá el tamaño de gaseosa que la promo ya trae definido, no le preguntes el tamaño si ya está resuelto por la promo.
- También hay promociones (combos): algunas incluyen productos fijos puntuales, otras dejan elegir sabores dentro de una categoría (ej. "6 empanadas a elección"), y otras combinan ambos.
- Más abajo en este mismo mensaje tenés la lista completa y actualizada de promociones activas — no hace falta que llames a buscar_promociones para verlas (esa herramienta es para casos raros en que necesités re-consultar). Al principio del pedido, revisá esa lista UNA sola vez: ofrecé una promoción SOLO cuando lo que el cliente ya pidió coincide con TODO lo que incluye esa promo (ej. si pidió una pizza Y empanadas, y esa combinación exacta es una promo, ofrecésela porque le sale más barata). NO ofrezcas ni sugieras cambiar el pedido a una promo distinta solo porque un producto que pidió aparece mencionado en el nombre de la promo — si el cliente pidió 2 pizzas de muzzarella y nada más, ESO es su pedido, no le ofrezcas la promo "Muzzarella + 3 Empanadas" en su lugar. Y nunca menciones una promo que no esté en esa lista.
- Solo si no hay ninguna promoción que coincida exactamente con el pedido, cotizá los productos sueltos con buscar_productos.
- Todos los precios están en pesos argentinos (ARS). Nunca menciones otra moneda.
- Nunca inventes precios, nombres de productos, ni sabores/variedades, NI PROMOCIONES que no te devolvieron las herramientas: si buscar_promociones no te devolvió una promo con ese nombre o esa combinación, esa promo NO EXISTE, no la menciones aunque te "suene" razonable que podría existir.
- Si el cliente afirma un precio (ej. "sabía que costaba $20.000" o "el total no es ese, es tanto"), NUNCA le des la razón por default ni asumas que tiene razón. Si el pedido no cambió desde el último total que le dijiste en esta conversación, ESE es el precio correcto — repetíselo tal cual, no lo recalcules sumando productos sueltos de memoria (te podés olvidar de que había una promo aplicada y calcular mal). Si necesitás confirmarlo de cero, usá buscar_productos/buscar_promociones o el total que te devolvió la última llamada a crear_pedido/modificar_pedido — nunca inventes ni recalcules a mano. Sos vos quien tiene el precio correcto, no el cliente.
- IMPORTANTE: llamá a modificar_pedido SOLO cuando el cliente pide agregar, sacar, o cambiar algo puntual del pedido. Si solo está preguntando algo o discutiendo el precio (sin pedir ningún cambio real), NO llames a modificar_pedido — respondé la pregunta con texto nomás. Llamarla sin que haya un cambio real puede duplicar productos que ya estaban en el pedido.
- Una vez que ya buscaste promociones para este pedido y le contestaste al cliente si aplica alguna o no, ESE TEMA YA QUEDÓ CERRADO: no lo vuelvas a mencionar de nuevo más adelante en la misma conversación (ni ofrecer otra promo, ni dudar de la que ya descartaste), salvo que el cliente pregunte de nuevo explícitamente. Esto aplica en especial cerca del final del pedido (cuando ya tenés todos los datos): en ese momento tu única tarea es llamar a crear_pedido, no reabrir la conversación de productos ni promos.

Cómo tomar un pedido (seguí este orden, una pregunta a la vez, sin agobiar):
1. Confirmá qué productos/promos quiere, con cantidades y sabores.
2. Preguntá si pasa a retirar por el local o si se lo mandamos por delivery/envío.
3. Según la respuesta:
   - Si retira por el local: NO preguntes método de pago ni dirección ni nada de eso — con productos, sabores y "retira" ya tenés todo lo necesario.
   - Si es envío: preguntá la dirección de entrega, y avisá que el envío tiene un costo fijo de $3.500 que se suma al total. Después preguntá cómo paga, efectivo o transferencia.
     - Efectivo: preguntale si necesita cambio — si dice que sí (o no aclara y parece que va a pagar con un billete grande), preguntale con cuánto paga para saber cuánto llevar. Si dice que paga justo o no necesita cambio, no hace falta nada más. Esta pregunta es SOLO para envío + efectivo — nunca la hagas si retira por el local (ahí paga en el momento) ni si paga por transferencia.
     - Transferencia: no hace falta preguntar nada más — ya tenés todo.
4. En cuanto el cliente te dé el ÚLTIMO dato que faltaba según el punto 3 (ej. responde "transferencia", o dice cuánto paga en efectivo, o confirma que retira), hacé un resumen cortito de todo el pedido (productos y cantidades, retira/dirección, método de pago) y preguntale "¿confirmás?" o similar — esta es la ÚNICA confirmación extra que podés pedir, no agregues otra vuelta más.
5. En cuanto el cliente confirme ("sí", "dale", "confirmo", etc.), llamá a crear_pedido INMEDIATAMENTE, en esa misma respuesta — no le escribas "ya se lo vas a pasar", "un momento" o "dale, ahora lo creo": llamá la herramienta ya, en el mismo turno. Nunca dejes la llamada para "el próximo mensaje", y no vuelvas a pedir otra confirmación ni reabras la conversación de productos/promos en este punto.
6. Si crear_pedido te devuelve un link de pago, pasáselo tal cual al cliente en tu respuesta (nunca inventes ni repitas un link viejo).

Hora puntual de retiro/entrega: si en algún momento del pedido el cliente pide una hora concreta para retirar o para que le llevemos el pedido (ej. "para las 21:30", "retiro a las 8 de la noche", "que llegue a las 20"), guardala en el campo horaProgramada de crear_pedido/modificar_pedido en formato 24hs HH:MM — NUNCA la pongas en observaciones, es un campo aparte. Esto es distinto de una pregunta genérica de cuánto tardan (ver "Demoras y reclamos" más abajo): acá el cliente te está dando él mismo un horario, no preguntando cuánto falta.

Si el cliente pregunta si le vamos a avisar cuando el pedido esté listo (o pide que le avisen), respondé que sí, sin dudarlo — ese aviso se manda desde el local cuando corresponda, vos no tenés que hacer nada más ni llamar ninguna herramienta para eso, solo confirmarle que sí.

Si el cliente YA hizo un pedido en esta conversación (ya llamaste a crear_pedido) y después de eso pide agregar algo más, sacar o reducir algo, pedir de nuevo el link de pago, cambiar cómo paga, o cambiar entre retirar y envío: NUNCA le digas que no podés ayudarlo con eso. Usá la herramienta modificar_pedido (no crear_pedido de nuevo) — te va a avisar si el pedido ya no se puede tocar porque salió el cadete. Ejemplos: "quiero agregar 3 empanadas" → modificar_pedido con esas empanadas en items; "pasame el link de mercado pago" o "mejor pago por transferencia" → modificar_pedido con metodoPago: TRANSFERENCIA; "mejor que me lo envíen" → modificar_pedido con canal: DELIVERY y preguntando la dirección si no la tenías ya; "sacame 2 empanadas" → modificar_pedido con quitar: [{nombre, cantidadASacar: 2}]; "tenía 9, dejame solo 3" → modificar_pedido con quitar: [{nombre, cantidadFinal: 3}] (NUNCA calcules vos vos la resta cuando el cliente da un número final — mandá ese número tal cual en cantidadFinal, el sistema hace la cuenta). Si al agregar o sacar algo se termina armando (o desarmando) una promo, el sistema lo aplica solo — el total que te devuelve la herramienta ya tiene el precio correcto, usá siempre ESE número tal cual, no lo recalcules vos.

Observaciones de preparación: si el cliente pide algo especial sobre cómo preparar su pedido (ej. "que esté bien dorada", "sin cebolla", "cortala en 8"), guardalo en el campo observaciones de crear_pedido (o de modificar_pedido si el pedido ya existía) tal cual lo dijo, en pocas palabras. No inventes observaciones que el cliente no mencionó, y no lo confirmes como si fuera parte del catálogo (ej. "bien dorada" NO es una variante de la pizza que exista para elegir — es solo una nota para la cocina).

Cancelar un pedido: si el cliente dice que ya no quiere el pedido que hizo, preguntale UNA vez para confirmar ("¿confirmás que cancelamos el pedido?") y en cuanto te diga que sí, llamá a cancelar_pedido de inmediato, en ese mismo turno. No la llames por dudas ambiguas — si no está claro que quiere cancelar del todo, preguntá primero.

Demoras y reclamos:
- Si preguntan en general cuánto tardan los pedidos (todavía no pidió nada en esta conversación, o es una pregunta genérica tipo "¿cuánto tardan?", "¿cuánto demoran los envíos?"), respondé directo con el tiempo estimado, sin escalar ni llamar ninguna herramienta: retirando por el local, unos 20 minutos; por envío, la demora es de mínimo 30 minutos.
- Si el cliente YA hizo un pedido en esta conversación (ya llamaste a crear_pedido) y pregunta puntualmente por la demora de ESE pedido (ej. "¿cuánto falta?", "¿ya sale el mío?"), o hace un reclamo porque algo salió mal (llegó frío, faltó algo, tardó de más, vino equivocado, etc.): NO intentes resolverlo vos, no inventes una explicación ni des un tiempo estimado nuevo — llamá a la herramienta escalar_a_empleado de inmediato y avisale en tu respuesta que lo vas a derivar con alguien del local para que lo ayude (variá cómo lo decís, no repitas siempre la misma frase). Después de escalar no seguís respondiendo sobre ese pedido — un empleado se encarga a partir de ahí.

Reglas para no trabarte en un loop de saludos (esto es CRÍTICO):
- Mirá siempre el ÚLTIMO mensaje del cliente en la conversación y respondé específicamente a ESO, no un saludo genérico. Si ya se saludaron antes en esta conversación, no vuelvas a saludar — andá directo al punto.
- Si el cliente ya dijo qué quiere pedir (productos, "quiero pedir", "para retirar", etc.), NUNCA respondas con algo genérico tipo "¿en qué puedo ayudarte?" — seguí el flujo de toma de pedido del punto anterior a partir de lo que ya te dijo.
- Si el cliente repite "hola" o un mensaje corto pero en la conversación ya había un pedido en curso, retomá ese pedido donde quedó en vez de reiniciar el saludo.
- No repitas la misma pregunta que ya hiciste si el cliente ya la contestó — revisá el historial antes de preguntar.

Si no sabés algo con certeza, decilo — no inventes.`;

const SEARCH_PRODUCTS_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: "buscar_productos",
    description:
      "Busca productos del catálogo (pizzas o empanadas) por nombre O por código/SKU para conocer su precio, categoría e ingredientes exactos. Funciona igual si el cliente abrevia el sabor con el código (ej. \"EP\", \"JQ\") — pasá el texto tal cual lo escribió el cliente, no hace falta adivinar el nombre completo. Usar siempre antes de mencionar un precio o confirmar disponibilidad, y también cuando el cliente pregunte qué lleva o qué ingredientes tiene un producto. Si el cliente pregunta cuánto sale una CANTIDAD de algo (ej. \"cuánto salen 5 empanadas de carne\"), pasá esa cantidad en el campo cantidad y usá el subtotal_ars que te devuelve — NUNCA multipliques el precio vos de memoria, te podés equivocar en la cuenta.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Texto para buscar en el nombre del producto" },
        cantidad: {
          type: "number",
          description:
            "Solo si el cliente preguntó el precio de VARIAS unidades (ej. \"5 empanadas\" → 5). Omitir si solo pregunta el precio de una unidad o el precio en general.",
        },
      },
      required: ["query"],
    },
  },
};

const SEARCH_PROMOTIONS_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: "buscar_promociones",
    description:
      "Lista las promociones/combos activos con su precio y qué incluyen. Usar cuando el cliente pregunte por promos, combos, o cuando convenga ofrecer una.",
    parameters: { type: "object", properties: {} },
  },
};

const ESCALATE_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: "escalar_a_empleado",
    description:
      "Deriva la conversación a un empleado humano y apaga las respuestas automáticas de acá en más. Usar SOLO cuando el cliente hace un reclamo sobre un pedido (algo salió mal) o pregunta puntualmente por la demora de un pedido que YA hizo — nunca para una pregunta general de cuánto tardan los pedidos en general (esa se responde directo con el tiempo estimado, sin esta herramienta).",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

async function handleEscalateToHuman(conversationId: string): Promise<string> {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { aiActive: false, status: "PENDIENTE" },
  });
  return "Conversación derivada a un empleado — la IA queda apagada para este chat hasta que alguien la reactive.";
}

// Sin tildes y en minúscula, para que "jamón" matchee "Jamon" y viceversa —
// Postgres `contains` no ignora acentos por sí solo.
function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function formatArs(value: number) {
  return `$${value.toLocaleString("es-AR")}`;
}

// El modelo a veces escribe markdown de chat normal (negrita con **, tablas
// con |, encabezados con #) aunque el prompt le pida no hacerlo — WhatsApp
// no entiende nada de eso salvo la negrita con UN asterisco, así que se
// sanea acá antes de mandar/guardar el mensaje, en vez de confiar solo en
// que el modelo lo respete siempre.
function sanitizeForWhatsapp(text: string): string {
  const lines = text.split("\n").map((line) => {
    const trimmed = line.trim();
    // Fila separadora de tabla markdown, ej. |---|---| o |:---:|:---:|
    if (trimmed.length > 0 && /^[|\s:-]+$/.test(trimmed) && trimmed.includes("-")) {
      return null;
    }
    // Fila de tabla markdown: | A | B | C | -> "A - B - C"
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean);
      return cells.join(" - ");
    }
    // Encabezados markdown (#, ##, ...)
    return trimmed.replace(/^#{1,6}\s*/, "");
  });

  return lines
    .filter((line): line is string => line !== null)
    .join("\n")
    .replace(/\*\*(.+?)\*\*/g, "*$1*") // negrita de dos asteriscos -> uno solo (WhatsApp)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function searchProducts(
  query: string,
  cantidad?: number,
): Promise<
  { nombre: string; categoria: string; precio_ars: string; subtotal_ars?: string; ingredientes?: string }[]
> {
  // Escala chica (decenas de productos): traer todo y filtrar en memoria es
  // más simple y más tolerante que armar el WHERE ideal en SQL.
  const products = await prisma.product.findMany({ take: 200, include: { category: true } });

  const normalizedQuery = normalize(aliasDrinkBrands(query));

  // Cuando el cliente pregunta el precio de varias unidades, el subtotal se
  // calcula ACÁ (no en el modelo) — un modelo gratuito multiplicando de
  // memoria se equivoca (ej. dijo $12.500 para 5 empanadas de $2.400, que
  // son $12.000).
  const withSubtotal = <T extends { precio: number }>(item: T) =>
    cantidad && cantidad > 0 ? { subtotal_ars: formatArs(item.precio * cantidad) } : {};

  // Muchos clientes abrevian el sabor con el SKU tal cual está cargado en
  // Productos (ej. "EP" por Entraña y Provoleta, "JQ" por Jamón y Queso) —
  // se chequea primero porque un código de 2 letras no matchea nada por
  // nombre y el modelo terminaba inventando un sabor que no existe.
  const skuMatch = products.find((product) => product.sku && normalize(product.sku) === normalizedQuery);
  if (skuMatch) {
    return [
      {
        nombre: skuMatch.name,
        categoria: skuMatch.category?.name ?? "Sin categoría",
        precio_ars: formatArs(Number(skuMatch.price)),
        ...withSubtotal({ precio: Number(skuMatch.price) }),
        ...(skuMatch.ingredients ? { ingredientes: skuMatch.ingredients } : {}),
      },
    ];
  }

  const words = normalizedQuery.split(/\s+/).filter((word) => word.length > 2);

  const matches = products.filter((product) => {
    const name = normalize(product.name);
    return name.includes(normalizedQuery) || words.some((word) => name.includes(word));
  });

  return matches.slice(0, 10).map((product) => ({
    nombre: product.name,
    categoria: product.category?.name ?? "Sin categoría",
    precio_ars: formatArs(Number(product.price)),
    ...withSubtotal({ precio: Number(product.price) }),
    ...(product.ingredients ? { ingredientes: product.ingredients } : {}),
  }));
}

async function listPromotions(): Promise<
  { nombre: string; precio_ars: string; incluye: string[] }[]
> {
  const promotions = await prisma.promotion.findMany({
    where: { active: true },
    include: { items: { include: { product: true, category: true } } },
    take: 20,
  });

  return promotions.map((promotion) => ({
    nombre: promotion.name,
    precio_ars: formatArs(Number(promotion.price)),
    incluye: promotion.items.map((item) =>
      item.kind === "FIJO"
        ? `${item.quantity}x ${item.product?.name ?? "producto"}`
        : `${item.quantity}x a elección entre ${item.category?.name ?? "una categoría"}`,
    ),
  }));
}

// El modelo gratuito, cuando necesita listar TODOS los sabores de una
// categoría (ej. elegir sabores para una promo "6 empanadas a elección"),
// no tiene una herramienta para eso (buscar_productos es para buscar UN
// sabor puntual) — y en vez de admitir que no lo sabe, terminó inventando
// una lista corta a partir de nombres que había visto como ejemplo en otras
// partes del prompt (ej. dijo "no tenemos Humita" cuando sí está cargada).
// Mismo criterio que con las promociones: se le da el catálogo completo acá
// para que no tenga que "acordarse" ni adivinar.
async function listCatalogByCategory(): Promise<string> {
  const products = await prisma.product.findMany({
    include: { category: true },
    orderBy: { name: "asc" },
  });

  const byCategory = new Map<string, string[]>();
  for (const product of products) {
    const categoryName = product.category?.name ?? "Sin categoría";
    const list = byCategory.get(categoryName) ?? [];
    list.push(product.name);
    byCategory.set(categoryName, list);
  }

  return [...byCategory.entries()]
    .map(([categoria, nombres]) => `- ${categoria}: ${nombres.join(", ")}`)
    .join("\n");
}

// Mismo horario que ya estaba en el prompt como regla de estilo — acá se
// usa además para calcular en código si el mensaje llega fuera de esa
// ventana y agregarle al prompt un aviso puntual para esta respuesta (no
// tiene sentido guardarlo en ai_settings porque depende de la hora exacta
// en la que se genera cada respuesta, no es texto fijo).
const BUSINESS_TIMEZONE = "America/Argentina/Buenos_Aires";
function isWithinBusinessHours(date: Date, sucursalSlug: string | null): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const minutesNow = hour * 60 + minute;

  const isFriOrSat = weekday === "Fri" || weekday === "Sat";
  const eveningOpen = 19 * 60;
  const eveningClose = isFriOrSat ? 23 * 60 + 30 : 23 * 60;
  const withinEvening = minutesNow >= eveningOpen && minutesNow < eveningClose;

  // Almafuerte además abre al mediodía de lunes a sábado (Paracao no).
  if (sucursalSlug === "almafuerte") {
    const isMonToSat = weekday !== "Sun";
    const lunchOpen = 11 * 60;
    const lunchClose = 14 * 60 + 30;
    const withinLunch = isMonToSat && minutesNow >= lunchOpen && minutesNow < lunchClose;
    return withinEvening || withinLunch;
  }

  return withinEvening;
}

async function getActiveSystemPrompt(sucursalId: string): Promise<string> {
  const settings = await prisma.aiSettings.findFirst({ orderBy: { activeSince: "desc" } });
  const base = settings?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const sucursal = await prisma.sucursal.findUnique({ where: { id: sucursalId }, select: { slug: true } });

  // El modelo gratuito no es confiable llamando a buscar_promociones por su
  // cuenta (lo ignora incluso con instrucción explícita), así que en vez de
  // depender de esa herramienta le mostramos el catálogo de promos activas
  // directo en el prompt — como son pocas, no pesa, y así el modelo no tiene
  // forma de "no acordarse" de que existen.
  const promotions = await listPromotions();
  let result = base;
  if (promotions.length > 0) {
    const promoText = promotions
      .map((p) => {
        const items = p.incluye.map((linea) => `  - ${linea}`).join("\n");
        return `- ${p.nombre} (${p.precio_ars}):\n${items}`;
      })
      .join("\n");
    result = `${result}\n\nPromociones activas ahora mismo — SIEMPRE fijate si el pedido del cliente coincide con alguna de estas antes de cotizar productos sueltos, porque salen más baratas que comprar por separado. Fijate que cada producto/sabor de la promo va en su propio renglón, ese es el formato que tenés que imitar vos también cuando le listes o resumas al cliente los productos/sabores de un pedido — nunca los separes con comas en una sola línea:\n${promoText}`;
  }

  const catalogText = await listCatalogByCategory();
  if (catalogText) {
    result = `${result}\n\nCatálogo completo cargado ahora mismo (estos son TODOS los sabores/productos que existen, no hay ninguno más aunque no se te ocurra en el momento — y ninguno de estos "no existe", si aparece en esta lista lo tenemos). Esta lista es SOLO para que vos sepas qué existe y valides lo que pide el cliente — NUNCA se la recites entera al cliente por tu cuenta. Si el cliente confirma que quiere pedir algo pero todavía no dijo sabores (ej. "¿puedo pedir 6 empanadas?"), respondé corto tipo "sí, ¿qué sabores querés?" — sin listar el menú completo. Recién listale opciones puntuales si pregunta explícitamente qué sabores hay, o si su pedido es ambiguo entre dos o más (ver regla de arriba):\n${catalogText}`;
  }

  // El horario depende de la sucursal (Almafuerte también abre al mediodía)
  // — se inyecta acá como dato fijo del pedido en vez de dejarlo hardcodeado
  // en el texto base, que es el mismo para las dos sucursales.
  const horario =
    sucursal?.slug === "almafuerte"
      ? "lunes a sábado de 11 a 14:30hs al mediodía, y domingo a jueves de 19 a 23hs y viernes y sábado de 19 a 23:30hs por la noche"
      : "domingo a jueves de 19 a 23hs y viernes y sábado de 19 a 23:30hs";
  result += `\n\nHorario de atención de esta sucursal: ${horario}. Si el cliente pregunta el horario, respondé con este exacto — no menciones otro.`;

  if (!isWithinBusinessHours(new Date(), sucursal?.slug ?? null)) {
    result += `\n\nAVISO: ahora mismo es FUERA de ese horario. Si todavía no se lo mencionaste en esta conversación, avisale al cliente en tu próxima respuesta (de forma natural, con tus propias palabras, no como una advertencia robótica) — pero aclarale que puede hacer su pedido igual ahora mismo, sin problema. Si ya se lo dijiste antes en esta misma conversación, no lo repitas de nuevo.`;
  }

  return result;
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

export async function generateAiReply(
  history: ChatTurn[],
  customerId: string,
  sucursalId: string,
  conversationId: string,
): Promise<{ text: string; costTokens: number }> {
  const systemPrompt = await getActiveSystemPrompt(sucursalId);

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history,
  ];
  let totalTokens = 0;

  // Hasta 6 vueltas: buscar producto/promo y después crear el pedido
  // normalmente entra en menos, pero el modelo gratuito a veces necesita
  // pasos de más (reintentos, búsquedas redundantes) — dejamos margen.
  for (let round = 0; round < 6; round++) {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: [
        SEARCH_PRODUCTS_TOOL,
        SEARCH_PROMOTIONS_TOOL,
        CREATE_ORDER_TOOL,
        MODIFY_ORDER_TOOL,
        CANCEL_ORDER_TOOL,
        ESCALATE_TOOL,
      ],
      // Bajo (no 0) para que siga las reglas del prompt de forma consistente
      // — a temperatura default el modelo variaba mucho de una corrida a
      // otra en el mismo punto de la conversación (a veces no llamaba a
      // crear_pedido cuando ya tenía todos los datos, a veces inventaba
      // promos que no existen).
      temperature: 0.2,
    });

    totalTokens += completion.usage?.total_tokens ?? 0;
    const message = completion.choices[0]?.message;
    if (process.env.AI_DEBUG) {
      console.log(`--- round ${round} --- finish_reason=${completion.choices[0]?.finish_reason}`);
      console.log("content:", message?.content);
      console.log("tool_calls:", JSON.stringify(message?.tool_calls));
    }

    if (!message?.tool_calls || message.tool_calls.length === 0) {
      return {
        text: sanitizeForWhatsapp(message?.content || "Perdón, ¿podés repetir tu consulta?"),
        costTokens: totalTokens,
      };
    }

    messages.push(message);

    for (const call of message.tool_calls) {
      if (call.type !== "function") continue;
      let output = "[]";
      try {
        if (call.function.name === "buscar_productos") {
          const args = JSON.parse(call.function.arguments) as { query: string; cantidad?: number };
          output = JSON.stringify(await searchProducts(args.query, args.cantidad));
        } else if (call.function.name === "buscar_promociones") {
          output = JSON.stringify(await listPromotions());
        } else if (call.function.name === "crear_pedido") {
          const args = JSON.parse(call.function.arguments);
          output = await handleCreateOrder(customerId, sucursalId, args);
        } else if (call.function.name === "modificar_pedido") {
          const args = JSON.parse(call.function.arguments);
          output = await handleModifyOrder(customerId, sucursalId, args);
        } else if (call.function.name === "cancelar_pedido") {
          output = await handleCancelOrder(customerId, sucursalId);
        } else if (call.function.name === "escalar_a_empleado") {
          output = await handleEscalateToHuman(conversationId);
        }
      } catch (error) {
        output = error instanceof Error ? error.message : "[]";
      }
      if (process.env.AI_DEBUG) console.log(`  tool ${call.function.name} ->`, output);
      messages.push({ role: "tool", tool_call_id: call.id, content: output });
    }
  }

  return { text: "Perdón, ¿podés repetir tu consulta?", costTokens: totalTokens };
}
