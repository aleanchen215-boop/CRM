import { z } from "zod";

export const paymentMethodValues = [
  "MERCADO_PAGO",
  "EFECTIVO",
  "TRANSFERENCIA",
  "OTRO",
] as const;

export const salesChannelValues = ["WHATSAPP", "MOSTRADOR", "OTRO"] as const;

export const orderStatusValues = [
  "PENDIENTE",
  "CONFIRMADO",
  "ENVIADO",
  "ENTREGADO",
  "CANCELADO",
] as const;

export const orderItemInputSchema = z.object({
  productId: z.string().min(1, "Elegí un producto"),
  quantity: z.coerce.number().int().positive("Tiene que ser mayor a 0"),
});

export const orderInputSchema = z.object({
  customerId: z.string().min(1, "Elegí un cliente"),
  method: z.enum(paymentMethodValues),
  channel: z.enum(salesChannelValues).default("WHATSAPP"),
  items: z.array(orderItemInputSchema).min(1, "Agregá al menos un producto"),
});

export const orderStatusUpdateSchema = z.object({
  id: z.string(),
  status: z.enum(orderStatusValues),
});

export type OrderInput = z.infer<typeof orderInputSchema>;
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
