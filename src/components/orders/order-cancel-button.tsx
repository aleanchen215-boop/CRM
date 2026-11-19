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
  hasFacturaC,
  onCancelled,
}: {
  orderId: string;
  status: string;
  cancelRequestedByCustomerAt?: string | Date | null;
  // Si ya tiene factura C con CAE, se avisa que cancelar acá no la anula en ARCA.
  hasFacturaC?: boolean;
  onCancelled?: () => void;
}) {
  const canCancel = useCanPerform("orders:cancel");
  const utils = trpc.useUtils();

  const cancel = trpc.orders.cancel.useMutation({
    onSuccess: async () => {
      toast.success("Venta cancelada");
      await Promise.all([
        utils.orders.getById.invalidate({ id: orderId }),
        utils.orders.list.invalidate(),
        utils.reports.ventas.invalidate(),
      ]);
      onCancelled?.();
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
        const base = requestedByCustomer
          ? "El cliente pidió cancelar este pedido por WhatsApp. ¿Confirmás la cancelación?"
          : status === "ENTREGADO"
            ? "Esta venta ya está ENTREGADA. ¿Cancelarla igual? Sale de los reportes y se devuelve el stock. No se puede deshacer desde acá."
            : "¿Cancelar esta venta? Esta acción no se puede deshacer desde acá.";
        const message = hasFacturaC
          ? `${base}\n\nOJO: tiene factura C emitida en ARCA. Cancelarla acá NO la anula: hay que hacer la nota de crédito C.`
          : base;
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
