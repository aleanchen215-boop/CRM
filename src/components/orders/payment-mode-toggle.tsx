"use client";

import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Pago simple: se cobra todo con el método elegido en el selector de al
// lado. Pago múltiple: al marcar el pedido entregado se abre una ventana
// para repartir el total entre varios medios (ver SplitPaymentDialog).
export function PaymentModeToggle({
  orderId,
  paymentMode,
}: {
  orderId: string;
  paymentMode: "SIMPLE" | "MULTIPLE";
}) {
  const utils = trpc.useUtils();

  const setMode = trpc.orders.setPaymentMode.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.orders.getById.invalidate({ id: orderId }),
        utils.orders.list.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="inline-flex items-center overflow-hidden rounded-md border">
      {(["SIMPLE", "MULTIPLE"] as const).map((mode) => (
        <Button
          key={mode}
          type="button"
          size="sm"
          variant="ghost"
          disabled={setMode.isPending}
          className={cn(
            "rounded-none border-0",
            paymentMode === mode && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
          )}
          onClick={() => mode !== paymentMode && setMode.mutate({ id: orderId, paymentMode: mode })}
        >
          {mode === "SIMPLE" ? "Pago simple" : "Pago múltiple"}
        </Button>
      ))}
    </div>
  );
}
