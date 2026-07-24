import { Badge } from "@/components/ui/badge";

export function SupplyLevelBadge({
  quantity,
  stockMinimo,
}: {
  quantity: number;
  stockMinimo: number;
}) {
  if (quantity === 0) {
    return <Badge variant="destructive">Sin stock</Badge>;
  }
  if (quantity <= stockMinimo) {
    return (
      <Badge variant="secondary" className="text-amber-600 dark:text-amber-500">
        Stock bajo
      </Badge>
    );
  }
  return <Badge variant="outline">OK</Badge>;
}
