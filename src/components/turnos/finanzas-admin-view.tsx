"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TIPO_LABELS: Record<string, string> = { MANANA: "Mañana", NOCHE: "Noche" };
const ALL_VALUE = "__todas__";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoStr(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// Vista de auditoría para Admin: cierres de turno de las dos sucursales
// (con la diferencia contado vs. esperado bien visible) y los retiros a
// caja fuerte, por fecha.
export function FinanzasAdminView() {
  const [from, setFrom] = useState(daysAgoStr(29));
  const [to, setTo] = useState(todayStr());
  const [sucursalId, setSucursalId] = useState<string | undefined>(undefined);

  const { data: sucursales } = trpc.sucursales.list.useQuery();
  const { data: turnos, isLoading: loadingTurnos } = trpc.turnos.listClosedTurnos.useQuery({
    from,
    to,
    sucursalId,
  });
  const { data: retiros, isLoading: loadingRetiros } = trpc.turnos.listRetiros.useQuery({
    from,
    to,
    sucursalId,
  });

  const mismatches = turnos?.filter((t) => t.diferencia !== 0) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 py-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="from">Desde</Label>
            <Input id="from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sucursal">Sucursal</Label>
            <Select
              value={sucursalId ?? ALL_VALUE}
              onValueChange={(v) => setSucursalId(!v || v === ALL_VALUE ? undefined : v)}
            >
              <SelectTrigger id="sucursal" className="w-44">
                <SelectValue>
                  {sucursales?.find((s) => s.id === sucursalId)?.name ?? "Todas"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>Todas</SelectItem>
                {sucursales?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {mismatches.length > 0 && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-2 py-4 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            {mismatches.length} cierre{mismatches.length === 1 ? "" : "s"} de turno con diferencia
            entre el efectivo contado y el esperado en este período.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Cierres de turno</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Sucursal</TableHead>
                <TableHead>Turno</TableHead>
                <TableHead>Abrió</TableHead>
                <TableHead>Cerró</TableHead>
                <TableHead>Apertura</TableHead>
                <TableHead>Esperado</TableHead>
                <TableHead>Contado</TableHead>
                <TableHead>Diferencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingTurnos && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
                    Cargando…
                  </TableCell>
                </TableRow>
              )}
              {!loadingTurnos && turnos?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
                    Sin cierres de turno en el período.
                  </TableCell>
                </TableRow>
              )}
              {turnos?.map((turno) => (
                <TableRow key={turno.id}>
                  <TableCell className="text-muted-foreground">
                    {turno.cerradoEn ? new Date(turno.cerradoEn).toLocaleString("es-AR") : "—"}
                  </TableCell>
                  <TableCell>{turno.sucursal.name}</TableCell>
                  <TableCell>{TIPO_LABELS[turno.tipo] ?? turno.tipo}</TableCell>
                  <TableCell className="text-muted-foreground">{turno.employee.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {turno.cerradoPor?.name ?? "—"}
                  </TableCell>
                  <TableCell>{formatCurrency(turno.montoApertura)}</TableCell>
                  <TableCell>{formatCurrency(turno.montoCierreEsperado ?? 0)}</TableCell>
                  <TableCell>{formatCurrency(turno.montoCierreContado ?? 0)}</TableCell>
                  <TableCell>
                    {turno.diferencia === 0 ? (
                      <Badge variant="secondary">Coincide</Badge>
                    ) : (
                      <Badge variant="destructive">
                        {(turno.diferencia ?? 0) > 0 ? "Sobran " : "Faltan "}
                        {formatCurrency(Math.abs(turno.diferencia ?? 0))}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Retiros a caja fuerte</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Sucursal</TableHead>
                <TableHead>Empleado</TableHead>
                <TableHead>Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingRetiros && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    Cargando…
                  </TableCell>
                </TableRow>
              )}
              {!loadingRetiros && retiros?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    Sin retiros en el período.
                  </TableCell>
                </TableRow>
              )}
              {retiros?.map((retiro) => (
                <TableRow key={retiro.id}>
                  <TableCell className="text-muted-foreground">
                    {new Date(retiro.createdAt).toLocaleString("es-AR")}
                  </TableCell>
                  <TableCell>{retiro.sucursal.name}</TableCell>
                  <TableCell className="text-muted-foreground">{retiro.employee.name}</TableCell>
                  <TableCell>{formatCurrency(retiro.monto)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
