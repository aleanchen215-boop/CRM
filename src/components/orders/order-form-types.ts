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
  items: OrderRowValue[];
  notes: string;
  shippingAddress: string;
  // Solo se completa (y se muestra en el form) cuando quien crea el pedido
  // no está atado a una sola sucursal.
  sucursalId: string;
};
