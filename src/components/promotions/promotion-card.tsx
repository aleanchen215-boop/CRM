"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PromotionForm } from "@/components/promotions/promotion-form";
import type { PromotionInput } from "@/lib/validation/promotion";

type PromotionListItem = {
  id: string;
  name: string;
  price: number;
  active: boolean;
  items: {
    id: string;
    kind: "FIJO" | "VARIABLE";
    quantity: number;
    productId: string | null;
    categoryId: string | null;
    product: { name: string } | null;
    category: { name: string } | null;
  }[];
};

export function PromotionCard({ promotion }: { promotion: PromotionListItem }) {
  const [editOpen, setEditOpen] = useState(false);
  const utils = trpc.useUtils();

  const deletePromotion = trpc.promotions.delete.useMutation({
    onSuccess: async () => {
      await utils.promotions.list.invalidate();
      toast.success("Promoción eliminada");
    },
    onError: (error) => toast.error(error.message),
  });

  const defaultValues: PromotionInput = {
    name: promotion.name,
    price: promotion.price,
    items: promotion.items.map((item) => ({
      kind: item.kind,
      quantity: item.quantity,
      productId: item.productId ?? "",
      categoryId: item.categoryId ?? "",
    })),
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base font-medium">{promotion.name}</CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => deletePromotion.mutate({ id: promotion.id })}
              disabled={deletePromotion.isPending}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-lg font-semibold">{formatCurrency(promotion.price)}</p>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {promotion.items.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <Badge variant={item.kind === "FIJO" ? "outline" : "secondary"} className="text-xs">
                  {item.kind === "FIJO" ? "Fijo" : "A elección"}
                </Badge>
                {item.quantity}x {item.kind === "FIJO" ? item.product?.name : item.category?.name}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar promoción</DialogTitle>
          </DialogHeader>
          <PromotionForm
            mode="edit"
            promotionId={promotion.id}
            defaultValues={defaultValues}
            onSuccess={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
