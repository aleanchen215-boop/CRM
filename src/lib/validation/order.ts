import { z } from "zod";

export const paymentMethodValues = [
  "MERCADO_PAGO",
  "EFECTIVO",
  "TRANSFERENCIA",
  "OTRO",
  "PREPAGO",
  "VISA",
  "PAYWAY",
  "CUENTA_CORRIENTE",
] as const;

export const salesChannelValues = ["MOSTRADOR", "DELIVERY", "APPS"] as const;

// Plataforma de origen dentro del canal "Apps" — a diferencia de otras
// sucursales, el método de pago depende de cuál es exactamente (Rappi solo
// acepta Visa, PedidosYa ya cobró en la app), así que son valores fijos, no
// texto libre.
export const appsSourceValues = ["PedidosYa", "Rappi"] as const;
// Se mantiene para no romper imports existentes.
export const appsSourceSuggestions = appsSourceValues;

// Qué métodos de pago tienen sentido según el canal (y, para Apps, la
// plataforma puntual) — cada uno cobra distinto en la práctica:
// - Mostrador: efectivo en mano, tarjeta por la terminal Payway del local, o
//   cuenta corriente (consumos internos que se anotan para descontar
//   después, no un cobro real en el momento — solo tiene sentido acá).
// - Delivery: efectivo al cadete, o link de Mercado Pago (queda como
//   TRANSFERENCIA por motivos históricos, ver el enum).
// - Apps/PedidosYa: la plataforma ya le cobró al cliente (prepago) o paga
//   en efectivo al cadete de PedidosYa.
// - Apps/Rappi: Rappi solo acepta Visa — no es una elección real.
export function getAllowedPaymentMethods(
  channel: (typeof salesChannelValues)[number],
  channelSource?: string,
): (typeof paymentMethodValues)[number][] {
  if (channel === "MOSTRADOR") return ["EFECTIVO", "PAYWAY", "CUENTA_CORRIENTE"];
  if (channel === "DELIVERY") return ["EFECTIVO", "TRANSFERENCIA"];

  // APPS
  const source = channelSource?.trim().toLowerCase();
  if (source === "rappi") return ["VISA"];
  return ["PREPAGO", "EFECTIVO"];
}

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

// Media pizza: sale (precio entero / 2) + $1.000. Si productId2 viene, son
// dos sabores combinados en una pizza mitad y mitad y el total es la suma de
// las dos mitades ((precio1 + precio2) / 2 + $2.000); si no viene, es media
// pizza de un solo sabor sola. Se calcula siempre en el servidor.
export const halfAndHalfItemInputSchema = z.object({
  kind: z.literal("MEDIA_MEDIA"),
  productId1: z.string().min(1, "Elegí el sabor"),
  productId2: z.string().min(1).optional(),
  quantity: z.coerce.number().int().positive("Tiene que ser mayor a 0").default(1),
});

export const orderItemInputSchema = z.discriminatedUnion("kind", [
  productItemInputSchema,
  promotionOrderItemInputSchema,
  halfAndHalfItemInputSchema,
]);

export const orderInputSchema = z.object({
  // Opcional: Mostrador acepta venta sin cliente cargado (walk-in) — se
  // resuelve del lado del servidor a un cliente genérico "Consumidor Final"
  // cuando no viene. Delivery/Apps sí lo necesitan, eso se valida aparte.
  customerId: z.string().optional(),
  method: z.enum(paymentMethodValues),
  channel: z.enum(salesChannelValues).default("MOSTRADOR"),
  channelSource: z.string().trim().optional(),
  items: z.array(orderItemInputSchema).min(1, "Agregá al menos un producto"),
  notes: z.string().trim().max(500).optional(),
  // Hora puntual pedida por el cliente para retirar/recibir el pedido (ej.
  // "para las 21:30") — se muestra aparte en Ventas, no es una nota más.
  scheduledFor: z.date().optional(),
  // Solo tiene sentido cuando channel = DELIVERY.
  shippingAddress: z.string().trim().optional(),
  // Solo hace falta si quien crea el pedido no está atado a una sucursal fija
  // (ej. Admin) — se resuelve del lado del servidor a partir del usuario
  // cuando este está atado a una.
  sucursalId: z.string().optional(),
});

export const orderStatusUpdateSchema = z.object({
  id: z.string(),
  status: z.enum(orderStatusValues),
});

export type OrderInput = z.infer<typeof orderInputSchema>;
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
