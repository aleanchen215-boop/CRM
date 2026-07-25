import { prisma } from "@/lib/prisma";

// YCloud WhatsApp API — https://docs.ycloud.com/reference/whatsapp-message-sending-guide
const YCLOUD_API_BASE = "https://api.ycloud.com/v2";

type YCloudCredentials = { apiKey: string; from: string };

// Paracao y Almafuerte son cuentas de YCloud separadas (cada una con su
// propio número y API key) — se elige cuál usar según el número de WhatsApp
// de la sucursal (Sucursal.whatsappNumber), sin hardcodear el mapeo en cada
// lugar que manda un mensaje.
const cachedSucursalNumbers = new Map<string, string>();

async function getCredentialsForSucursal(sucursalId: string): Promise<YCloudCredentials> {
  let from = cachedSucursalNumbers.get(sucursalId);
  if (!from) {
    const sucursal = await prisma.sucursal.findUniqueOrThrow({ where: { id: sucursalId } });
    if (!sucursal.whatsappNumber) {
      throw new Error(`La sucursal ${sucursal.name} todavía no tiene un WhatsApp conectado.`);
    }
    from = sucursal.whatsappNumber;
    cachedSucursalNumbers.set(sucursalId, from);
  }

  if (from === process.env.WHATSAPP_PHONE_NUMBER) {
    const apiKey = process.env.YCLOUD_API_KEY;
    if (!apiKey) throw new Error("Falta YCLOUD_API_KEY.");
    return { apiKey, from };
  }
  if (from === process.env.WHATSAPP_PHONE_NUMBER_ALMAFUERTE) {
    const apiKey = process.env.YCLOUD_API_KEY_ALMAFUERTE;
    if (!apiKey) throw new Error("Falta YCLOUD_API_KEY_ALMAFUERTE.");
    return { apiKey, from };
  }

  throw new Error(`No hay credenciales de YCloud configuradas para el número ${from}.`);
}

export async function sendWhatsappTextMessage(
  to: string,
  body: string,
  sucursalId: string,
): Promise<string> {
  const { apiKey, from } = await getCredentialsForSucursal(sucursalId);

  const response = await fetch(`${YCLOUD_API_BASE}/whatsapp/messages/sendDirectly`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      from,
      to,
      type: "text",
      text: { body },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Error al enviar el mensaje de WhatsApp: ${errorBody}`);
  }

  const data = (await response.json()) as { id?: string; wamid?: string };
  return data.wamid ?? data.id ?? "";
}
