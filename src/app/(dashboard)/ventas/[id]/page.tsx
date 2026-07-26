"use client";

import { use, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, TriangleAlert } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency, formatScheduledLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
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
  const { data: order, isLoading } = trpc.orders.getById.useQuery({ id }, { refetchInterval: 5000 });
  const utils = trpc.useUtils();

  const acknowledge = trpc.orders.acknowledgeChanges.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.orders.getById.invalidate({ id }),
        utils.orders.list.invalidate(),
      ]);
    },
  });

  // Si el cliente modificó el pedido por WhatsApp, marcarlo como "visto" al
  // abrir el detalle (apaga el "!" en Ventas) — la cancelación pedida por el
  // cliente NO se limpia acá, solo se resuelve confirmando/cancelando.
  useEffect(() => {
    if (order?.modifiedByCustomerAt && !acknowledge.isPending) {
      acknowledge.mutate({ id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.modifiedByCustomerAt, id]);

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
      {order.cancelRequestedByCustomerAt && (
        <div className="flex items-center gap-3 rounded-lg border-2 border-destructive bg-destructive/10 px-4 py-3 text-destructive print:hidden">
          <TriangleAlert className="size-6 shrink-0" />
          <div>
            <p className="text-lg font-bold">CANCELADO POR EL CLIENTE</p>
            <p className="text-sm">
              El cliente pidió cancelar este pedido por WhatsApp. Confirmá la cancelación con el botón de abajo
              para sacarlo de la vista de Ventas.
            </p>
          </div>
        </div>
      )}
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
            {order.scheduledFor && (
              <span className="rounded-full border border-blue-500/60 px-2 py-0.5 text-sm font-medium text-blue-600 dark:text-blue-400">
                {formatScheduledLabel(order.scheduledFor, order.channel)}
              </span>
            )}
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
          <OrderCancelButton
            orderId={order.id}
            status={order.status}
            cancelRequestedByCustomerAt={order.cancelRequestedByCustomerAt}
          />
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer />
            Imprimir comprobante
          </Button>
        </div>
      </div>

      <Card className="print:hidden">
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
                <tr
                  key={item.id}
                  className={cn(
                    "border-b last:border-0",
                    item.addedByCustomerAt && "bg-amber-500/10",
                  )}
                >
                  <td className="py-2">
                    {itemLabel(item)}
                    {item.addedByCustomerAt && (
                      <span className="ml-2 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        agregado por el cliente
                      </span>
                    )}
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

      {/* Vista de solo impresión para la térmica de 80mm — .receipt-print
          queda display:none salvo en @media print (ver globals.css).
          Angosta, monoespaciada, sin tabla de columnas: cada renglón apila
          cantidad/nombre arriba y precio abajo para que entre en el papel. */}
      <div className="receipt-print">
        <p className="text-center font-bold uppercase">Empapizza</p>
        <p className="text-center">{order.sucursal.name}</p>
        <hr className="my-1 border-dashed border-black" />
        <p>{new Date(order.createdAt).toLocaleString("es-AR")}</p>
        <p>
          {order.customer.firstName} {order.customer.lastName}
        </p>
        <p>{order.customer.whatsapp}</p>
        <p>
          {CHANNEL_LABELS[order.channel] ?? order.channel}
          {order.channelSource ? ` (${order.channelSource})` : ""} ·{" "}
          {METHOD_LABELS[order.method] ?? order.method}
        </p>
        {order.channel === "DELIVERY" && order.shippingAddress && (
          <p>Dirección: {order.shippingAddress}</p>
        )}
        {order.scheduledFor && <p className="font-bold">{formatScheduledLabel(order.scheduledFor, order.channel)}</p>}
        <hr className="my-1 border-dashed border-black" />
        {order.items.map((item) => (
          <div key={item.id} className="mb-1">
            <p className="font-bold">
              {item.quantity}x {itemLabel(item)}
            </p>
            <ItemDetail selections={item.selections} />
            <p className="text-right">{formatCurrency(item.unitPrice * item.quantity)}</p>
          </div>
        ))}
        <hr className="my-1 border-dashed border-black" />
        {order.channel === "DELIVERY" && order.deliveryFee != null && (
          <p className="flex justify-between">
            <span>Envío</span>
            <span>{formatCurrency(Number(order.deliveryFee))}</span>
          </p>
        )}
        <p className="flex justify-between text-sm font-bold">
          <span>TOTAL</span>
          <span>{formatCurrency(order.total)}</span>
        </p>
        {order.notes && (
          <>
            <hr className="my-1 border-dashed border-black" />
            <p className="font-bold">Obs:</p>
            <p>{order.notes}</p>
          </>
        )}
        <hr className="my-1 border-dashed border-black" />
        <p className="text-center">Comprobante interno, sin validez fiscal.</p>
      </div>
    </div>
  );
}
