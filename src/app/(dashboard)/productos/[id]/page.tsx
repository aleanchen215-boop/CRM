"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductForm } from "@/components/products/product-form";

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
          href="/productos"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Productos
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{product.name}</h1>
        <p className="text-sm text-muted-foreground">SKU {product.sku}</p>
      </div>

      <Card className="max-w-2xl">
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
            }}
            onSuccess={() => {}}
          />
        </CardContent>
      </Card>
    </div>
  );
}
