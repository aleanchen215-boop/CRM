"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TIPO_LABELS = { MANANA: "Mañana", NOCHE: "Noche" } as const;

// Paracao solo tiene turno noche (sin selector); el resto (Almafuerte)
// elige mañana o noche. El monto de apertura no se tipea — sale siempre
// del efectivo contado al cerrar el turno anterior de esa sucursal.
export function AbrirTurnoCard() {
  const [tipo, setTipo] = useState<"MANANA" | "NOCHE">("NOCHE");
  const utils = trpc.useUtils();
  const { data: me } = trpc.system.me.useQuery();
  const { data: sucursales } = trpc.sucursales.list.useQuery();
  const { data: nextAmount, isLoading: loadingAmount } = trpc.turnos.getNextOpeningAmount.useQuery();

  const misucursal = sucursales?.find((s) => s.id === me?.sucursalId);
  const needsPicker = misucursal ? misucursal.slug !== "paracao" : false;

  const open = trpc.turnos.open.useMutation({
    onSuccess: async () => {
      toast.success("Turno abierto");
      await utils.turnos.getActive.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  if (!me?.sucursalId) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Tu cuenta todavía no tiene una sucursal asignada — pedile a un administrador que te la
          asigne antes de poder abrir un turno.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Abrir turno</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Apertura de caja</p>
          <p className="text-2xl font-semibold">
            {loadingAmount ? "…" : formatCurrency(nextAmount ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground">
            Efectivo contado al cerrar el turno anterior de esta sucursal.
          </p>
        </div>

        {needsPicker && (
          <Select value={tipo} onValueChange={(v) => setTipo(v as "MANANA" | "NOCHE")}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue>{TIPO_LABELS[tipo]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MANANA">Mañana</SelectItem>
              <SelectItem value="NOCHE">Noche</SelectItem>
            </SelectContent>
          </Select>
        )}

        <Button
          className="self-start"
          disabled={open.isPending}
          onClick={() => open.mutate({ tipo: needsPicker ? tipo : "NOCHE" })}
        >
          {open.isPending ? "Abriendo…" : "Abrir turno"}
        </Button>
      </CardContent>
    </Card>
  );
}
