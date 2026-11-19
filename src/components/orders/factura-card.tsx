"use client";

import { FileCheck, Printer, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { formatArcaDate, formatCbteNumero, formatPuntoVenta } from "@/lib/arca";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Invoice = {
  arcaStatus: "PENDIENTE" | "AUTORIZADO" | "ERROR" | null;
  arcaError: string | null;
  puntoVenta: number | null;
  cbteNumero: number | null;
  cae: string | null;
  caeVencimiento: string | null;
} | null;

// Estado de la factura C de ARCA en el detalle de la venta: número y CAE si
// ya salió, el error de ARCA con botón para reintentar si falló, o el botón
// para facturar a mano una venta que no se facturó sola (ej. pago repartido).
export function FacturaCard({
  orderId,
  invoice,
  orderStatus,
  canEdit,
  onPrint,
  onEmitted,
}: {
  orderId: string;
  invoice: Invoice;
  orderStatus: string;
  canEdit: boolean;
  onPrint: () => void;
  onEmitted: () => void;
}) {
  const utils = trpc.useUtils();
  const emit = trpc.orders.emitInvoice.useMutation({
    onSuccess: async () => {
      await utils.orders.getById.invalidate({ id: orderId });
      toast.success("Factura emitida en ARCA");
      onEmitted();
    },
    onError: async (error) => {
      await utils.orders.getById.invalidate({ id: orderId });
      toast.error(error.message);
    },
  });

  const status = invoice?.arcaStatus ?? null;

  if (status === "AUTORIZADO" && invoice) {
    return (
      <Card className="print:hidden">
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm">
            <FileCheck className="size-5 text-emerald-600" />
            <div>
              <p className="font-medium">
                Factura C {formatPuntoVenta(invoice.puntoVenta ?? 0)}-{formatCbteNumero(invoice.cbteNumero ?? 0)}
              </p>
              <p className="text-muted-foreground">
                CAE {invoice.cae} · vence {formatArcaDate(invoice.caeVencimiento)}
              </p>
              {orderStatus === "CANCELADO" && (
                <p className="font-medium text-destructive">
                  Venta cancelada con factura emitida: hacé la nota de crédito C en ARCA.
                </p>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onPrint}>
            <Printer />
            Imprimir factura
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!canEdit || orderStatus === "CANCELADO") return null;

  return (
    <Card className="print:hidden">
      <CardHeader>
        <CardTitle className="text-base font-medium">Factura electrónica (ARCA)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        {status === "ERROR" ? (
          <div className="flex items-start gap-2 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p>No se pudo emitir: {invoice?.arcaError ?? "error desconocido"}</p>
          </div>
        ) : status === "PENDIENTE" ? (
          <p className="text-sm text-muted-foreground">Pidiendo el CAE a ARCA…</p>
        ) : (
          <p className="text-sm text-muted-foreground">Esta venta todavía no tiene factura C.</p>
        )}
        <Button size="sm" disabled={emit.isPending} onClick={() => emit.mutate({ id: orderId })}>
          <RefreshCw className={emit.isPending ? "animate-spin" : undefined} />
          {status === "ERROR" ? "Reintentar" : "Emitir factura C"}
        </Button>
      </CardContent>
    </Card>
  );
}
