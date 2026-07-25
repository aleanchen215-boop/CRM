"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SupplyForm } from "@/components/supplies/supply-form";
import { SupplyLevelBadge } from "@/components/supplies/supply-level-badge";
import { MovementDialog } from "@/components/supplies/movement-dialog";
import { useCanPerform } from "@/lib/use-can-perform";

const MOVEMENT_LABELS: Record<string, string> = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  AJUSTE: "Ajuste",
};

export default function SupplyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const canWrite = useCanPerform("stock:write");
  const { data: supply, isLoading } = trpc.supplies.getById.useQuery({ id });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!supply) {
    return <p className="text-sm text-muted-foreground">Insumo no encontrado.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/stock"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Stock
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{supply.name}</h1>
          <SupplyLevelBadge quantity={supply.quantity} stockMinimo={supply.stockMinimo} />
        </div>
        <p className="text-sm text-muted-foreground">
          Cantidad actual: {supply.quantity} {supply.unit ?? ""}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Datos del insumo</CardTitle>
            </CardHeader>
            <CardContent>
              {canWrite ? (
                <SupplyForm
                  mode="edit"
                  supplyId={supply.id}
                  defaultValues={{
                    name: supply.name,
                    unit: supply.unit ?? "",
                    stockMinimo: supply.stockMinimo,
                    stockIdeal: supply.stockIdeal,
                  }}
                  onSuccess={() => {}}
                />
              ) : (
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Unidad</dt>
                    <dd>{supply.unit ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Mínimo</dt>
                    <dd>{supply.stockMinimo}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Ideal</dt>
                    <dd>{supply.stockIdeal}</dd>
                  </div>
                </dl>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">Movimientos</CardTitle>
            {canWrite && <MovementDialog supplyId={supply.id} />}
          </CardHeader>
          <CardContent>
            {supply.movements.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin movimientos todavía.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {supply.movements.map((movement) => (
                  <li key={movement.id} className="flex items-center justify-between gap-2">
                    <span>{MOVEMENT_LABELS[movement.type]}</span>
                    <span className={movement.quantity < 0 ? "text-destructive" : "text-foreground"}>
                      {movement.quantity > 0 ? "+" : ""}
                      {movement.quantity}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(movement.createdAt).toLocaleDateString("es-AR")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
