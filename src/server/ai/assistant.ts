import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { prisma } from "@/lib/prisma";
import { CREATE_ORDER_TOOL, handleCreateOrder } from "@/server/ai/create-order-tool";

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

// Confirmado en openrouter.ai/api/v1/models: modelo gratuito con soporte de
// tool-calling. Configurable por env var por si conviene cambiarlo.
const MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-20b:free";

const DEFAULT_SYSTEM_PROMPT = `Sos quien atiende el WhatsApp de una pizzería que vende pizzas y empanadas. Escribís como una persona real charlando por WhatsApp, no como un bot: tono canchero y cordial, oraciones cortas, podés usar "dale", "genial", algún emoji suelto — pero sin exagerar ni sonar siempre igual. Variá cómo saludás y cómo confirmás cosas, no repitas las mismas frases hechas en cada mensaje.

Cómo manejar el catálogo:
- Hay dos categorías: Pizzas y Empanadas. Cada producto pertenece a una sola — fijate en el campo "categoria" que te devuelve buscar_productos antes de decir si algo es pizza o empanada, no lo asumas por el nombre.
- También hay promociones (combos): algunas incluyen productos fijos puntuales, otras dejan elegir sabores dentro de una categoría (ej. "6 empanadas a elección"), y otras combinan ambos. Usá buscar_promociones para ofrecerlas cuando tenga sentido o pregunten por combos/promos.
- Todos los precios están en pesos argentinos (ARS). Nunca menciones otra moneda.
- Nunca inventes precios ni nombres de productos: usá buscar_productos o buscar_promociones para confirmarlos antes de hablar de precio o disponibilidad.

Cómo tomar un pedido (seguí este orden, una pregunta a la vez, sin agobiar):
1. Confirmá qué productos/promos quiere, con cantidades y sabores si son variables.
2. Preguntá si pasa a retirar por el local o si se lo mandamos por delivery.
3. Preguntá cómo paga: efectivo o transferencia.
   - Si es efectivo: preguntá con cuánto paga, para saber si hay que llevar vuelto (si dice que paga justo, no hace falta nada más).
   - Si es transferencia: avisale que le vas a pasar un link de pago de Mercado Pago para que abone el total.
4. Recién cuando tengas TODO confirmado (productos, retira o envío, método de pago, y el dato del vuelto si aplica), llamá a crear_pedido una sola vez. No lo llames antes de tener todos los datos.
5. Si crear_pedido te devuelve un link de pago, pasáselo tal cual al cliente en tu respuesta.

Si no sabés algo con certeza, decilo — no inventes.`;

const SEARCH_PRODUCTS_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: "buscar_productos",
    description:
      "Busca productos del catálogo (pizzas o empanadas) por nombre para conocer su precio y categoría exactos. Usar siempre antes de mencionar un precio o confirmar disponibilidad.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Texto para buscar en el nombre del producto" },
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

async function searchProducts(
  query: string,
): Promise<{ nombre: string; categoria: string; precio_ars: string }[]> {
  // Escala chica (decenas de productos): traer todo y filtrar en memoria es
  // más simple y más tolerante que armar el WHERE ideal en SQL.
  const products = await prisma.product.findMany({ take: 200, include: { category: true } });

  const normalizedQuery = normalize(query);
  const words = normalizedQuery.split(/\s+/).filter((word) => word.length > 2);

  const matches = products.filter((product) => {
    const name = normalize(product.name);
    return name.includes(normalizedQuery) || words.some((word) => name.includes(word));
  });

  return matches.slice(0, 10).map((product) => ({
    nombre: product.name,
    categoria: product.category?.name ?? "Sin categoría",
    precio_ars: formatArs(Number(product.price)),
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

async function getActiveSystemPrompt(): Promise<string> {
  const settings = await prisma.aiSettings.findFirst({ orderBy: { activeSince: "desc" } });
  return settings?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

export async function generateAiReply(
  history: ChatTurn[],
  customerId: string,
): Promise<{ text: string; costTokens: number }> {
  const systemPrompt = await getActiveSystemPrompt();

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history,
  ];
  let totalTokens = 0;

  // Hasta 4 vueltas: buscar producto/promo y después crear el pedido
  // normalmente entra, pero dejamos margen por si necesita más pasos.
  for (let round = 0; round < 4; round++) {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: [SEARCH_PRODUCTS_TOOL, SEARCH_PROMOTIONS_TOOL, CREATE_ORDER_TOOL],
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
        text: message?.content || "Perdón, ¿podés repetir tu consulta?",
        costTokens: totalTokens,
      };
    }

    messages.push(message);

    for (const call of message.tool_calls) {
      if (call.type !== "function") continue;
      let output = "[]";
      try {
        if (call.function.name === "buscar_productos") {
          const args = JSON.parse(call.function.arguments) as { query: string };
          output = JSON.stringify(await searchProducts(args.query));
        } else if (call.function.name === "buscar_promociones") {
          output = JSON.stringify(await listPromotions());
        } else if (call.function.name === "crear_pedido") {
          const args = JSON.parse(call.function.arguments);
          output = await handleCreateOrder(customerId, args);
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
