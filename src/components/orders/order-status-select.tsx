"use client";

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
}: {
  orderId: string;
  status: (typeof orderStatusValues)[number];
}) {
  const utils = trpc.useUtils();

  const updateStatus = trpc.orders.updateStatus.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.orders.getById.invalidate({ id: orderId }),
        utils.orders.list.invalidate(),
      ]);
      toast.success("Estado actualizado");
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Select
      value={status}
      onValueChange={(value) =>
        updateStatus.mutate({ id: orderId, status: value as (typeof orderStatusValues)[number] })
      }
    >
      <SelectTrigger className="w-44">
        <SelectValue>
          {(value: (typeof orderStatusValues)[number]) => STATUS_LABELS[value]}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {orderStatusValues.map((value) => (
          <SelectItem key={value} value={value}>
            {STATUS_LABELS[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
