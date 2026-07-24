"use client";

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

const ROW_TYPE_LABELS: Record<OrderRowValue["rowType"], string> = {
  PIZZA: "Pizza",
  EMPANADA: "Empanada",
  PROMOCION: "Promoción",
};

const CATEGORY_BY_ROW_TYPE: Record<"PIZZA" | "EMPANADA", string> = {
  PIZZA: "Pizzas",
  EMPANADA: "Empanadas",
};

export function OrderItemRow({
  index,
  control,
  onRemove,
  canRemove,
}: {
  index: number;
  control: Control<OrderFormValues>;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const { data: products } = trpc.products.list.useQuery({});
  const { data: promotions } = trpc.promotions.list.useQuery();

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
          row.rowType === "PIZZA" || row.rowType === "EMPANADA"
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
                        <SelectItem key={product.id} value={product.id}>
                          {product.name} ({formatCurrency(product.price)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    className="w-20 shrink-0"
                    value={row.quantity}
                    onChange={(event) => updateRow({ quantity: Number(event.target.value) || 1 })}
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
                    <div key={promoItem.id} className="flex flex-col gap-1.5">
                      <p className="text-xs text-muted-foreground">
                        {promoItem.category?.name} a elección ({promoItem.quantity})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from({ length: promoItem.quantity }).map((_, slotIndex) => {
                          const categoryProducts = products?.filter(
                            (p) => p.categoryId === promoItem.categoryId,
                          );
                          const slotValue =
                            row.variableSelections.find((s) => s.promotionItemId === promoItem.id)
                              ?.productIds[slotIndex] ?? "";
                          return (
                            <Select
                              key={slotIndex}
                              value={slotValue}
                              onValueChange={(productId) => {
                                const nextSelections = row.variableSelections.map((selection) =>
                                  selection.promotionItemId === promoItem.id
                                    ? {
                                        ...selection,
                                        productIds: selection.productIds.map((id, i) =>
                                          i === slotIndex ? (productId ?? "") : id,
                                        ),
                                      }
                                    : selection,
                                );
                                updateRow({ variableSelections: nextSelections });
                              }}
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue placeholder={`Sabor ${slotIndex + 1}…`}>
                                  {(id: string) =>
                                    categoryProducts?.find((p) => p.id === id)?.name ?? id
                                  }
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {categoryProducts?.map((product) => (
                                  <SelectItem key={product.id} value={product.id}>
                                    {product.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          );
                        })}
                      </div>
                    </div>
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
