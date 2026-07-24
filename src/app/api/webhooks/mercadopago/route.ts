import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMercadoPagoSignature } from "@/server/integrations/mercadopago/verify";
import { getMercadoPagoPayment } from "@/server/integrations/mercadopago/client";
import { sendWhatsappTextMessage } from "@/server/integrations/whatsapp/client";

const MP_STATUS_TO_PAYMENT_STATUS: Record<string, "PENDIENTE" | "APROBADO" | "RECHAZADO"> = {
  approved: "APROBADO",
  pending: "PENDIENTE",
  in_process: "PENDIENTE",
  rejected: "RECHAZADO",
  cancelled: "RECHAZADO",
};

export async function POST(request: Request) {
  const url = new URL(request.url);
  const rawBody = await request.text();

  let dataId = url.searchParams.get("data.id") ?? url.searchParams.get("id");
  let type = url.searchParams.get("type") ?? url.searchParams.get("topic");

  if (rawBody) {
    try {
      const body = JSON.parse(rawBody) as { type?: string; data?: { id?: string } };
      dataId = body.data?.id ?? dataId;
      type = body.type ?? type;
    } catch {
      // body vacío o no-JSON (algunas notificaciones de prueba) — seguimos con query params.
    }
  }

  if (!dataId) {
    return new NextResponse("Missing data.id", { status: 400 });
  }

  const signature = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");
  if (!verifyMercadoPagoSignature(dataId, requestId, signature)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  if (type !== "payment") {
    return NextResponse.json({ ok: true });
  }

  const payment = await getMercadoPagoPayment(dataId);
  const orderId = payment.external_reference;
  if (!orderId) {
    return NextResponse.json({ ok: true });
  }

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });
  if (!order) {
    return NextResponse.json({ ok: true });
  }

  const status = MP_STATUS_TO_PAYMENT_STATUS[payment.status] ?? "PENDIENTE";

  await prisma.payment.upsert({
    where: { mercadoPagoPaymentId: String(payment.id) },
    create: {
      orderId: order.id,
      mercadoPagoPaymentId: String(payment.id),
      status,
      amount: payment.transaction_amount ?? Number(order.total),
      method: "MERCADO_PAGO",
    },
    update: { status },
  });

  if (status === "APROBADO") {
    const conversation = await prisma.conversation.findFirst({
      where: { customerId: order.customerId, status: { not: "CERRADA" } },
      orderBy: { lastMessageAt: "desc" },
    });

    const content = "¡Recibimos tu pago! Ya estamos preparando tu pedido 🎉";
    const whatsappMessageId = await sendWhatsappTextMessage(order.customer.whatsapp, content).catch(
      () => undefined,
    );

    if (conversation) {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          sender: "IA",
          content,
          type: "TEXTO",
          approved: true,
          whatsappMessageId,
        },
      });
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
