import type { paymentMethodValues } from "@/lib/validation/order";

export type OrderRowValue = {
  rowType: "PIZZA" | "EMPANADA" | "PROMOCION";
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
};
