"use client";

import { toast } from "sonner";
import { Ban } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { useCanPerform } from "@/lib/use-can-perform";

export function OrderCancelButton({
  orderId,
  status,
  cancelRequestedByCustomerAt,
}: {
  orderId: string;
  status: string;
  cancelRequestedByCustomerAt?: string | Date | null;
}) {
  const canCancel = useCanPerform("orders:cancel");
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

  if (!canCancel || status === "CANCELADO") return null;

  const requestedByCustomer = Boolean(cancelRequestedByCustomerAt);

  return (
    <Button
      variant="destructive"
      size="sm"
      disabled={cancel.isPending}
      onClick={() => {
        const message = requestedByCustomer
          ? "El cliente pidió cancelar este pedido por WhatsApp. ¿Confirmás la cancelación?"
          : "¿Cancelar esta venta? Esta acción no se puede deshacer desde acá.";
        if (window.confirm(message)) {
          cancel.mutate({ id: orderId });
        }
      }}
    >
      <Ban />
      {requestedByCustomer ? "Confirmar cancelación" : "Cancelar venta"}
    </Button>
  );
}
