import { createHmac, timingSafeEqual } from "crypto";

// YCloud firma cada webhook con un header "YCloud-Signature: t={timestamp},s={signature}".
// El string firmado es "{timestamp}.{rawBody}", con HMAC-SHA256 sobre el secret
// que YCloud devuelve al crear el endpoint (Developers > Webhook > Add Endpoint).
// https://docs.ycloud.com/reference/webhook-integration-guide
//
// Paracao y Almafuerte son cuentas de YCloud separadas, cada una con su
// propio endpoint/secret configurado del lado de YCloud — este webhook
// recibe los mensajes de ambas en la misma URL, así que se prueba la firma
// contra los secrets de las dos hasta encontrar la que corresponda.
function getKnownSecrets(): string[] {
  return [process.env.YCLOUD_WEBHOOK_SECRET, process.env.YCLOUD_WEBHOOK_SECRET_ALMAFUERTE].filter(
    (secret): secret is string => Boolean(secret),
  );
}

export function verifyYCloudSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secrets = getKnownSecrets();
  if (secrets.length === 0 || !signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => part.trim().split("=") as [string, string]),
  );
  const timestamp = parts.t;
  const signature = parts.s;
  if (!timestamp || !signature) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const receivedBuffer = Buffer.from(signature);

  return secrets.some((secret) => {
    const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");
    const expectedBuffer = Buffer.from(expected);
    if (expectedBuffer.length !== receivedBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, receivedBuffer);
  });
}
