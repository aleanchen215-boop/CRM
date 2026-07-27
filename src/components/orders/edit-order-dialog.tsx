"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { OrderFormValues } from "@/components/orders/order-form-types";
import { emptyRow, validateRows, toApiItems } from "@/components/orders/order-row-utils";
import { OrderItemRow } from "@/components/orders/order-item-row";

type Item = {
  id: string;
  productId: string | null;
  product: { name: string } | null;
  promotionId: string | null;
  promotion: { name: string } | null;
  quantity: number;
  selections: unknown;
};

function itemLabel(item: Item): string {
  return item.product?.name ?? item.promotion?.name ?? "—";
}

export function EditOrderDialog({
  orderId,
  items,
  sucursalId,
}: {
  orderId: string;
  items: Item[];
  sucursalId: string;
}) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const form = useForm<OrderFormValues>({
    defaultValues: {
      customerId: "",
      method: "EFECTIVO",
      items: [emptyRow()],
      notes: "",
      shippingAddress: "",
      sucursalId: "",
    },
  });

  const invalidate = () =>
    Promise.all([
      utils.orders.getById.invalidate({ id: orderId }),
      utils.orders.list.invalidate(),
    ]);

  const addItems = trpc.orders.addItems.useMutation({
    onSuccess: async () => {
      form.reset({ ...form.getValues(), items: [emptyRow()] });
      toast.success("Producto agregado");
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const removeItemRow = trpc.orders.removeItemRow.useMutation({
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message),
  });

  function handleAdd() {
    const row = form.getValues("items.0");
    const error = validateRows([row]);
    if (error) {
      toast.error(error);
      return;
    }
    const [apiItem] = toApiItems([row]);
    if (!apiItem) return;
    addItems.mutate({ orderId, items: [apiItem] });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset({ ...form.getValues(), items: [emptyRow()] });
      }}
    >
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil />
        Editar pedido
      </Button>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar pedido</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Productos en el pedido
            </p>
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin productos.</p>
            )}
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                <span>
                  {item.quantity}x {itemLabel(item)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={removeItemRow.isPending || items.length <= 1}
                  title={items.length <= 1 ? "No se puede sacar el único producto del pedido" : undefined}
                  onClick={() => removeItemRow.mutate({ orderId, orderItemId: item.id })}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 border-t pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Agregar producto
            </p>
            <OrderItemRow
              index={0}
              control={form.control}
              onRemove={() => {}}
              canRemove={false}
              sucursalId={sucursalId}
            />
            <Button type="button" onClick={handleAdd} disabled={addItems.isPending} className="self-end">
              <Plus />
              Agregar al pedido
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
