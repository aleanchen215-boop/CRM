"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ProductOption = { id: string; name: string; outOfStock?: boolean };

export function VariableSlotPicker({
  label,
  quantity,
  products,
  productIds,
  onChange,
}: {
  label: string;
  quantity: number;
  products: ProductOption[];
  productIds: string[];
  onChange: (next: string[]) => void;
}) {
  const [addQty, setAddQty] = useState(1);

  const filled = productIds.filter(Boolean).length;
  const remaining = quantity - filled;

  const grouped = productIds.reduce<Record<string, number>>((acc, id) => {
    if (!id) return acc;
    acc[id] = (acc[id] ?? 0) + 1;
    return acc;
  }, {});

  function addFlavor(productId: string) {
    const toAdd = Math.min(Math.max(addQty, 1), remaining);
    if (toAdd <= 0) return;
    const next = [...productIds];
    let left = toAdd;
    for (let i = 0; i < next.length && left > 0; i++) {
      if (!next[i]) {
        next[i] = productId;
        left--;
      }
    }
    onChange(next);
  }

  function removeOne(productId: string) {
    const next = [...productIds];
    for (let i = next.length - 1; i >= 0; i--) {
      if (next[i] === productId) {
        next[i] = "";
        break;
      }
    }
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground">
        {label} a elección — {filled}/{quantity}
      </p>

      {Object.keys(grouped).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(grouped).map(([productId, count]) => (
            <Badge key={productId} variant="secondary" className="gap-1 pr-1">
              {count}x {products.find((p) => p.id === productId)?.name ?? productId}
              <button
                type="button"
                onClick={() => removeOne(productId)}
                className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                aria-label="Quitar uno"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {remaining > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Input
            type="number"
            min={1}
            max={remaining}
            value={addQty}
            onChange={(event) => setAddQty(Number(event.target.value) || 1)}
            className="h-7 w-14 shrink-0 px-2 text-xs"
          />
          {products.map((product) => (
            <Button
              key={product.id}
              type="button"
              variant="outline"
              size="sm"
              className="h-7"
              disabled={product.outOfStock}
              title={product.outOfStock ? "Sin stock" : undefined}
              onClick={() => addFlavor(product.id)}
            >
              {product.name}
              {product.outOfStock ? " (sin stock)" : ""}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
