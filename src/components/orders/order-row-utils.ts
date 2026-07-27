import type { OrderInput } from "@/lib/validation/order";
import type { OrderFormValues, OrderRowValue } from "@/components/orders/order-form-types";

// Compartido entre crear pedido (OrderForm) y editar pedido (EditOrderDialog)
// — misma forma de renglón, misma conversión a lo que espera la API.
export function emptyRow(): OrderRowValue {
  return { rowType: "PIZZA", productId: "", quantity: 1, promotionId: "", variableSelections: [] };
}

// 0.5 = media pizza. Dos renglones de 0.5 se combinan en una mitad y mitad
// (dos sabores); si queda uno solo sin pareja, es media pizza de ese sabor
// sola. Solo tiene sentido para pizzas, no empanadas/bebidas.
export function isHalfPizzaRow(row: OrderRowValue): boolean {
  return row.rowType === "PIZZA" && row.quantity === 0.5;
}

// Valida a mano (no con zodResolver): la forma de cada renglón en el form es
// más simple que la unión discriminada que espera la API, así que acá se
// chequea lo mínimo y se transforma recién al enviar.
export function validateRows(rows: OrderRowValue[]): string | null {
  for (const row of rows) {
    if (row.rowType === "PROMOCION") {
      if (!row.promotionId) return "Elegí una promoción en todos los renglones.";
      for (const selection of row.variableSelections) {
        if (selection.productIds.some((id) => !id)) {
          return "Completá todos los sabores a elección antes de continuar.";
        }
      }
      continue;
    }
    if (!row.productId) return "Elegí un producto en todos los renglones.";
    if (row.rowType !== "PIZZA" && row.quantity === 0.5) {
      return "0.5 (media unidad) solo se puede usar en pizzas.";
    }
    if (!Number.isInteger(row.quantity) && row.quantity !== 0.5) {
      return "La cantidad tiene que ser un número entero (o 0.5 para media pizza).";
    }
  }
  return null;
}

export function toApiItems(rows: OrderRowValue[]): OrderInput["items"] {
  const items: OrderInput["items"] = [];
  const halfPizzas = rows.filter(isHalfPizzaRow);
  const normalRows = rows.filter((row) => !isHalfPizzaRow(row));

  for (const row of normalRows) {
    items.push(
      row.rowType === "PROMOCION"
        ? { kind: "PROMOCION" as const, promotionId: row.promotionId, variableSelections: row.variableSelections }
        : { kind: "PRODUCTO" as const, productId: row.productId, quantity: row.quantity },
    );
  }

  // De a dos: mitad y mitad (dos sabores). Si sobra uno solo, media pizza
  // de ese sabor sola (mismo precio: entero/2 + $1.000, sin productId2).
  for (let i = 0; i < halfPizzas.length; i += 2) {
    const [first, second] = [halfPizzas[i], halfPizzas[i + 1]];
    items.push({
      kind: "MEDIA_MEDIA" as const,
      productId1: first.productId,
      productId2: second?.productId,
      quantity: 1,
    });
  }

  return items;
}

export type { OrderFormValues, OrderRowValue };
