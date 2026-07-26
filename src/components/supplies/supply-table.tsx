"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Pencil, Plus, X } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useCanPerform } from "@/lib/use-can-perform";
import { getRestockMode } from "@/lib/restock-mode";
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

// Control de stock rápido sin pasar por la pantalla de detalle — pensado
// para Repartidor (y Admin), que solo puede sumar/ajustar, nunca crear,
// editar o sacar. Dos modos según la sucursal (ver getRestockMode):
// "add" suma una cantidad al total actual; "set" deja el total en el
// número que se cuenta (ajuste), precargado con la cantidad actual.
function RestockControl({
  supplyId,
  currentQuantity,
  mode,
}: {
  supplyId: string;
  currentQuantity: number;
  mode: "add" | "set";
}) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const utils = trpc.useUtils();

  const onSuccess = async (message: string) => {
    toast.success(message);
    setQuantity("");
    setOpen(false);
    await utils.supplies.list.invalidate();
  };

  const restock = trpc.supplies.restock.useMutation({
    onSuccess: () => onSuccess("Stock sumado"),
    onError: (error) => toast.error(error.message),
  });
  const setStock = trpc.supplies.setStock.useMutation({
    onSuccess: () => onSuccess("Stock actualizado"),
    onError: (error) => toast.error(error.message),
  });

  const pending = restock.isPending || setStock.isPending;

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={() => {
          setQuantity(mode === "set" ? String(currentQuantity) : "");
          setOpen(true);
        }}
      >
        {mode === "add" ? <Plus /> : <Pencil />}
        <span className="sr-only">{mode === "add" ? "Sumar stock" : "Ajustar cantidad"}</span>
      </Button>
    );
  }

  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const n = Number(quantity);
        if (mode === "add") {
          if (!n || n <= 0) return;
          restock.mutate({ supplyId, quantity: n });
        } else {
          if (Number.isNaN(n) || n < 0) return;
          setStock.mutate({ supplyId, quantity: n });
        }
      }}
    >
      <Input
        type="number"
        min={0}
        autoFocus
        placeholder={mode === "add" ? "Cant." : "Total"}
        title={mode === "set" ? "Cantidad total que hay ahora" : undefined}
        className="h-7 w-16"
        value={quantity}
        onChange={(event) => setQuantity(event.target.value)}
        disabled={pending}
      />
      <Button type="submit" size="icon-sm" disabled={pending || !quantity}>
        <Check />
        <span className="sr-only">Confirmar</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={pending}
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
  const { data: sucursales } = trpc.sucursales.list.useQuery();
  const restockMode = getRestockMode(sucursales?.find((s) => s.id === sucursalId)?.slug);

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
                    <RestockControl
                      supplyId={supply.id}
                      currentQuantity={supply.quantity}
                      mode={restockMode}
                    />
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
                    <RestockControl
                      supplyId={supply.id}
                      currentQuantity={supply.quantity}
                      mode={restockMode}
                    />
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
