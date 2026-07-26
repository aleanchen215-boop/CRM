"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";

type Item = {
  id: string;
  productId: string | null;
  product: { name: string } | null;
  promotionId: string | null;
  promotion: { name: string } | null;
  quantity: number;
  selections: unknown;
};

function isHalfAndHalf(selections: unknown): boolean {
  return Array.isArray(selections) && (selections as Array<{ type?: string }>)[0]?.type === "MEDIA_MEDIA";
}

// Solo se pueden agregar/sacar productos sueltos desde acá — los renglones
// de promo o mitad y mitad hay que tocarlos de nuevo desde WhatsApp/la IA,
// editarlos a mano abriría la puerta a inconsistencias con las reglas de
// armado de promos.
function isEditableLooseItem(item: Item): item is Item & { productId: string } {
  return Boolean(item.productId) && !isHalfAndHalf(item.selections);
}

export function EditOrderDialog({ orderId, items }: { orderId: string; items: Item[] }) {
  const [open, setOpen] = useState(false);
  const [newProductId, setNewProductId] = useState("");
  const [newQuantity, setNewQuantity] = useState("1");
  const utils = trpc.useUtils();
  const { data: products } = trpc.products.list.useQuery({});

  const invalidate = () =>
    Promise.all([
      utils.orders.getById.invalidate({ id: orderId }),
      utils.orders.list.invalidate(),
    ]);

  const addItems = trpc.orders.addItems.useMutation({
    onSuccess: async () => {
      setNewProductId("");
      setNewQuantity("1");
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const removeItems = trpc.orders.removeItems.useMutation({
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message),
  });

  const looseItems = items.filter(isEditableLooseItem);
  const otherItems = items.filter((item) => !isEditableLooseItem(item));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil />
        Editar pedido
      </Button>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar pedido</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {otherItems.length > 0 && (
            <div className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              <p className="text-xs font-medium uppercase tracking-wide">
                Promos / mitad y mitad (no editable acá)
              </p>
              {otherItems.map((item) => (
                <p key={item.id}>
                  {item.quantity}x {item.product?.name ?? item.promotion?.name ?? "—"}
                </p>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {looseItems.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin productos sueltos en este pedido.</p>
            )}
            {looseItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                <span>
                  {item.quantity}x {item.product?.name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={removeItems.isPending}
                  onClick={() => {
                    removeItems.mutate({
                      orderId,
                      removals: [{ productId: item.productId, quantity: item.quantity }],
                    });
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 border-t pt-3">
            <Select value={newProductId} onValueChange={(value) => setNewProductId(value ?? "")}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Agregar producto…">
                  {(id: string) => {
                    const product = products?.find((p) => p.id === id);
                    return product ? `${product.name} (${formatCurrency(product.price)})` : id;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {products?.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name} ({formatCurrency(product.price)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={1}
              step={1}
              className="w-20"
              value={newQuantity}
              onChange={(event) => setNewQuantity(event.target.value)}
            />
            <Button
              type="button"
              size="icon"
              disabled={!newProductId || addItems.isPending}
              onClick={() => {
                const quantity = Number(newQuantity);
                if (!newProductId || !(quantity > 0)) return;
                addItems.mutate({ orderId, items: [{ productId: newProductId, quantity }] });
              }}
            >
              <Plus />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
