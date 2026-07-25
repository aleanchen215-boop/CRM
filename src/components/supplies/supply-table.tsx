"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SupplyLevelBadge } from "@/components/supplies/supply-level-badge";

// Empanadas primero (son el grueso del catálogo y las que más rotan), el
// resto (prepizzas, insumos sueltos como bolsas de muzzarella, etc.)
// después de un separador — se agrupa según si el insumo está vinculado a
// algún producto de la categoría "Empanadas" (ver ProductSupplyUsage), no
// por nombre.
function isEmpanadaSupply(supply: { productUsages: { product: { category: { name: string } | null } | null }[] }) {
  return supply.productUsages.some((usage) => usage.product?.category?.name === "Empanadas");
}

// Tabla de insumos de UNA sucursal puntual (nunca combinada) — no muestra
// columna de sucursal porque queda implícita en dónde se use este
// componente.
export function SupplyTable({ sucursalId, search }: { sucursalId: string; search?: string }) {
  const { data: supplies, isLoading } = trpc.supplies.list.useQuery({ search, sucursalId });

  const empanadaSupplies = supplies?.filter(isEmpanadaSupply) ?? [];
  const otherSupplies = supplies?.filter((supply) => !isEmpanadaSupply(supply)) ?? [];

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Insumo</TableHead>
              <TableHead>Cantidad</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead>Mínimo</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && supplies?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  Todavía no hay insumos cargados.
                </TableCell>
              </TableRow>
            )}
            {empanadaSupplies.map((supply) => (
              <TableRow key={supply.id}>
                <TableCell>
                  <Link href={`/stock/${supply.id}`} className="font-medium hover:underline">
                    {supply.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{supply.quantity}</TableCell>
                <TableCell className="text-muted-foreground">{supply.unit ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{supply.stockMinimo}</TableCell>
                <TableCell>
                  <SupplyLevelBadge quantity={supply.quantity} stockMinimo={supply.stockMinimo} />
                </TableCell>
              </TableRow>
            ))}
            {empanadaSupplies.length > 0 && otherSupplies.length > 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="bg-muted/40 py-1.5 text-xs font-medium text-muted-foreground">
                  Otros insumos
                </TableCell>
              </TableRow>
            )}
            {otherSupplies.map((supply) => (
              <TableRow key={supply.id}>
                <TableCell>
                  <Link href={`/stock/${supply.id}`} className="font-medium hover:underline">
                    {supply.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{supply.quantity}</TableCell>
                <TableCell className="text-muted-foreground">{supply.unit ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{supply.stockMinimo}</TableCell>
                <TableCell>
                  <SupplyLevelBadge quantity={supply.quantity} stockMinimo={supply.stockMinimo} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
