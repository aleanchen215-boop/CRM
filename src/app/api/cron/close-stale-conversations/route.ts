import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Cierre proactivo de conversaciones sin actividad hace más de 4hs, para que
// no queden marcadas "abierta" en la interfaz indefinidamente aunque el
// cliente nunca vuelva a escribir. El webhook de WhatsApp (route.ts) ya hace
// este mismo cierre al vuelo si el cliente escribe de nuevo después de las
// 4hs — este cron cubre el caso en que nunca vuelve a escribir.
const STALE_CONVERSATION_MS = 4 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const cutoff = new Date(Date.now() - STALE_CONVERSATION_MS);
  const result = await prisma.conversation.updateMany({
    where: { status: "ABIERTA", lastMessageAt: { lt: cutoff } },
    data: { status: "CERRADA" },
  });

  return NextResponse.json({ ok: true, closed: result.count });
}
