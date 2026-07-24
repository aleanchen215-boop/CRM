"use client";

import { toast } from "sonner";
import { Ban } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";

export function OrderCancelButton({ orderId, status }: { orderId: string; status: string }) {
  const { data: me } = trpc.system.me.useQuery();
  const utils = trpc.useUtils();

  const cancel = trpc.orders.cancel.useMutation({
    onSuccess: async () => {
      toast.success("Venta cancelada");
      await Promise.all([
        utils.orders.getById.invalidate({ id: orderId }),
        utils.orders.list.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  // Solo Admin puede cancelar una venta ya hecha — el resto ni ve el botón.
  if (me?.role !== "ADMIN" || status === "CANCELADO") return null;

  return (
    <Button
      variant="destructive"
      size="sm"
      disabled={cancel.isPending}
      onClick={() => {
        if (window.confirm("¿Cancelar esta venta? Esta acción no se puede deshacer desde acá.")) {
          cancel.mutate({ id: orderId });
        }
      }}
    >
      <Ban />
      Cancelar venta
    </Button>
  );
}
