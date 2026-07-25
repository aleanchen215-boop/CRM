"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Input } from "@/components/ui/input";
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
import { NewSupplyDialog } from "@/components/supplies/new-supply-dialog";
import { MissingSupplies } from "@/components/supplies/missing-supplies";
import { useSucursalSelection } from "@/components/layout/sucursal-context";

// Empanadas primero (son el grueso del catálogo y las que más rotan), el
// resto (prepizzas, insumos sueltos como bolsas de muzzarella, etc.)
// después de un separador — se agrupa según si el insumo está vinculado a
// algún producto de la categoría "Empanadas" (ver ProductSupplyUsage), no
// por nombre.
function isEmpanadaSupply(supply: { productUsages: { product: { category: { name: string } | null } | null }[] }) {
  return supply.productUsages.some((usage) => usage.product?.category?.name === "Empanadas");
}

export default function StockPage() {
  const [search, setSearch] = useState("");
  const { selectedSucursalId } = useSucursalSelection();
  const { data: supplies, isLoading } = trpc.supplies.list.useQuery({
    search,
    sucursalId: selectedSucursalId,
  });

  const empanadaSupplies = supplies?.filter(isEmpanadaSupply) ?? [];
  const otherSupplies = supplies?.filter((supply) => !isEmpanadaSupply(supply)) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stock</h1>
          <p className="text-sm text-muted-foreground">
            Insumos e ingredientes, solo cantidad disponible.
          </p>
        </div>
        <NewSupplyDialog />
      </div>

      <MissingSupplies />

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar insumo…"
          className="pl-8"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Insumo</TableHead>
                {!selectedSucursalId && <TableHead>Sucursal</TableHead>}
                <TableHead>Cantidad</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead>Mínimo</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    Cargando…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && supplies?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
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
                  {!selectedSucursalId && (
                    <TableCell className="text-muted-foreground">{supply.sucursal.name}</TableCell>
                  )}
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
                  <TableCell colSpan={6} className="bg-muted/40 py-1.5 text-xs font-medium text-muted-foreground">
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
                  {!selectedSucursalId && (
                    <TableCell className="text-muted-foreground">{supply.sucursal.name}</TableCell>
                  )}
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
    </div>
  );
}
