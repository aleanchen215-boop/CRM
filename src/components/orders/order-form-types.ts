import type { paymentMethodValues } from "@/lib/validation/order";

export type OrderRowValue = {
  rowType: "PIZZA" | "EMPANADA" | "BEBIDA" | "PROMOCION";
  productId: string;
  quantity: number;
  promotionId: string;
  variableSelections: { promotionItemId: string; productIds: string[] }[];
};

export type OrderFormValues = {
  customerId: string;
  method: (typeof paymentMethodValues)[number];
  // Solo se usa con method = EFECTIVO en Delivery: con cuánto paga el
  // cliente, para calcular el vuelto. String vacío = paga justo.
  changeFor: string;
  // Descuento manual opcional. discountValue vacío = sin descuento.
  discountType: "PORCENTAJE" | "MONTO_FIJO";
  discountValue: string;
  items: OrderRowValue[];
  notes: string;
  shippingAddress: string;
  // Solo se completa (y se muestra en el form) cuando quien crea el pedido
  // no está atado a una sola sucursal.
  sucursalId: string;
};
