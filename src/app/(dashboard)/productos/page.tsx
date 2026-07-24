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

export default function ProductosPage() {
  const [search, setSearch] = useState("");
  const { data: products, isLoading } = trpc.products.list.useQuery({ search });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo de venta: nombre, precio y costo.
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

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Costo</TableHead>
                <TableHead>Precio</TableHead>
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
              {!isLoading && products?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    Todavía no hay productos cargados.
                  </TableCell>
                </TableRow>
              )}
              {products?.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <Link href={`/productos/${product.id}`} className="font-medium hover:underline">
                      {product.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{product.sku}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {product.category?.name ?? "—"}
                  </TableCell>
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
  );
}
