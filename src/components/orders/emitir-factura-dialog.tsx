"use client";

import { FileText } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Ventana que aparece al marcar ENTREGADO una venta cobrada con Payway:
// "Emitir" pide el CAE a ARCA y (vía onEmitted) imprime la factura C;
// "Cancelar" cierra sin facturar — la venta queda entregada igual y se puede
// facturar después desde el detalle.
export function EmitirFacturaDialog({
  open,
  onOpenChange,
  orderId,
  total,
  onEmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  total: number;
  onEmitted?: () => void;
}) {
  const utils = trpc.useUtils();
  const emit = trpc.orders.emitInvoice.useMutation({
    onSuccess: async () => {
      await utils.orders.getById.invalidate({ id: orderId });
      toast.success("Factura C emitida en ARCA");
      onOpenChange(false);
      onEmitted?.();
    },
    onError: async (error) => {
      await utils.orders.getById.invalidate({ id: orderId });
      toast.error(error.message);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!emit.isPending) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5" />
            Emitir factura C
          </DialogTitle>
          <DialogDescription>
            Venta cobrada con Payway por {formatCurrency(total)}. ¿Emitir la factura C a Consumidor Final en ARCA?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            className="bg-red-600 text-white hover:bg-red-700"
            disabled={emit.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={emit.isPending}
            onClick={() => emit.mutate({ id: orderId })}
          >
            {emit.isPending ? "Emitiendo…" : "Emitir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
