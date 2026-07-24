import { Badge } from "@/components/ui/badge";

export function StockLevelBadge({
  stockActual,
  stockMinimo,
}: {
  stockActual: number;
  stockMinimo: number;
}) {
  if (stockActual === 0) {
    return <Badge variant="destructive">Sin stock</Badge>;
  }
  if (stockActual <= stockMinimo) {
    return (
      <Badge variant="secondary" className="text-amber-600 dark:text-amber-500">
        Stock bajo
      </Badge>
    );
  }
  return <Badge variant="outline">OK</Badge>;
}
