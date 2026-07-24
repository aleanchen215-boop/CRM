"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency } from "@/lib/format";
import { salesChannelValues } from "@/lib/validation/order";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { NewOrderDialog } from "@/components/orders/new-order-dialog";

const CHANNEL_LABELS: Record<(typeof salesChannelValues)[number], string> = {
  MOSTRADOR: "Mostrador",
  DELIVERY: "Delivery",
  APPS: "Apps",
};

export default function VentasPage() {
  const { data: orders, isLoading } = trpc.orders.list.useQuery();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
          <p className="text-sm text-muted-foreground">
            Pedidos por canal, estados y comprobantes.
          </p>
        </div>
        <NewOrderDialog />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {salesChannelValues.map((channel) => {
          const channelOrders = orders?.filter((order) => order.channel === channel) ?? [];
          return (
            <Card key={channel} className="flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base font-medium">
                  {CHANNEL_LABELS[channel]}
                </CardTitle>
                <Badge variant="secondary">{channelOrders.length}</Badge>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-2">
                {isLoading && (
                  <p className="text-sm text-muted-foreground">Cargando…</p>
                )}
                {!isLoading && channelOrders.length === 0 && (
                  <p className="text-sm text-muted-foreground">Sin pedidos todavía.</p>
                )}
                {channelOrders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/ventas/${order.id}`}
                    className="flex flex-col gap-1 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {order.customer.firstName} {order.customer.lastName}
                      </span>
                      <OrderStatusBadge status={order.status} />
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>
                        {order._count.items} producto{order._count.items === 1 ? "" : "s"}
                        {order.channelSource ? ` · ${order.channelSource}` : ""}
                      </span>
                      <span>{formatCurrency(order.total)}</span>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
