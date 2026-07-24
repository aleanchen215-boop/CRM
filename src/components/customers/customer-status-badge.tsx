import { Badge } from "@/components/ui/badge";

const STATUS_LABELS: Record<string, string> = {
  ACTIVO: "Activo",
  INACTIVO: "Inactivo",
  PERDIDO: "Perdido",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  ACTIVO: "default",
  INACTIVO: "secondary",
  PERDIDO: "destructive",
};

export function CustomerStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? "secondary"}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
