"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { hasBeenHandled, markAsHandled } from "@/lib/printed-orders";

const CHANNEL_LABELS: Record<(typeof salesChannelValues)[number], string> = {
  MOSTRADOR: "Mostrador",
  DELIVERY: "Delivery",
  APPS: "Apps",
};

export default function VentasPage() {
  const { selectedSucursalId } = useSucursalSelection();
  const router = useRouter();
  const { data: orders, isLoading } = trpc.orders.list.useQuery(
    { sucursalId: selectedSucursalId },
    { refetchInterval: 5000 },
  );

  // Avisa de pedidos nuevos que aparecieron entre un sondeo y otro (típico
  // de un pedido armado solo por WhatsApp) con un botón para imprimir la
  // comanda en el momento — no avisa de todo lo que ya había al entrar a
  // la página (esa carga inicial solo arma la base de comparación), ni de
  // uno que ya se imprimió (creado manualmente acá mismo, o desde otra
  // pestaña) gracias al registro compartido en localStorage.
  const seenIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!orders) return;
    const currentIds = new Set(orders.map((order) => order.id));
    if (seenIds.current) {
      for (const order of orders) {
        if (seenIds.current.has(order.id) || hasBeenHandled(order.id)) continue;
        toast(`Pedido nuevo de ${order.customer.firstName} ${order.customer.lastName}`, {
          description: `${order._count.items} producto${order._count.items === 1 ? "" : "s"} · ${formatCurrency(order.total)}`,
          duration: 20000,
          action: {
            label: "Imprimir comanda",
            onClick: () => {
              markAsHandled(order.id);
              router.push(`/ventas/${order.id}?autoprint=1`);
            },
          },
        });
      }
    }
    seenIds.current = currentIds;
  }, [orders, router]);

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
                      // Pedido armado por la IA de WhatsApp (sin vendedor)
                      // que todavía no se imprimió — se resalta para que no
                      // se pase por alto hasta que alguien del local
                      // efectivamente lo vea/imprima la comanda. El aviso de
                      // cancelación pedida por el cliente es más urgente, así
                      // que gana si ambos aplican a la vez.
                      order.cancelRequestedByCustomerAt
                        ? "border-destructive/60 bg-destructive/5"
                        : !order.employeeId && !order.comandaPrintedAt && "border-violet-500/60 bg-violet-500/5",
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
                        <PaymentStatusBadge orderId={order.id} method={order.method} payments={order.payments} />
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
