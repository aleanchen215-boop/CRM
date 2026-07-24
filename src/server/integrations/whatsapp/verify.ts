import { createHmac, timingSafeEqual } from "crypto";

// Meta firma cada webhook con el App Secret (HMAC-SHA256 sobre el body crudo).
// Verificar esto es lo único que impide que cualquiera le mande "mensajes
// falsos" a este endpoint público haciéndose pasar por Meta.
export function verifyWhatsappSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret || !signatureHeader) return false;

  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signatureHeader);

  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
