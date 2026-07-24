const GRAPH_API_VERSION = "v21.0";

export async function sendWhatsappTextMessage(to: string, body: string): Promise<string> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error(
      "WhatsApp no está configurado todavía (faltan WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN).",
    );
  }

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Error al enviar el mensaje de WhatsApp: ${errorBody}`);
  }

  const data = (await response.json()) as { messages?: Array<{ id: string }> };
  return data.messages?.[0]?.id ?? "";
}
