"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Percent } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type DiscountType = "PORCENTAJE" | "MONTO_FIJO";

// Aplicar/cambiar/sacar un descuento manual sobre una venta ya cargada —
// recalcula el total de cero en el servidor (ver applyDiscount en
// create-order.ts), así queda bien sin importar qué se haya tocado antes.
export function DiscountEditor({
  orderId,
  discountType,
  discountValue,
}: {
  orderId: string;
  discountType: DiscountType | null;
  discountValue: number | null;
}) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<DiscountType>(discountType ?? "PORCENTAJE");
  const [value, setValue] = useState(discountValue != null ? String(discountValue) : "");

  const apply = trpc.orders.applyDiscount.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.orders.getById.invalidate({ id: orderId }),
        utils.orders.list.invalidate(),
      ]);
      toast.success("Descuento actualizado");
      setOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const hasDiscount = discountType != null && discountValue != null;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Percent />
        {hasDiscount
          ? `Descuento: ${discountType === "PORCENTAJE" ? `${discountValue}%` : formatCurrency(discountValue)}`
          : "Aplicar descuento"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Descuento</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Select value={type} onValueChange={(v) => setType(v as DiscountType)}>
                <SelectTrigger className="w-32">
                  <SelectValue>{(v: DiscountType) => (v === "PORCENTAJE" ? "%" : "$")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PORCENTAJE">%</SelectItem>
                  <SelectItem value="MONTO_FIJO">$ fijo</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              {hasDiscount && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={apply.isPending}
                  onClick={() => apply.mutate({ id: orderId, discountType: null })}
                >
                  Quitar descuento
                </Button>
              )}
              <Button
                type="button"
                disabled={apply.isPending || !Number(value)}
                onClick={() => apply.mutate({ id: orderId, discountType: type, discountValue: Number(value) })}
              >
                {apply.isPending ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
