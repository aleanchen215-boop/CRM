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

// Solo se muestra si hay un turno abierto — sin turno no hay nada que
// cerrar. El cierre se permite aunque el monto contado no coincida con el
// esperado (ventas en efectivo - retiros); la diferencia queda registrada
// para que el Admin la vea en Finanzas, no bloquea nada acá.
export function CerrarTurnoButton() {
  const [open, setOpen] = useState(false);
  const [monto, setMonto] = useState("");
  const utils = trpc.useUtils();
  const { data: turno } = trpc.turnos.getActive.useQuery();

  const close = trpc.turnos.close.useMutation({
    onSuccess: async (result) => {
      setOpen(false);
      setMonto("");
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
            const n = Number(monto);
            if (Number.isNaN(n) || n < 0) return;
            close.mutate({ montoContado: n });
          }}
        >
          <p className="text-sm text-muted-foreground">
            Contá el efectivo que hay en la caja ahora y poné el total. Se compara con lo que
            debería haber según la apertura y las ventas en efectivo del turno.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="monto-cierre">Efectivo contado</Label>
            <Input
              id="monto-cierre"
              type="number"
              min={0}
              step="0.01"
              autoFocus
              value={monto}
              onChange={(event) => setMonto(event.target.value)}
              disabled={close.isPending}
              required
            />
          </div>
          <Button type="submit" disabled={close.isPending || !monto}>
            {close.isPending ? "Cerrando…" : "Cerrar turno"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
