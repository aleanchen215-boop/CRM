"use client";

import { useState } from "react";
import { FileText, TriangleAlert } from "lucide-react";
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
// facturar después desde el detalle. Si ARCA falla la ventana NO se cierra:
// muestra el error y ofrece reintentar. Y como ya se pidió la factura, la
// venta sigue en el tablero de Ventas (marcada en rojo) hasta tener CAE.
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
  const [error, setError] = useState<string | null>(null);
  const emit = trpc.orders.emitInvoice.useMutation({
    onMutate: () => setError(null),
    onSuccess: async () => {
      await Promise.all([utils.orders.getById.invalidate({ id: orderId }), utils.orders.list.invalidate()]);
      toast.success("Factura C emitida y confirmada por ARCA");
      onOpenChange(false);
      onEmitted?.();
    },
    onError: async (err) => {
      await Promise.all([utils.orders.getById.invalidate({ id: orderId }), utils.orders.list.invalidate()]);
      setError(err.message);
      toast.error("ARCA no pudo emitir la factura C", { description: err.message, duration: 15000 });
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
        {emit.isPending && (
          <p className="text-sm text-muted-foreground">Enviando a ARCA y esperando el CAE…</p>
        )}
        {error && !emit.isPending && (
          <div className="flex gap-2 rounded-lg border-2 border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-bold">La factura NO se emitió</p>
              <p>{error}</p>
              <p className="mt-1">
                La venta queda marcada en Ventas como pendiente de factura hasta que se confirme.
              </p>
            </div>
          </div>
        )}
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
            {emit.isPending ? "Emitiendo…" : error ? "Reintentar" : "Emitir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
