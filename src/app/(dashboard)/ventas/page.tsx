"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency, formatScheduledLabel } from "@/lib/format";
import { salesChannelValues } from "@/lib/validation/order";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { PaymentStatusBadge } from "@/components/orders/payment-status-badge";
import { NewOrderDialog } from "@/components/orders/new-order-dialog";
import { useSucursalSelection } from "@/components/layout/sucursal-context";

const CHANNEL_LABELS: Record<(typeof salesChannelValues)[number], string> = {
  MOSTRADOR: "Mostrador",
  DELIVERY: "Delivery",
  APPS: "Apps",
};

export default function VentasPage() {
  const { selectedSucursalId } = useSucursalSelection();
  const { data: orders, isLoading } = trpc.orders.list.useQuery(
    { sucursalId: selectedSucursalId },
    { refetchInterval: 5000 },
  );

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
                    className={cn(
                      "flex flex-col gap-1 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50",
                      order.cancelRequestedByCustomerAt && "border-destructive/60 bg-destructive/5",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-medium">
                        {order.customer.firstName} {order.customer.lastName}
                        {order.modifiedByCustomerAt && !order.cancelRequestedByCustomerAt && (
                          <span
                            title="El cliente modificó este pedido"
                            className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white"
                          >
                            !
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <PaymentStatusBadge method={order.method} payments={order.payments} />
                        <OrderStatusBadge status={order.status} />
                      </div>
                    </div>
                    {order.cancelRequestedByCustomerAt && (
                      <Badge variant="destructive" className="w-fit">
                        Cancelado por el cliente
                      </Badge>
                    )}
                    {order.scheduledFor && (
                      <Badge variant="outline" className="w-fit border-blue-500/60 text-blue-600 dark:text-blue-400">
                        {formatScheduledLabel(order.scheduledFor, order.channel)}
                      </Badge>
                    )}
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>
                        {order._count.items} producto{order._count.items === 1 ? "" : "s"}
                        {order.channelSource ? ` · ${order.channelSource}` : ""}
                        {!selectedSucursalId ? ` · ${order.sucursal.name}` : ""}
                      </span>
                      <span>{formatCurrency(order.total)}</span>
                    </div>
                    {channel === "DELIVERY" && order.shippingAddress && (
                      <span className="truncate text-xs text-muted-foreground">
                        {order.shippingAddress}
                      </span>
                    )}
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
