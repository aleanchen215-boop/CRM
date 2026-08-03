"use client";

import { toast } from "sonner";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { useCanPerform } from "@/lib/use-can-perform";

// Solo tiene sentido para pedidos que se cobran por transferencia (Delivery,
// method = TRANSFERENCIA) — ahí sí hay que saber si ya se recibió la plata o
// todavía no, y a diferencia del link de Mercado Pago no hay webhook que lo
// confirme solo: alguien del local lo marca a mano cuando la ve entrar. En
// efectivo se cobra en mano, no aplica.
export function PaymentStatusBadge({
  orderId,
  method,
  payments,
}: {
  orderId: string;
  method: string;
  payments: { status: string }[];
}) {
  const utils = trpc.useUtils();
  const canEdit = useCanPerform("orders:write");

  const setPaid = trpc.orders.setPaymentPaid.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.orders.getById.invalidate({ id: orderId }),
        utils.orders.list.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  if (method !== "TRANSFERENCIA") return null;

  const isPaid = payments.some((payment) => payment.status === "APROBADO");

  if (!canEdit) {
    return (
      <Badge
        variant="outline"
        className={isPaid ? "border-transparent bg-green-600 text-white" : undefined}
      >
        {isPaid ? "Pagado" : "No pagado"}
      </Badge>
    );
  }

  return (
    <button
      type="button"
      disabled={setPaid.isPending}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setPaid.mutate({ id: orderId, paid: !isPaid });
      }}
      title="Cambiar manualmente el estado del pago"
      className={cn(
        badgeVariants({ variant: "outline" }),
        "cursor-pointer disabled:cursor-wait disabled:opacity-70",
        isPaid ? "border-transparent bg-green-600 text-white" : undefined,
      )}
    >
      {isPaid ? "Pagado" : "No pagado"}
    </button>
  );
}
