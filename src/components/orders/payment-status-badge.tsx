import { Badge } from "@/components/ui/badge";

// Solo tiene sentido para pedidos que se cobran con el link de Mercado Pago
// (method = TRANSFERENCIA) — ahí sí hay que saber si ya se recibió el pago
// o todavía no. En efectivo se cobra en mano, no aplica.
export function PaymentStatusBadge({
  method,
  payments,
}: {
  method: string;
  payments: { status: string }[];
}) {
  if (method !== "TRANSFERENCIA") return null;

  const isPaid = payments.some((payment) => payment.status === "APROBADO");

  return (
    <Badge
      variant="outline"
      className={isPaid ? "border-transparent bg-green-600 text-white" : undefined}
    >
      {isPaid ? "Pagado" : "No pagado"}
    </Badge>
  );
}
