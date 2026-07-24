import { z } from "zod";

export const paymentMethodValues = [
  "MERCADO_PAGO",
  "EFECTIVO",
  "TRANSFERENCIA",
  "OTRO",
] as const;

export const salesChannelValues = ["MOSTRADOR", "DELIVERY", "APPS"] as const;

// Plataforma de origen dentro del canal "Apps" (PedidosYa, Rappi, etc.).
// Texto libre por ahora — se vuelve un valor fijo (o se autocompleta) el
// día que exista integración automática con cada plataforma.
export const appsSourceSuggestions = ["PedidosYa", "Rappi"] as const;

export const orderStatusValues = [
  "PENDIENTE",
  "CONFIRMADO",
  "ENVIADO",
  "ENTREGADO",
  "CANCELADO",
] as const;

export const productItemInputSchema = z.object({
  kind: z.literal("PRODUCTO"),
  productId: z.string().min(1, "Elegí un producto"),
  quantity: z.coerce.number().int().positive("Tiene que ser mayor a 0"),
});

// Para cada renglón VARIABLE de la promo (ej. "6 empanadas a elección"),
// productIds tiene que traer exactamente esa cantidad de productos elegidos.
export const promotionItemSelectionSchema = z.object({
  promotionItemId: z.string(),
  productIds: z.array(z.string().min(1)).min(1),
});

export const promotionOrderItemInputSchema = z.object({
  kind: z.literal("PROMOCION"),
  promotionId: z.string().min(1, "Elegí una promoción"),
  variableSelections: z.array(promotionItemSelectionSchema),
});

export const orderItemInputSchema = z.discriminatedUnion("kind", [
  productItemInputSchema,
  promotionOrderItemInputSchema,
]);

export const orderInputSchema = z.object({
  customerId: z.string().min(1, "Elegí un cliente"),
  method: z.enum(paymentMethodValues),
  channel: z.enum(salesChannelValues).default("MOSTRADOR"),
  channelSource: z.string().trim().optional(),
  items: z.array(orderItemInputSchema).min(1, "Agregá al menos un producto"),
  notes: z.string().trim().max(500).optional(),
  // Solo tiene sentido cuando channel = DELIVERY.
  shippingAddress: z.string().trim().optional(),
});

export const orderStatusUpdateSchema = z.object({
  id: z.string(),
  status: z.enum(orderStatusValues),
});

export type OrderInput = z.infer<typeof orderInputSchema>;
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
