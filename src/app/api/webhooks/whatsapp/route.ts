import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyYCloudSignature } from "@/server/integrations/whatsapp/verify";
import { sendWhatsappTextMessage } from "@/server/integrations/whatsapp/client";
import { generateAiReply, type ChatTurn } from "@/server/ai/assistant";
import type { YCloudInboundMessageEvent } from "@/server/integrations/whatsapp/types";

// Cuánto esperar desde el último mensaje del cliente antes de generar la
// respuesta — si escribe varios mensajes seguidos (típico de WhatsApp: manda
// "buenas noches", "quiero una promo especial", "con envío a tal dirección",
// su nombre, cómo paga... todo en mensajes separados en vez de uno solo), sin
// esto la IA contestaba cada uno por separado (7 respuestas sueltas y
// apuradas en vez de una sola bien armada). 8s es un margen razonable para
// que termine de escribir sin sentirse demorado.
const DEBOUNCE_MS = 8000;

// Ver comentario en el uso más abajo — 4hs sin mensajes del cliente ni de la
// IA se considera conversación terminada.
const STALE_CONVERSATION_MS = 4 * 60 * 60 * 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Caso puntual a pedido del dueño: Johana (clienta de Almafuerte) pide
// picada de vez en cuando y esos pedidos los quiere atender él mismo, no la
// IA — se detecta acá (no en el prompt) porque depender de que el modelo
// "se acuerde" del nombre de una clienta puntual es frágil; esto es
// determinístico y no falla.
function needsHumanForJohanaPicada(sucursalSlug: string, customerFirstName: string, messageText: string): boolean {
  return (
    sucursalSlug === "almafuerte" &&
    normalize(customerFirstName).includes("johana") &&
    normalize(messageText).includes("picada")
  );
}

async function respondWithAi(
  conversationId: string,
  customerId: string,
  customerWhatsapp: string,
  sucursalId: string,
  triggerMessageId: string,
) {
  // Espera el margen de debounce y recién ahí chequea si el mensaje que
  // disparó esta invocación sigue siendo el último del cliente en la
  // conversación — si mientras tanto llegó uno más nuevo (otro mensaje del
  // mismo cliente, procesado por otra invocación de este mismo webhook), esa
  // invocación más nueva es la que va a terminar respondiendo por todos, así
  // que esta se retira sin mandar nada. El resultado: un solo mensaje de
  // respuesta que ya tiene en su historial TODOS los mensajes de la tanda,
  // no uno por cada mensaje suelto.
  await sleep(DEBOUNCE_MS);
  const latestFromCustomer = await prisma.message.findFirst({
    where: { conversationId, sender: "CLIENTE" },
    orderBy: { createdAt: "desc" },
  });
  if (latestFromCustomer?.id !== triggerMessageId) return;

  const recentMessages = await prisma.message.findMany({
    // Solo cliente/IA: si un empleado tomó la conversación manualmente, esas
    // respuestas no deben aparecer como si la IA misma las hubiera dicho —
    // confundía al modelo y lo hacía repetir saludos genéricos en vez de
    // seguir la conversación real.
    where: { conversationId, sender: { in: ["CLIENTE", "IA"] } },
    orderBy: { createdAt: "asc" },
    take: 30,
  });

  const history: ChatTurn[] = recentMessages
    .slice(-20)
    .map((message) => ({
      role: message.sender === "CLIENTE" ? "user" : "assistant",
      content: message.content,
    }));

  try {
    const { text, costTokens } = await generateAiReply(history, customerId, sucursalId, conversationId);
    const whatsappMessageId = await sendWhatsappTextMessage(customerWhatsapp, text, sucursalId);

    const message = await prisma.message.create({
      data: {
        conversationId,
        sender: "IA",
        content: text,
        type: "TEXTO",
        approved: true,
        whatsappMessageId: whatsappMessageId || undefined,
      },
    });

    await prisma.aiResponseLog.create({
      data: { messageId: message.id, response: text, approved: true, costTokens },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });
  } catch (error) {
    // No relanzamos: esto corre después de responderle 200 a YCloud, así que
    // un error acá no debe reintentar la entrega del webhook.
    console.error("Error generando respuesta de IA:", error);
  }
}

