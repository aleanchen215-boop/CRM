"use client";

import { useState } from "react";
import { toast } from "sonner";
import { paymentMethodValues, getAllowedPaymentMethods } from "@/lib/validation/order";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const METHOD_LABELS: Record<(typeof paymentMethodValues)[number], string> = {
  MERCADO_PAGO: "Mercado Pago",
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  OTRO: "Otro",
  PREPAGO: "Prepago",
  VISA: "Visa",
  PAYWAY: "Payway",
  CUENTA_CORRIENTE: "Cuenta corriente",
};

// Se abre al marcar como entregado un pedido en modo de pago múltiple: hay
// que repartir el total entre los medios de pago que corresponda (ej.
// $20.000 en efectivo + $5.000 en Payway) antes de poder confirmarlo — ver
// recordSplitPayment en el servidor, que valida que sumen exacto.
export function SplitPaymentDialog({
  open,
  onOpenChange,
  orderId,
  total,
  channel,
  channelSource,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  total: number;
  channel: "MOSTRADOR" | "DELIVERY" | "APPS";
  channelSource?: string | null;
}) {
  const utils = trpc.useUtils();
  const allowedMethods = getAllowedPaymentMethods(channel, channelSource ?? undefined);
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const record = trpc.orders.recordSplitPayment.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.orders.getById.invalidate({ id: orderId }),
        utils.orders.list.invalidate(),
      ]);
      toast.success("Pago registrado, pedido entregado");
      setAmounts({});
      onOpenChange(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const loaded = Object.values(amounts).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const remaining = total - loaded;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Repartir el pago</DialogTitle>
        </DialogHeader>
        <FieldGroup className="gap-3">
          {allowedMethods.map((method) => (
            <Field key={method}>
              <FieldLabel htmlFor={`split-${method}`}>{METHOD_LABELS[method]}</FieldLabel>
              <Input
                id={`split-${method}`}
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={amounts[method] ?? ""}
                onChange={(e) => setAmounts((prev) => ({ ...prev, [method]: e.target.value }))}
              />
            </Field>
          ))}

          <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Total del pedido</span>
            <span className="font-medium">{formatCurrency(total)}</span>
          </div>
          <div className="flex items-center justify-between px-3 text-sm">
            <span className="text-muted-foreground">
              {remaining === 0 ? "Cargado completo" : remaining > 0 ? "Falta cargar" : "Se pasó por"}
            </span>
            <span className={remaining === 0 ? "font-medium text-green-600" : "font-medium text-destructive"}>
              {formatCurrency(Math.abs(remaining))}
            </span>
          </div>

          <Button
            type="button"
            disabled={remaining !== 0 || record.isPending}
            onClick={() =>
              record.mutate({
                id: orderId,
                payments: allowedMethods
                  .filter((method) => Number(amounts[method]) > 0)
                  .map((method) => ({ method, amount: Number(amounts[method]) })),
              })
            }
          >
            {record.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </FieldGroup>
      </DialogContent>
    </Dialog>
  );
}
