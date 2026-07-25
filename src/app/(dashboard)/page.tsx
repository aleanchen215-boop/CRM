"use client";

import {
  AlertTriangle,
  MessageCircle,
  PackageX,
  ShoppingCart,
  Ticket,
  UserPlus,
  Wallet,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSucursalSelection } from "@/components/layout/sucursal-context";

export default function DashboardPage() {
  const { selectedSucursalId } = useSucursalSelection();
  const { data, isLoading } = trpc.dashboard.summary.useQuery({ sucursalId: selectedSucursalId });

  const metrics = [
    {
      label: "Ventas del día",
      icon: ShoppingCart,
      value: data ? formatCurrency(data.ventasHoy.total) : undefined,
      sub: data ? `${data.ventasHoy.count} pedido${data.ventasHoy.count === 1 ? "" : "s"}` : undefined,
    },
    {
      label: "Ventas del mes",
      icon: ShoppingCart,
      value: data ? formatCurrency(data.ventasMes.total) : undefined,
      sub: data ? `${data.ventasMes.count} pedido${data.ventasMes.count === 1 ? "" : "s"}` : undefined,
    },
    {
      label: "Facturación total",
      icon: Wallet,
      value: data ? formatCurrency(data.facturacionTotal) : undefined,
      sub: "Pedidos entregados",
    },
    {
      label: "Nuevos clientes",
      icon: UserPlus,
      value: data ? String(data.nuevosClientesHoy) : undefined,
      sub: "Hoy",
    },
    {
      label: "Conversaciones abiertas",
      icon: MessageCircle,
      value: data ? String(data.conversacionesAbiertas) : undefined,
      sub: "Sin cerrar",
    },
    {
      label: "Tickets abiertos",
      icon: Ticket,
      value: data ? String(data.ticketsAbiertos) : undefined,
      sub: "Pedidos en curso",
    },
    {
      label: "Stock bajo",
      icon: AlertTriangle,
      value: data ? String(data.stockBajo) : undefined,
      sub: "Insumos cerca del mínimo",
    },
    {
      label: "Sin stock",
      icon: PackageX,
      value: data ? String(data.sinStock) : undefined,
      sub: "Insumos agotados",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Resumen general de la operación.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {metric.label}
              </CardTitle>
              <metric.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                {isLoading ? "…" : (metric.value ?? "—")}
              </div>
              <p className="text-xs text-muted-foreground">{metric.sub ?? "Sin datos todavía"}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Productos vendidos hoy</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
            {!isLoading && data?.productosVendidosHoy.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Todavía no se entregó ningún pedido hoy.
              </p>
            )}
            {data && data.productosVendidosHoy.length > 0 && (
              <ul className="flex flex-col gap-2">
                {data.productosVendidosHoy.map((item) => (
                  <li
                    key={item.name}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span>{item.name}</span>
                    <span className="font-medium">{item.quantity}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Formas de pago — hoy</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
            {!isLoading && data?.formasDePagoHoy.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Todavía no se entregó ningún pedido hoy.
              </p>
            )}
            {data && data.formasDePagoHoy.length > 0 && (
              <ul className="flex flex-col gap-2">
                {data.formasDePagoHoy.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span>
                      {item.label}{" "}
                      <span className="text-muted-foreground">
                        ({item.count} pedido{item.count === 1 ? "" : "s"})
                      </span>
                    </span>
                    <span className="font-medium">{formatCurrency(item.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
