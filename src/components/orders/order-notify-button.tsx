"use client";

import { toast } from "sonner";
import { Bike, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";

export function OrderNotifyButton({
  orderId,
  channel,
}: {
  orderId: string;
  channel: string;
}) {
  const notify = trpc.orders.notifyStatus.useMutation({
    onSuccess: () => toast.success("Aviso enviado por WhatsApp"),
    onError: (error) => toast.error(error.message),
  });

  if (channel === "MOSTRADOR") {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={notify.isPending}
        onClick={() => notify.mutate({ orderId, kind: "LISTO" })}
      >
        <CheckCircle2 />
        Pedido listo
      </Button>
    );
  }

  if (channel === "DELIVERY") {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={notify.isPending}
        onClick={() => notify.mutate({ orderId, kind: "EN_CAMINO" })}
      >
        <Bike />
        Cadete en viaje
      </Button>
    );
  }

  return null;
}