export async function POST(request: Request) {
  // Se lee como texto (no .json()) porque la verificación de firma necesita
  // el body crudo exacto — parsearlo antes rompería el hash.
  const rawBody = await request.text();
  const signature = request.headers.get("ycloud-signature");

  if (!verifyYCloudSignature(rawBody, signature)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const event = JSON.parse(rawBody) as YCloudInboundMessageEvent;

  if (event.type === "whatsapp.inbound_message.received" && event.whatsappInboundMessage) {
    const inbound = event.whatsappInboundMessage;

    // Fase 1: solo texto. Imagen/audio/ubicación se suman más adelante.
    if (inbound.type === "text" && inbound.text) {
      // Qué sucursal recibió el mensaje según el número al que escribió el
      // cliente (inbound.to) — así cuando se conecte el WhatsApp de otra
      // sucursal alcanza con cargar su número, sin tocar código acá.
      const sucursal =
        (await prisma.sucursal.findUnique({ where: { whatsappNumber: inbound.to } })) ??
        (await prisma.sucursal.findUniqueOrThrow({ where: { slug: "paracao" } }));

      const customer = await prisma.customer.upsert({
        where: { whatsapp: inbound.from },
        create: {
          whatsapp: inbound.from,
          firstName: inbound.customerProfile?.name ?? "Sin nombre",
          lastName: "",
          origin: "WhatsApp",
        },
        update: {},
      });

      let conversation = await prisma.conversation.findFirst({
        where: { customerId: customer.id, sucursalId: sucursal.id, status: { not: "CERRADA" } },
        orderBy: { lastMessageAt: "desc" },
      });

      // Una conversación sin actividad hace más de 4hs se da por cerrada: si
      // el cliente vuelve a escribir después de eso, arranca de cero (sin
      // arrastrar pedidos/contexto viejo) en vez de seguir sumando mensajes
      // a una conversación que ya quedó vieja. El cron de
      // close-stale-conversations hace lo mismo de forma proactiva aunque el
      // cliente no vuelva a escribir; esto es la garantía de que, escriba
      // cuando escriba, nunca continúa una conversación de hace horas.
      if (conversation && Date.now() - conversation.lastMessageAt.getTime() > STALE_CONVERSATION_MS) {
        await prisma.conversation.update({ where: { id: conversation.id }, data: { status: "CERRADA" } });
        conversation = null;
      }

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: { customerId: customer.id, sucursalId: sucursal.id, status: "ABIERTA", aiActive: true },
        });
      }

      const inboundMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          sender: "CLIENTE",
          content: inbound.text.body,
          type: "TEXTO",
          whatsappMessageId: inbound.wamid,
        },
      });

      const forceHumanHandoff =
        conversation.aiActive && needsHumanForJohanaPicada(sucursal.slug, customer.firstName, inbound.text.body);

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          ...(forceHumanHandoff
            ? { status: "PENDIENTE" as const, aiActive: false }
            : // Si la IA ya está apagada acá (un empleado la tomó, o se
              // escaló por un reclamo/demora), no la reabrimos solo porque el
              // cliente mandó otro mensaje — que un empleado la cierre o la
              // reactive a mano en vez de perder el aviso de "necesita atención".
              conversation.aiActive
              ? { status: "ABIERTA" as const }
              : {}),
        },
      });

      if (forceHumanHandoff) {
        const whatsappMessageId = await sendWhatsappTextMessage(
          inbound.from,
          "¡Hola! Ya te paso con alguien del local para tu pedido, en un toque te contesta 😊",
          sucursal.id,
        );
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            sender: "IA",
            content: "¡Hola! Ya te paso con alguien del local para tu pedido, en un toque te contesta 😊",
            type: "TEXTO",
            approved: true,
            whatsappMessageId: whatsappMessageId || undefined,
          },
        });
      } else if (conversation.aiActive) {
        // Generar y mandar la respuesta después de contestarle a YCloud, para
        // no arriesgar un timeout del webhook mientras OpenAI/WhatsApp
        // responden — y con el debounce de más arriba, para no contestar cada
        // mensaje de una tanda por separado.
        const conversationId = conversation.id;
        after(() =>
          respondWithAi(conversationId, customer.id, inbound.from, sucursal.id, inboundMessage.id),
        );
      }
    }
  }

  return NextResponse.json({ ok: true });
}
