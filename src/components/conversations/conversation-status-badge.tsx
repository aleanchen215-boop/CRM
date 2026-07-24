import { Badge } from "@/components/ui/badge";

const STATUS_LABELS: Record<string, string> = {
  ABIERTA: "Abierta",
  PENDIENTE: "Pendiente",
  CERRADA: "Cerrada",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  ABIERTA: "default",
  PENDIENTE: "secondary",
  CERRADA: "outline",
};

export function ConversationStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? "secondary"}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
