import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWhatsappSignature } from "@/server/integrations/whatsapp/verify";
import type { WhatsappWebhookPayload } from "@/server/integrations/whatsapp/types";

// Meta llama a esto una sola vez, al configurar el webhook en el dashboard,
// para confirmar que somos dueños de esta URL.
export function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && challenge && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  // Se lee como texto (no .json()) porque la verificación de firma necesita
  // el body crudo exacto — parsearlo antes rompería el hash.
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyWhatsappSignature(rawBody, signature)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody) as WhatsappWebhookPayload;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const contacts = change.value?.contacts ?? [];
      const messages = change.value?.messages ?? [];

      for (const message of messages) {
        // Fase 1: solo texto. Imagen/audio/ubicación se suman más adelante.
        if (message.type !== "text" || !message.text) continue;

        const contact = contacts.find((c) => c.wa_id === message.from);

        const customer = await prisma.customer.upsert({
          where: { whatsapp: message.from },
          create: {
            whatsapp: message.from,
            firstName: contact?.profile?.name ?? "Sin nombre",
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
            content: message.text.body,
            type: "TEXTO",
            whatsappMessageId: message.id,
          },
        });

        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: new Date(), status: "ABIERTA" },
        });
      }
    }
  }

  // Meta reintenta el webhook si no responde 200 rápido.
  return NextResponse.json({ ok: true });
}
