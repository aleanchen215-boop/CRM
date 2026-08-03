"use client";

import { toast } from "sonner";
import { paymentMethodValues, getAllowedPaymentMethods } from "@/lib/validation/order";
import { trpc } from "@/lib/trpc/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

// Cambiar cómo termina pagando el cliente después de creada la venta — ej.
// dijo que pagaba en efectivo al cargar el pedido y terminó pagando con
// QR/Mercado Pago. Solo se puede mientras el pedido siga modificable
// (isModifiable en el servidor); si ya salió/se entregó, la mutation avisa.
export function PaymentMethodSelect({
  orderId,
  method,
  channel,
  channelSource,
}: {
  orderId: string;
  method: (typeof paymentMethodValues)[number];
  channel: "MOSTRADOR" | "DELIVERY" | "APPS";
  channelSource?: string | null;
}) {
  const utils = trpc.useUtils();

  const updatePayment = trpc.orders.updatePayment.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.orders.getById.invalidate({ id: orderId }),
        utils.orders.list.invalidate(),
      ]);
      toast.success("Método de pago actualizado");
    },
    onError: (error) => toast.error(error.message),
  });

  const allowedMethods = getAllowedPaymentMethods(channel, channelSource ?? undefined);

  return (
    <Select
      value={method}
      onValueChange={(value) =>
        updatePayment.mutate({ id: orderId, method: value as (typeof paymentMethodValues)[number] })
      }
    >
      <SelectTrigger className="w-44">
        <SelectValue>
          {(value: (typeof paymentMethodValues)[number]) => METHOD_LABELS[value]}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {allowedMethods.map((value) => (
          <SelectItem key={value} value={value}>
            {METHOD_LABELS[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
