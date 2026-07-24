// Formato de webhook de YCloud (no el de Meta directo).
// https://docs.ycloud.com/reference/whatsapp-inbound-message-webhook-examples
export interface YCloudInboundMessageEvent {
  id: string;
  type: string; // "whatsapp.inbound_message.received"
  whatsappInboundMessage?: {
    id: string;
    wamid: string;
    from: string;
    to: string;
    type: string;
    text?: { body: string };
    customerProfile?: { name?: string; username?: string };
  };
}
