// YCloud WhatsApp API — https://docs.ycloud.com/reference/whatsapp-message-sending-guide
const YCLOUD_API_BASE = "https://api.ycloud.com/v2";

export async function sendWhatsappTextMessage(to: string, body: string): Promise<string> {
  const apiKey = process.env.YCLOUD_API_KEY;
  const from = process.env.WHATSAPP_PHONE_NUMBER;

  if (!apiKey || !from) {
    throw new Error("WhatsApp no está configurado todavía (faltan YCLOUD_API_KEY / WHATSAPP_PHONE_NUMBER).");
  }

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
