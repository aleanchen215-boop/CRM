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
import { CustomerStatusBadge } from "@/components/customers/customer-status-badge";
import { NewCustomerDialog } from "@/components/customers/new-customer-dialog";

export default function ClientesPage() {
  const [search, setSearch] = useState("");
  const { data: customers, isLoading } = trpc.customers.list.useQuery({ search });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Ficha de cliente, historial, etiquetas y segmentación.
          </p>
        </div>
        <NewCustomerDialog />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, WhatsApp o email…"
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
                <TableHead>Cliente</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead>Compras</TableHead>
                <TableHead>Última compra</TableHead>
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
              {!isLoading && customers?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    Todavía no hay clientes cargados.
                  </TableCell>
                </TableRow>
              )}
              {customers?.map((customer) => (
                <TableRow key={customer.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/clientes/${customer.id}`} className="font-medium hover:underline">
                      {customer.firstName} {customer.lastName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{customer.whatsapp}</TableCell>
                  <TableCell className="text-muted-foreground">{customer.city ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{customer._count.orders}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.lastOrderAt
                      ? new Date(customer.lastOrderAt).toLocaleDateString("es-AR")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <CustomerStatusBadge status={customer.status} />
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
