"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Plus, X } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useCanPerform } from "@/lib/use-can-perform";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

// Botón "+" para sumar cantidad a un insumo sin pasar por la pantalla de
// detalle — pensado para Repartidor, que solo puede sumar (nunca sacar ni
// ajustar).
function RestockControl({ supplyId }: { supplyId: string }) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const utils = trpc.useUtils();

  const restock = trpc.supplies.restock.useMutation({
    onSuccess: async () => {
      toast.success("Stock sumado");
      setQuantity("");
      setOpen(false);
      await utils.supplies.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  if (!open) {
    return (
      <Button type="button" variant="outline" size="icon-sm" onClick={() => setOpen(true)}>
        <Plus />
        <span className="sr-only">Sumar stock</span>
      </Button>
    );
  }

  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const n = Number(quantity);
        if (!n || n <= 0) return;
        restock.mutate({ supplyId, quantity: n });
      }}
    >
      <Input
        type="number"
        min={1}
        autoFocus
        placeholder="Cant."
        className="h-7 w-16"
        value={quantity}
        onChange={(event) => setQuantity(event.target.value)}
        disabled={restock.isPending}
      />
      <Button type="submit" size="icon-sm" disabled={restock.isPending || !quantity}>
        <Check />
        <span className="sr-only">Confirmar</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={restock.isPending}
        onClick={() => {
          setOpen(false);
          setQuantity("");
        }}
      >
        <X />
        <span className="sr-only">Cancelar</span>
      </Button>
    </form>
  );
}

// Tabla de insumos de UNA sucursal puntual (nunca combinada) — no muestra
// columna de sucursal porque queda implícita en dónde se use este
// componente.
export function SupplyTable({ sucursalId, search }: { sucursalId: string; search?: string }) {
  const canAdd = useCanPerform("stock:add");
  const { data: supplies, isLoading } = trpc.supplies.list.useQuery({ search, sucursalId });

  const empanadaSupplies = supplies?.filter(isEmpanadaSupply) ?? [];
  const otherSupplies = supplies?.filter((supply) => !isEmpanadaSupply(supply)) ?? [];
  const columnCount = canAdd ? 6 : 5;

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
              {canAdd && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-center text-sm text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && supplies?.length === 0 && (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-center text-sm text-muted-foreground">
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
                {canAdd && (
                  <TableCell>
                    <RestockControl supplyId={supply.id} />
                  </TableCell>
                )}
              </TableRow>
            ))}
            {empanadaSupplies.length > 0 && otherSupplies.length > 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={columnCount}
                  className="bg-muted/40 py-1.5 text-xs font-medium text-muted-foreground"
                >
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
                {canAdd && (
                  <TableCell>
                    <RestockControl supplyId={supply.id} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
