import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyYCloudSignature } from "@/server/integrations/whatsapp/verify";
import type { YCloudInboundMessageEvent } from "@/server/integrations/whatsapp/types";

// 4hs sin mensajes del cliente se considera conversación terminada (ver uso
// más abajo). El cron de close-stale-conversations hace lo mismo de forma
// proactiva aunque el cliente no vuelva a escribir.
const STALE_CONVERSATION_MS = 4 * 60 * 60 * 1000;

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
          data: { customerId: customer.id, sucursalId: sucursal.id, status: "ABIERTA" },
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
