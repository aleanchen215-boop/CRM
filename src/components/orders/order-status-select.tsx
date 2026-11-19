"use client";

import { useState } from "react";
import { toast } from "sonner";
import { orderStatusValues } from "@/lib/validation/order";
import { trpc } from "@/lib/trpc/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SplitPaymentDialog } from "@/components/orders/split-payment-dialog";
import { EmitirFacturaDialog } from "@/components/orders/emitir-factura-dialog";

const STATUS_LABELS: Record<(typeof orderStatusValues)[number], string> = {
  PENDIENTE: "Pendiente",
  CONFIRMADO: "Confirmado",
  ENVIADO: "Enviado",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};

export function OrderStatusSelect({
  orderId,
  status,
  paymentMode,
  total,
  channel,
  channelSource,
  method,
  invoiced,
  onInvoiced,
}: {
  orderId: string;
  status: (typeof orderStatusValues)[number];
  paymentMode: "SIMPLE" | "MULTIPLE";
  total: number;
  channel: "MOSTRADOR" | "DELIVERY" | "APPS";
  channelSource?: string | null;
  method: string;
  // Si la venta ya tiene factura C con CAE no se vuelve a ofrecer emitirla.
  invoiced: boolean;
  // Se llama cuando se emitió la factura desde la ventana — el detalle la
  // imprime en el momento.
  onInvoiced?: () => void;
}) {
  const utils = trpc.useUtils();
  const [splitOpen, setSplitOpen] = useState(false);
  const [facturaOpen, setFacturaOpen] = useState(false);

  const updateStatus = trpc.orders.updateStatus.useMutation({
    onSuccess: async (_order, variables) => {
      await Promise.all([
        utils.orders.getById.invalidate({ id: orderId }),
        utils.orders.list.invalidate(),
      ]);
      toast.success("Estado actualizado");
      // Venta cobrada con Payway que se acaba de entregar: se ofrece emitir
      // la factura C (botón verde Emitir / rojo Cancelar).
      if (variables.status === "ENTREGADO" && method === "PAYWAY" && paymentMode === "SIMPLE" && !invoiced) {
        setFacturaOpen(true);
      }
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <>
      <Select
        value={status}
        onValueChange={(value) => {
          // Pago múltiple no se confirma con este selector: hay que repartir
          // el pago entre los medios primero (ver recordSplitPayment), que
          // deja el pedido en ENTREGADO como parte de esa misma acción.
          if (value === "ENTREGADO" && paymentMode === "MULTIPLE") {
            setSplitOpen(true);
            return;
          }
          updateStatus.mutate({ id: orderId, status: value as (typeof orderStatusValues)[number] });
        }}
      >
        <SelectTrigger className="w-44">
          <SelectValue>
            {(value: (typeof orderStatusValues)[number]) => STATUS_LABELS[value]}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {orderStatusValues
            // CANCELADO no se elige acá — solo a través del botón dedicado
            // Cancelar venta (permiso más estricto, no cualquiera con
            // orders:write). Si el pedido ya está cancelado, igual se puede
            // mostrar como valor actual sin ofrecerlo para elegir de nuevo.
            .filter((value) => value !== "CANCELADO")
            .map((value) => (
              <SelectItem key={value} value={value}>
                {STATUS_LABELS[value]}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>

      <SplitPaymentDialog
        open={splitOpen}
        onOpenChange={setSplitOpen}
        orderId={orderId}
        total={total}
        channel={channel}
        channelSource={channelSource}
      />

      <EmitirFacturaDialog
        open={facturaOpen}
        onOpenChange={setFacturaOpen}
        orderId={orderId}
        total={total}
        onEmitted={onInvoiced}
      />
    </>
  );
}
