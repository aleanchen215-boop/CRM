"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductForm } from "@/components/stock/product-form";
import { StockLevelBadge } from "@/components/stock/stock-level-badge";
import { MovementDialog } from "@/components/stock/movement-dialog";

const MOVEMENT_LABELS: Record<string, string> = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  AJUSTE: "Ajuste",
};

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: product, isLoading } = trpc.products.getById.useQuery({ id });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!product) {
    return <p className="text-sm text-muted-foreground">Producto no encontrado.</p>;
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
          <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
          <StockLevelBadge stockActual={product.stockActual} stockMinimo={product.stockMinimo} />
        </div>
        <p className="text-sm text-muted-foreground">
          SKU {product.sku} · Stock actual: {product.stockActual} · Precio:{" "}
          {formatCurrency(product.price)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Datos del producto</CardTitle>
            </CardHeader>
            <CardContent>
              <ProductForm
                mode="edit"
                productId={product.id}
                defaultValues={{
                  sku: product.sku,
                  internalCode: product.internalCode ?? "",
                  name: product.name,
                  category: product.category?.name ?? "",
                  supplier: product.supplier?.name ?? "",
                  cost: Number(product.cost),
                  price: Number(product.price),
                  stockMinimo: product.stockMinimo,
                  stockIdeal: product.stockIdeal,
                  location: product.location ?? "",
                }}
                onSuccess={() => {}}
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base font-medium">Movimientos de stock</CardTitle>
              <MovementDialog productId={product.id} />
            </CardHeader>
            <CardContent>
              {product.movements.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin movimientos todavía.</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {product.movements.map((movement) => (
                    <li key={movement.id} className="flex items-center justify-between gap-2">
                      <span>{MOVEMENT_LABELS[movement.type]}</span>
                      <span
                        className={
                          movement.quantity < 0 ? "text-destructive" : "text-foreground"
                        }
                      >
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
    </div>
  );
}
