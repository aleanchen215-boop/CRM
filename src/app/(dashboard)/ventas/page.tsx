"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { NewOrderDialog } from "@/components/orders/new-order-dialog";

export default function VentasPage() {
  const { data: orders, isLoading } = trpc.orders.list.useQuery();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
          <p className="text-sm text-muted-foreground">
            Pedidos, estados y comprobantes.
          </p>
        </div>
        <NewOrderDialog />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Productos</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Fecha</TableHead>
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
              {!isLoading && orders?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    Todavía no hay pedidos cargados.
                  </TableCell>
                </TableRow>
              )}
              {orders?.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link href={`/ventas/${order.id}`} className="font-medium hover:underline">
                      {order.customer.firstName} {order.customer.lastName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {order._count.items}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatCurrency(order.total)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{order.channel}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(order.createdAt).toLocaleDateString("es-AR")}
                  </TableCell>
                  <TableCell>
                    <OrderStatusBadge status={order.status} />
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
