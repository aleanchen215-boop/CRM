import { createHmac, timingSafeEqual } from "crypto";

// YCloud firma cada webhook con un header "YCloud-Signature: t={timestamp},s={signature}".
// El string firmado es "{timestamp}.{rawBody}", con HMAC-SHA256 sobre el secret
// que YCloud devuelve al crear el endpoint (Developers > Webhook > Add Endpoint).
// https://docs.ycloud.com/reference/webhook-integration-guide
export function verifyYCloudSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.YCLOUD_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => part.trim().split("=") as [string, string]),
  );
  const timestamp = parts.t;
  const signature = parts.s;
  if (!timestamp || !signature) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
