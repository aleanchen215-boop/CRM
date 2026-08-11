import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsappTemplateMessage } from "@/server/integrations/whatsapp/client";
import { WALK_IN_WHATSAPP } from "@/server/customers/walk-in";

// Reactivación de clientes: a quien no compra hace más de 30 días se le
// manda una promo de 10% off + envío gratis, una sola vez (nunca se repite
// aunque siga sin volver — ver Customer.winbackMessageSentAt). Por ahora
// solo alcanza a clientes cuya última compra fue en Paracao (Almafuerte
// queda afuera a pedido). Mensaje de negocio sin que el cliente haya
// escrito antes → WhatsApp exige plantilla aprobada, no texto libre (ver
// sendWhatsappTemplateMessage).
const WINBACK_INACTIVE_DAYS = 30;
const WINBACK_TEMPLATE_NAME = "cliente_inactivo_descuento";
const WINBACK_TEMPLATE_LANGUAGE = "es_AR";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const paracao = await prisma.sucursal.findUnique({ where: { slug: "paracao" } });
  if (!paracao) {
    return NextResponse.json({ ok: false, error: "No existe la sucursal Paracao." }, { status: 500 });
  }

  const cutoff = new Date(Date.now() - WINBACK_INACTIVE_DAYS * 24 * 60 * 60 * 1000);
  const candidates = await prisma.customer.findMany({
    where: { whatsapp: { not: WALK_IN_WHATSAPP }, winbackMessageSentAt: null },
    include: { orders: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, sucursalId: true } } },
  });

  const eligible = candidates.filter((c) => {
    const lastOrder = c.orders[0];
    return lastOrder && lastOrder.sucursalId === paracao.id && lastOrder.createdAt < cutoff;
  });

  let sent = 0;
  const failed: { customerId: string; error: string }[] = [];

  for (const customer of eligible) {
    try {
      await sendWhatsappTemplateMessage(
        customer.whatsapp,
        WINBACK_TEMPLATE_NAME,
        WINBACK_TEMPLATE_LANGUAGE,
        paracao.id,
      );
      await prisma.customer.update({
        where: { id: customer.id },
        data: { winbackMessageSentAt: new Date() },
      });
      sent++;
    } catch (error) {
      failed.push({ customerId: customer.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return NextResponse.json({ ok: true, eligible: eligible.length, sent, failed });
}
