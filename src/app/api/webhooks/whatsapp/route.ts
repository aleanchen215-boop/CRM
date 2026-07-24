import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyYCloudSignature } from "@/server/integrations/whatsapp/verify";
import { sendWhatsappTextMessage } from "@/server/integrations/whatsapp/client";
import { generateAiReply, type ChatTurn } from "@/server/ai/assistant";
import type { YCloudInboundMessageEvent } from "@/server/integrations/whatsapp/types";

async function respondWithAi(conversationId: string, customerWhatsapp: string) {
  const recentMessages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  const history: ChatTurn[] = recentMessages.map((message) => ({
    role: message.sender === "CLIENTE" ? "user" : "assistant",
    content: message.content,
  }));

  try {
    const { text, costTokens } = await generateAiReply(history);
    const whatsappMessageId = await sendWhatsappTextMessage(customerWhatsapp, text);

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
        where: { customerId: customer.id, status: { not: "CERRADA" } },
        orderBy: { lastMessageAt: "desc" },
      });

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: { customerId: customer.id, status: "ABIERTA", aiActive: true },
        });
      }

      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          sender: "CLIENTE",
          content: inbound.text.body,
          type: "TEXTO",
          whatsappMessageId: inbound.wamid,
        },
      });

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date(), status: "ABIERTA" },
      });

      // Generar y mandar la respuesta después de contestarle a YCloud, para
      // no arriesgar un timeout del webhook mientras OpenAI/WhatsApp responden.
      if (conversation.aiActive) {
        const conversationId = conversation.id;
        after(() => respondWithAi(conversationId, inbound.from));
      }
    }
  }

  return NextResponse.json({ ok: true });
}
