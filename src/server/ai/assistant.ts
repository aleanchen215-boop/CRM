import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { prisma } from "@/lib/prisma";

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

const DEFAULT_SYSTEM_PROMPT = `Sos el asistente de ventas por WhatsApp de un negocio de comida. Respondé breve, cordial y directo, como un vendedor profesional real.

Reglas importantes:
- Todos los precios están en pesos argentinos (ARS). Nunca menciones otra moneda (dólares, pesos colombianos, etc.).
- Nunca inventes precios ni nombres de productos: usá la herramienta buscar_productos para confirmarlos antes de responder sobre precio o disponibilidad.
- Si el cliente quiere hacer un pedido, preguntale si es para retirar por el local o para que se lo enviemos, antes de avanzar.
- Si no sabés algo con certeza, decilo — no inventes.`;

const SEARCH_PRODUCTS_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: "buscar_productos",
    description:
      "Busca productos del catálogo por nombre para conocer su precio exacto. Usar siempre antes de mencionar un precio o confirmar disponibilidad.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Texto para buscar en el nombre del producto" },
      },
      required: ["query"],
    },
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

async function searchProducts(query: string): Promise<{ nombre: string; precio_ars: string }[]> {
  // Escala chica (decenas de productos): traer todo y filtrar en memoria es
  // más simple y más tolerante que armar el WHERE ideal en SQL.
  const products = await prisma.product.findMany({ take: 200 });

  const normalizedQuery = normalize(query);
  const words = normalizedQuery.split(/\s+/).filter((word) => word.length > 2);

  const matches = products.filter((product) => {
    const name = normalize(product.name);
    return name.includes(normalizedQuery) || words.some((word) => name.includes(word));
  });

  return matches.slice(0, 10).map((product) => ({
    nombre: product.name,
    precio_ars: `$${Number(product.price).toLocaleString("es-AR")}`,
  }));
}

async function getActiveSystemPrompt(): Promise<string> {
  const settings = await prisma.aiSettings.findFirst({ orderBy: { activeSince: "desc" } });
  return settings?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

export async function generateAiReply(
  history: ChatTurn[],
): Promise<{ text: string; costTokens: number }> {
  const systemPrompt = await getActiveSystemPrompt();

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history,
  ];
  let totalTokens = 0;

  // Hasta 3 vueltas: una consulta de productos normalmente alcanza, pero
  // dejamos margen por si necesita más de una búsqueda.
  for (let round = 0; round < 3; round++) {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: [SEARCH_PRODUCTS_TOOL],
    });

    totalTokens += completion.usage?.total_tokens ?? 0;
    const message = completion.choices[0]?.message;

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
        }
      } catch {
        output = "[]";
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: output });
    }
  }

  return { text: "Perdón, ¿podés repetir tu consulta?", costTokens: totalTokens };
}
