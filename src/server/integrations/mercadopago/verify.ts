import { createHmac, timingSafeEqual } from "crypto";

// Mercado Pago firma cada webhook con "x-signature: ts=...,v1=...", HMAC-SHA256
// sobre el manifest "id:{dataId};request-id:{requestId};ts:{ts};" usando el
// secret que se genera en Tus integraciones > Webhooks > Configurar notificaciones.
// https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
export function verifyMercadoPagoSignature(
  dataId: string,
  requestId: string | null,
  signatureHeader: string | null,
): boolean {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret || !signatureHeader || !requestId) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => part.trim().split("=") as [string, string]),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(v1);
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
