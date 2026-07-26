"use client";

import { useState } from "react";
import { toast } from "sonner";
import { DoorClosed } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Billetes en circulación — el total contado sale de sumar cantidad ×
// denominación de cada uno, no se tipea a mano.
const DENOMINATIONS = [10, 20, 50, 100, 200, 500, 1000, 2000, 10000] as const;

// Solo se muestra si hay un turno abierto — sin turno no hay nada que
// cerrar. El cierre se permite aunque el monto contado no coincida con el
// esperado (ventas en efectivo - retiros); la diferencia queda registrada
// para que el Admin la vea en Finanzas, no bloquea nada acá.
export function CerrarTurnoButton() {
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const utils = trpc.useUtils();
  const { data: turno } = trpc.turnos.getActive.useQuery();

  const total = DENOMINATIONS.reduce(
    (sum, denom) => sum + (Number(counts[denom]) || 0) * denom,
    0,
  );

  const close = trpc.turnos.close.useMutation({
    onSuccess: async (result) => {
      setOpen(false);
      setCounts({});
      await utils.turnos.getActive.invalidate();
      if (result.diferencia === 0) {
        toast.success("Turno cerrado — el efectivo coincidió.");
      } else {
        const signo = result.diferencia > 0 ? "sobran" : "faltan";
        toast.warning(
          `Turno cerrado con diferencia: ${signo} ${formatCurrency(Math.abs(result.diferencia))}.`,
        );
      }
    },
    onError: (error) => toast.error(error.message),
  });

  if (!turno) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<SidebarMenuButton tooltip="Cerrar turno" />}>
        <DoorClosed />
        <span>Cerrar turno</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cerrar turno</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (total <= 0) return;
            close.mutate({ montoContado: total });
          }}
        >
          <p className="text-sm text-muted-foreground">
            Contá la caja por billete — se suma solo. Se compara con lo que debería haber según
            la apertura y las ventas en efectivo del turno.
          </p>

          <div className="flex flex-col gap-2">
            {DENOMINATIONS.map((denom) => (
              <div key={denom} className="flex items-center gap-3">
                <Label htmlFor={`denom-${denom}`} className="w-20 shrink-0">
                  {formatCurrency(denom)}
                </Label>
                <Input
                  id={`denom-${denom}`}
                  type="number"
                  min={0}
                  step={1}
                  placeholder="0"
                  value={counts[denom] ?? ""}
                  onChange={(event) =>
                    setCounts((prev) => ({ ...prev, [denom]: event.target.value }))
                  }
                  disabled={close.isPending}
                  className="w-20"
                />
                <span className="w-24 shrink-0 text-right text-sm text-muted-foreground">
                  {formatCurrency((Number(counts[denom]) || 0) * denom)}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Total contado</span>
            <span className="font-semibold">{formatCurrency(total)}</span>
          </div>

          <Button type="submit" disabled={close.isPending || total <= 0}>
            {close.isPending ? "Cerrando…" : "Cerrar turno"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
