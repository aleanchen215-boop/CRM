"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSucursalSelection } from "@/components/layout/sucursal-context";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoStr(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function ReportesPage() {
  const [from, setFrom] = useState(daysAgoStr(29));
  const [to, setTo] = useState(todayStr());
  const { selectedSucursalId } = useSucursalSelection();

  const { data, isLoading } = trpc.reports.ventas.useQuery({ from, to, sucursalId: selectedSucursalId });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
        <p className="text-sm text-muted-foreground">
          Ventas entregadas: totales por día, canal y método de pago.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 py-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="from">Desde</Label>
            <Input
              id="from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="to">Hasta</Label>
            <Input
              id="to"
              type="date"
              value={to}
              min={from}
              max={todayStr()}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total del período
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {isLoading ? "…" : formatCurrency(data?.total ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {isLoading ? "" : `${data?.count ?? 0} pedido${data?.count === 1 ? "" : "s"}`}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Por día</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
            {!isLoading && data?.byDay.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin ventas en el período.</p>
            )}
            {data && data.byDay.length > 0 && (
              <ul className="flex flex-col gap-2">
                {data.byDay.map((row) => (
                  <li key={row.date} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">{row.date}</span>
                    <span className="font-medium">{formatCurrency(row.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Por canal</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
            {!isLoading && data?.byChannel.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin ventas en el período.</p>
            )}
            {data && data.byChannel.length > 0 && (
              <ul className="flex flex-col gap-2">
                {data.byChannel.map((row) => (
                  <li
                    key={row.channel}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span>
                      {row.channel}{" "}
                      <span className="text-muted-foreground">
                        ({row.count} pedido{row.count === 1 ? "" : "s"})
                      </span>
                    </span>
                    <span className="font-medium">{formatCurrency(row.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Por método de pago</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
            {!isLoading && data?.byMethod.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin ventas en el período.</p>
            )}
            {data && data.byMethod.length > 0 && (
              <ul className="flex flex-col gap-2">
                {data.byMethod.map((row) => (
                  <li key={row.method} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {row.method}{" "}
                      <span className="text-muted-foreground">
                        ({row.count} pedido{row.count === 1 ? "" : "s"})
                      </span>
                    </span>
                    <span className="font-medium">{formatCurrency(row.total)}</span>
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
