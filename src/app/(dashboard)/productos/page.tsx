"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency } from "@/lib/format";
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
import { NewProductDialog } from "@/components/products/new-product-dialog";
import { NewPromotionDialog } from "@/components/promotions/new-promotion-dialog";
import { PromotionCard } from "@/components/promotions/promotion-card";

const SIN_CATEGORIA = "Sin categoría";

export default function ProductosPage() {
  const [search, setSearch] = useState("");
  const { data: products, isLoading } = trpc.products.list.useQuery({ search });
  const { data: promotions, isLoading: promotionsLoading } = trpc.promotions.list.useQuery();

  const groups = new Map<string, NonNullable<typeof products>>();
  for (const product of products ?? []) {
    const key = product.category?.name ?? SIN_CATEGORIA;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(product);
  }
  const categoryNames = [...groups.keys()].sort((a, b) =>
    a === SIN_CATEGORIA ? 1 : b === SIN_CATEGORIA ? -1 : a.localeCompare(b),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo de venta: nombre, precio y costo, por categoría.
          </p>
        </div>
        <NewProductDialog />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre o SKU…"
          className="pl-8"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {!isLoading && (products?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Todavía no hay productos cargados.
          </CardContent>
        </Card>
      )}

      {categoryNames.map((categoryName) => (
        <div key={categoryName} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">{categoryName}</h2>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Costo</TableHead>
                    <TableHead>Precio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.get(categoryName)!.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <Link
                          href={`/productos/${product.id}`}
                          className="font-medium hover:underline"
                        >
                          {product.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{product.sku ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatCurrency(product.cost)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatCurrency(product.price)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ))}

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Promociones</h2>
          <NewPromotionDialog />
        </div>
        {promotionsLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {!promotionsLoading && (promotions?.length ?? 0) === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Todavía no hay promociones cargadas.
            </CardContent>
          </Card>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {promotions?.map((promotion) => (
            <PromotionCard key={promotion.id} promotion={promotion} />
          ))}
        </div>
      </div>
    </div>
  );
}
