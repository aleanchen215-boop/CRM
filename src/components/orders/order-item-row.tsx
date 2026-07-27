"use client";

import { useState } from "react";
import { Controller, type Control } from "react-hook-form";
import { Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OrderFormValues, OrderRowValue } from "@/components/orders/order-form-types";
import { VariableSlotPicker } from "@/components/orders/variable-slot-picker";

const ROW_TYPE_LABELS: Record<OrderRowValue["rowType"], string> = {
  PIZZA: "Pizza",
  EMPANADA: "Empanada",
  BEBIDA: "Bebida",
  PROMOCION: "Promoción",
};

const CATEGORY_BY_ROW_TYPE: Record<"PIZZA" | "EMPANADA" | "BEBIDA", string> = {
  PIZZA: "Pizzas",
  EMPANADA: "Empanadas",
  BEBIDA: "Bebidas",
};

// Input de cantidad como texto libre en vez de atado directo al número: si
// se controla directo por el número, borrar el "1" para escribir "0.5"
// vuelve a mostrar "1" en cada tecla (Number("") || 1) y nunca se puede
// completar. Acá se deja escribir cualquier cosa y solo se confirma al
// padre cuando el texto ya parsea a un número válido > 0.
function QuantityInput({
  value,
  min,
  step,
  title,
  onChange,
}: {
  value: number;
  min: number;
  step: number;
  title?: string;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  // Patrón recomendado de React para "resetear estado cuando cambia una
  // prop" sin useEffect (evita el render extra en cascada): se ajusta acá,
  // durante el render, comparando contra el último valor visto.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(String(value));
  }

  return (
    <Input
      type="number"
      inputMode="decimal"
      min={min}
      step={step}
      className="w-20 shrink-0"
      value={text}
      title={title}
      onChange={(event) => {
        const raw = event.target.value;
        setText(raw);
        const parsed = Number(raw);
        if (raw !== "" && !Number.isNaN(parsed) && parsed > 0) {
          onChange(parsed);
        }
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

export function OrderItemRow({
  index,
  control,
  onRemove,
  canRemove,
  sucursalId,
}: {
  index: number;
  control: Control<OrderFormValues>;
  onRemove: () => void;
  canRemove: boolean;
  sucursalId?: string;
}) {
  const { data: products } = trpc.products.list.useQuery({});
  const { data: promotions } = trpc.promotions.list.useQuery();
  // Solo trae stock para sabores con receta cargada (ver
  // ProductSupplyUsage) — los que no aparecen acá no tienen tope, se pueden
  // pedir sin restricción.
  const { data: stock } = trpc.products.availableStock.useQuery(
    { sucursalId: sucursalId ?? "" },
    { enabled: Boolean(sucursalId) },
  );
  const outOfStock = (productId: string) => (stock?.[productId] ?? Infinity) <= 0;

  return (
    <Controller
      control={control}
      name={`items.${index}`}
      render={({ field }) => {
        const row = field.value;

        function updateRow(patch: Partial<OrderRowValue>) {
          field.onChange({ ...row, ...patch });
        }

        function handleRowTypeChange(rowType: OrderRowValue["rowType"]) {
          updateRow({
            rowType,
            productId: "",
            quantity: 1,
            promotionId: "",
            variableSelections: [],
          });
        }

        function handlePromotionChange(promotionId: string) {
          const promotion = promotions?.find((p) => p.id === promotionId);
          const variableSelections =
            promotion?.items
              .filter((item) => item.kind === "VARIABLE")
              .map((item) => ({
                promotionItemId: item.id,
                productIds: Array.from({ length: item.quantity }, () => ""),
              })) ?? [];
          updateRow({ promotionId, variableSelections });
        }

        const selectedPromotion = promotions?.find((p) => p.id === row.promotionId);
        const categoryName =
          row.rowType === "PIZZA" || row.rowType === "EMPANADA" || row.rowType === "BEBIDA"
            ? CATEGORY_BY_ROW_TYPE[row.rowType]
            : null;
        const filteredProducts = categoryName
          ? products?.filter((p) => p.category?.name === categoryName)
          : [];

        return (
          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-start gap-2">
              <Select
                value={row.rowType}
                onValueChange={(value) => value && handleRowTypeChange(value)}
              >
                <SelectTrigger className="w-36 shrink-0">
                  <SelectValue>
                    {(value: OrderRowValue["rowType"]) => ROW_TYPE_LABELS[value]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROW_TYPE_LABELS) as OrderRowValue["rowType"][]).map((value) => (
                    <SelectItem key={value} value={value}>
                      {ROW_TYPE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {row.rowType !== "PROMOCION" ? (
                <>
                  <Select
                    value={row.productId}
                    onValueChange={(productId) => updateRow({ productId: productId ?? "" })}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Producto…">
                        {(id: string) => {
                          const product = filteredProducts?.find((p) => p.id === id);
                          return product
                            ? `${product.name} (${formatCurrency(product.price)})`
                            : id;
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {filteredProducts?.map((product) => (
                        <SelectItem key={product.id} value={product.id} disabled={outOfStock(product.id)}>
                          {product.name} ({formatCurrency(product.price)})
                          {outOfStock(product.id) ? " — sin stock" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <QuantityInput
                    value={row.quantity}
                    min={row.rowType === "PIZZA" ? 0.5 : 1}
                    step={row.rowType === "PIZZA" ? 0.5 : 1}
                    onChange={(quantity) => updateRow({ quantity })}
                    title={
                      row.rowType === "PIZZA"
                        ? "0.5 = media pizza. Agregá otro renglón de pizza en 0.5 con otro sabor para armar una mitad y mitad, o dejalo solo para media pizza de un sabor."
                        : undefined
                    }
                  />
                </>
              ) : (
                <Select
                  value={row.promotionId}
                  onValueChange={(value) => handlePromotionChange(value ?? "")}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Promoción…">
                      {(id: string) => {
                        const promo = promotions?.find((p) => p.id === id);
                        return promo ? `${promo.name} (${formatCurrency(promo.price)})` : id;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {promotions
                      ?.filter((p) => p.active)
                      .map((promo) => (
                        <SelectItem key={promo.id} value={promo.id}>
                          {promo.name} ({formatCurrency(promo.price)})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={!canRemove}
                onClick={onRemove}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>

            {row.rowType === "PROMOCION" && selectedPromotion && (
              <div className="flex flex-col gap-2 border-t pt-2 pl-1 text-sm">
                {selectedPromotion.items.map((promoItem) =>
                  promoItem.kind === "FIJO" ? (
                    <p key={promoItem.id} className="text-muted-foreground">
                      Incluye: {promoItem.quantity}x {promoItem.product?.name}
                    </p>
                  ) : (
                    <VariableSlotPicker
                      key={promoItem.id}
                      label={promoItem.category?.name ?? "Producto"}
                      quantity={promoItem.quantity}
                      products={
                        products
                          ?.filter((p) => p.categoryId === promoItem.categoryId)
                          .map((p) => ({ id: p.id, name: p.name, outOfStock: outOfStock(p.id) })) ?? []
                      }
                      productIds={
                        row.variableSelections.find((s) => s.promotionItemId === promoItem.id)
                          ?.productIds ?? []
                      }
                      onChange={(productIds) => {
                        const nextSelections = row.variableSelections.map((selection) =>
                          selection.promotionItemId === promoItem.id
                            ? { ...selection, productIds }
                            : selection,
                        );
                        updateRow({ variableSelections: nextSelections });
                      }}
                    />
                  ),
                )}
              </div>
            )}
          </div>
        );
      }}
    />
  );
}
