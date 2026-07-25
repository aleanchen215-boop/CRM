"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { PaymentStatusBadge } from "@/components/orders/payment-status-badge";
import { OrderStatusSelect } from "@/components/orders/order-status-select";
import { OrderNotifyButton } from "@/components/orders/order-notify-button";
import { OrderCancelButton } from "@/components/orders/order-cancel-button";

const METHOD_LABELS: Record<string, string> = {
  MERCADO_PAGO: "Mercado Pago",
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Mercado Pago (link)",
  OTRO: "Otro",
  PREPAGO: "Prepago",
  VISA: "Visa",
  PAYWAY: "Payway",
};

const CHANNEL_LABELS: Record<string, string> = {
  MOSTRADOR: "Mostrador",
  DELIVERY: "Delivery",
  APPS: "Apps",
};

type Selection =
  | { type: "FIJO"; nombre: string; cantidad: number }
  | { type: "VARIABLE"; categoria: string; productos: { productId: string; nombre: string }[] }
  | { type: "MEDIA_MEDIA"; productos: { productId: string; nombre: string }[] };

function isHalfAndHalf(selections: unknown): selections is [{ type: "MEDIA_MEDIA"; productos: { nombre: string }[] }] {
  return Array.isArray(selections) && (selections as Selection[])[0]?.type === "MEDIA_MEDIA";
}

function itemLabel(item: {
  product: { name: string } | null;
  promotion: { name: string } | null;
  selections: unknown;
}) {
  if (isHalfAndHalf(item.selections)) {
    const [mitad1, mitad2] = item.selections[0].productos;
    return mitad2 ? `Mitad ${mitad1?.nombre ?? "—"} / Mitad ${mitad2?.nombre ?? "—"}` : `Media ${mitad1?.nombre ?? "—"}`;
  }
  return item.product?.name ?? item.promotion?.name ?? "—";
}

function ItemDetail({ selections }: { selections: unknown }) {
  if (!Array.isArray(selections) || selections.length === 0 || isHalfAndHalf(selections)) return null;
  return (
    <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
      {(selections as Selection[]).map((selection, index) =>
        selection.type === "FIJO" ? (
          <li key={index}>
            {selection.cantidad}x {selection.nombre}
          </li>
        ) : selection.type === "VARIABLE" ? (
          <li key={index}>
            {selection.categoria} a elección: {selection.productos.map((p) => p.nombre).join(", ")}
          </li>
        ) : null,
      )}
    </ul>
  );
}

export default function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: order, isLoading } = trpc.orders.getById.useQuery({ id });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!order) {
    return <p className="text-sm text-muted-foreground">Pedido no encontrado.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <div>
          <Link
            href="/ventas"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Ventas
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              Pedido de {order.customer.firstName} {order.customer.lastName}
            </h1>
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge method={order.method} payments={order.payments} />
          </div>
          <p className="text-sm text-muted-foreground">
            {new Date(order.createdAt).toLocaleDateString("es-AR")} ·{" "}
            {METHOD_LABELS[order.method] ?? order.method} ·{" "}
            {CHANNEL_LABELS[order.channel] ?? order.channel}
            {order.channelSource ? ` (${order.channelSource})` : ""}
          </p>
          {order.channel === "DELIVERY" && order.shippingAddress && (
            <p className="text-sm text-muted-foreground">Dirección: {order.shippingAddress}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <OrderNotifyButton orderId={order.id} channel={order.channel} />
          <OrderStatusSelect orderId={order.id} status={order.status} />
          <OrderCancelButton orderId={order.id} status={order.status} />
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer />
            Imprimir comprobante
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Comprobante interno {order.invoice ? `#${order.invoice.id.slice(0, 8)}` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex justify-between text-sm">
            <div>
              <p className="font-medium">
                {order.customer.firstName} {order.customer.lastName}
              </p>
              <p className="text-muted-foreground">{order.customer.whatsapp}</p>
            </div>
            <div className="text-right text-muted-foreground">
              <p>{new Date(order.createdAt).toLocaleDateString("es-AR")}</p>
              <p>{METHOD_LABELS[order.method] ?? order.method}</p>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 font-normal">Producto</th>
                <th className="py-2 font-normal">Cantidad</th>
                <th className="py-2 text-right font-normal">Precio unit.</th>
                <th className="py-2 text-right font-normal">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="py-2">
                    {itemLabel(item)}
                    <ItemDetail selections={item.selections} />
                  </td>
                  <td className="py-2">{item.quantity}</td>
                  <td className="py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                  <td className="py-2 text-right">
                    {formatCurrency(item.unitPrice * item.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {order.notes && (
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <p className="font-medium">Observaciones</p>
              <p className="text-muted-foreground">{order.notes}</p>
            </div>
          )}

          <div className="flex justify-end">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="text-lg font-semibold">{formatCurrency(order.total)}</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Comprobante interno, sin validez fiscal.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
