import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyYCloudSignature } from "@/server/integrations/whatsapp/verify";
import type { YCloudInboundMessageEvent } from "@/server/integrations/whatsapp/types";

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
          data: { customerId: customer.id, status: "ABIERTA", aiActive: false },
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
    }
  }

  return NextResponse.json({ ok: true });
}
