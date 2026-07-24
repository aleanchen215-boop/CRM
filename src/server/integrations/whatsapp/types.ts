export interface WhatsappIncomingMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}

export interface WhatsappContact {
  wa_id: string;
  profile?: { name?: string };
}

export interface WhatsappWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: WhatsappContact[];
        messages?: WhatsappIncomingMessage[];
      };
    }>;
  }>;
}
