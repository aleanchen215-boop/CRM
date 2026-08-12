"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSucursalSelection } from "@/components/layout/sucursal-context";

const BUSINESS_TIMEZONE = "America/Argentina/Buenos_Aires";

// Mismo formateador que usa el backend (reports.ts) para decidir a qué día
// de negocio pertenece cada fecha — así "Hoy"/"Ayer"/etc. calzan siempre con
// el día que el servidor va a usar para filtrar, sin importar en qué huso
// horario esté el navegador.
const argDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const orderDateFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: BUSINESS_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function argTodayStr() {
  return argDayFormatter.format(new Date());
}

// Las fechas acá son siempre "YYYY-MM-DD" (un día calendario, sin hora) —
// la aritmética se hace en UTC solo para no depender del huso del navegador,
// no porque el resultado tenga nada que ver con UTC.
function parseDateStr(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
function formatDateStr(date: Date) {
  return date.toISOString().slice(0, 10);
}
function addDays(value: string, days: number) {
  const date = parseDateStr(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateStr(date);
}

type Preset = "hoy" | "ayer" | "semana" | "mes" | "anio" | "custom";

function presetRange(preset: Preset): { from: string; to: string } {
  const today = argTodayStr();
  switch (preset) {
    case "hoy":
      return { from: today, to: today };
    case "ayer": {
      const yesterday = addDays(today, -1);
      return { from: yesterday, to: yesterday };
    }
    case "semana": {
      // Lunes de la semana actual.
      const dayOfWeek = parseDateStr(today).getUTCDay();
      const offsetFromMonday = (dayOfWeek + 6) % 7;
      return { from: addDays(today, -offsetFromMonday), to: today };
    }
    case "mes":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "anio":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "custom":
      return { from: today, to: today };
  }
}

const PRESET_OPTIONS: { value: Preset; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "ayer", label: "Ayer" },
  { value: "semana", label: "Esta semana" },
  { value: "mes", label: "Este mes" },
  { value: "anio", label: "Este año" },
  { value: "custom", label: "Personalizado" },
];

export default function ReportesPage() {
  const [preset, setPreset] = useState<Preset>("mes");
  const [{ from, to }, setRange] = useState(() => presetRange("mes"));
  const { selectedSucursalId } = useSucursalSelection();

  const { data, isLoading } = trpc.reports.ventas.useQuery({ from, to, sucursalId: selectedSucursalId });

  function selectPreset(next: Preset) {
    setPreset(next);
    if (next !== "custom") {
      setRange(presetRange(next));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
        <p className="text-sm text-muted-foreground">
          Ventas entregadas: totales por día, canal y método de pago.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 py-4">
          <div className="flex flex-wrap gap-2">
            {PRESET_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={preset === option.value ? "default" : "outline"}
                onClick={() => selectPreset(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {preset === "custom" && (
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="from">Desde</Label>
                <Input
                  id="from"
                  type="date"
                  value={from}
                  max={to}
                  onChange={(e) => setRange({ from: e.target.value, to })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="to">Hasta</Label>
                <Input
                  id="to"
                  type="date"
                  value={to}
                  min={from}
                  max={argTodayStr()}
                  onChange={(e) => setRange({ from, to: e.target.value })}
                />
              </div>
            </div>
          )}

          {preset !== "custom" && (
            <p className="text-sm text-muted-foreground">
              {from === to ? from : `${from} a ${to}`}
            </p>
          )}
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Descuentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {isLoading ? "…" : formatCurrency(data?.descuentos.total ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {isLoading
                ? ""
                : `${data?.descuentos.count ?? 0} pedido${data?.descuentos.count === 1 ? "" : "s"} con descuento`}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pizzas vendidas
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="text-2xl font-semibold">
              {isLoading ? "…" : data?.pizzas.total ?? 0}
            </div>
            {data && data.pizzas.byDay.length > 0 && (
              <ul className="flex max-h-40 flex-col gap-1.5 overflow-y-auto text-sm">
                {data.pizzas.byDay.map((row) => (
                  <li key={row.date} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{row.date}</span>
                    <span className="font-medium">{row.quantity}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Empanadas vendidas
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="text-2xl font-semibold">
              {isLoading
                ? "…"
                : `${data?.empanadas.total ?? 0} (${((data?.empanadas.total ?? 0) / 12).toFixed(1)} docenas)`}
            </div>
            {data && data.empanadas.byDay.length > 0 && (
              <ul className="flex max-h-40 flex-col gap-1.5 overflow-y-auto text-sm">
                {data.empanadas.byDay.map((row) => (
                  <li key={row.date} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{row.date}</span>
                    <span className="font-medium">{row.quantity}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Top 5 pizzas más vendidas</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
            {!isLoading && data?.pizzas.top5.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin ventas en el período.</p>
            )}
            {data && data.pizzas.top5.length > 0 && (
              <ol className="flex flex-col gap-2">
                {data.pizzas.top5.map((row, index) => (
                  <li key={row.name} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      <span className="text-muted-foreground">{index + 1}.</span> {row.name}
                    </span>
                    <span className="font-medium">{row.quantity}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Top 5 empanadas más vendidas</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
            {!isLoading && data?.empanadas.top5.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin ventas en el período.</p>
            )}
            {data && data.empanadas.top5.length > 0 && (
              <ol className="flex flex-col gap-2">
                {data.empanadas.top5.map((row, index) => (
                  <li key={row.name} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      <span className="text-muted-foreground">{index + 1}.</span> {row.name}
                    </span>
                    <span className="font-medium">{row.quantity}</span>
                  </li>
                ))}
              </ol>
            )}
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

      <Dialog>
        <DialogTrigger
          render={
            <Button type="button" variant="outline" disabled={!data || data.pedidos.length === 0} />
          }
        >
          Ver todos los pedidos del período
          {data ? ` (${data.pedidos.length})` : ""}
        </DialogTrigger>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Pedidos del período {from === to ? from : `${from} a ${to}`}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Método de pago</TableHead>
                  <TableHead>Productos</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.pedidos.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="whitespace-nowrap">
                      {orderDateFormatter.format(new Date(order.createdAt))}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{order.customerName}</TableCell>
                    <TableCell className="whitespace-nowrap">{order.channel}</TableCell>
                    <TableCell className="whitespace-nowrap">{order.method}</TableCell>
                    <TableCell className="max-w-xs min-w-48 whitespace-normal">
                      {order.itemsSummary}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {formatCurrency(order.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
