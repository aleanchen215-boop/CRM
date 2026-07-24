"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomerForm } from "@/components/customers/customer-form";
import { CustomerTags } from "@/components/customers/customer-tags";
import { CustomerStatusBadge } from "@/components/customers/customer-status-badge";

export default function ClienteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: customer, isLoading } = trpc.customers.getById.useQuery({ id });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!customer) {
    return <p className="text-sm text-muted-foreground">Cliente no encontrado.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/clientes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Clientes
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {customer.firstName} {customer.lastName}
          </h1>
          <CustomerStatusBadge status={customer.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          Cliente desde {new Date(customer.createdAt).toLocaleDateString("es-AR")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Datos del cliente</CardTitle>
            </CardHeader>
            <CardContent>
              <CustomerForm
                mode="edit"
                customerId={customer.id}
                defaultValues={{
                  firstName: customer.firstName,
                  lastName: customer.lastName,
                  whatsapp: customer.whatsapp,
                  email: customer.email ?? "",
                  address: customer.address ?? "",
                  city: customer.city ?? "",
                  province: customer.province ?? "",
                  country: customer.country ?? "",
                  origin: customer.origin ?? "",
                  notes: customer.notes ?? "",
                  status: customer.status,
                }}
                onSuccess={() => {}}
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Etiquetas</CardTitle>
            </CardHeader>
            <CardContent>
              <CustomerTags customerId={customer.id} tags={customer.tags} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Historial de compras</CardTitle>
            </CardHeader>
            <CardContent>
              {customer.orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin compras registradas todavía.
                </p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {customer.orders.map((order) => (
                    <li key={order.id} className="flex items-center justify-between">
                      <span>{new Date(order.createdAt).toLocaleDateString("es-AR")}</span>
                      <span className="text-muted-foreground">{order.status}</span>
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
