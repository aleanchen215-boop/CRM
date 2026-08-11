"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Minus, Bike } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const TIPO_LABELS: Record<string, string> = { MANANA: "Mañana", NOCHE: "Noche" };

export function TurnoActivoCard({
  turno,
}: {
  turno: {
    id: string;
    tipo: string;
    montoApertura: number;
    abiertoEn: string | Date;
    employee: { name: string };
  };
}) {
  const [retiroOpen, setRetiroOpen] = useState(false);
  const [monto, setMonto] = useState("");
  const [pagoCadeteOpen, setPagoCadeteOpen] = useState(false);
  const [montoCadete, setMontoCadete] = useState("");
  const utils = trpc.useUtils();

  const createRetiro = trpc.turnos.createRetiro.useMutation({
    onSuccess: async () => {
      toast.success("Retiro registrado");
      setMonto("");
      setRetiroOpen(false);
      await utils.turnos.getActive.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const createPagoCadete = trpc.turnos.createPagoCadete.useMutation({
    onSuccess: async () => {
      toast.success("Pago a cadete registrado");
      setMontoCadete("");
      setPagoCadeteOpen(false);
      await utils.turnos.getActive.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base font-medium">Turno abierto</CardTitle>
        <Badge>{TIPO_LABELS[turno.tipo] ?? turno.tipo}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Apertura</p>
            <p className="font-medium">{formatCurrency(turno.montoApertura)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Desde</p>
            <p className="font-medium">{new Date(turno.abiertoEn).toLocaleString("es-AR")}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Abierto por</p>
            <p className="font-medium">{turno.employee.name}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Dialog open={retiroOpen} onOpenChange={setRetiroOpen}>
            <DialogTrigger render={<Button variant="outline" className="self-start" />}>
              <Minus />
              Realizar retiro a caja fuerte
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Retiro a caja fuerte</DialogTitle>
              </DialogHeader>
              <form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const n = Number(monto);
                  if (!n || n <= 0) return;
                  createRetiro.mutate({ monto: n });
                }}
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="monto-retiro">Monto retirado</Label>
                  <Input
                    id="monto-retiro"
                    type="number"
                    min={0.01}
                    step="0.01"
                    autoFocus
                    value={monto}
                    onChange={(event) => setMonto(event.target.value)}
                    disabled={createRetiro.isPending}
                    required
                  />
                </div>
                <Button type="submit" disabled={createRetiro.isPending || !monto}>
                  {createRetiro.isPending ? "Guardando…" : "Registrar retiro"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={pagoCadeteOpen} onOpenChange={setPagoCadeteOpen}>
            <DialogTrigger render={<Button variant="outline" className="self-start" />}>
              <Bike />
              Pago cadete
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Pago cadete</DialogTitle>
              </DialogHeader>
              <form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const n = Number(montoCadete);
                  if (!n || n <= 0) return;
                  createPagoCadete.mutate({ monto: n });
                }}
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="monto-cadete">Monto pagado</Label>
                  <Input
                    id="monto-cadete"
                    type="number"
                    min={0.01}
                    step="0.01"
                    autoFocus
                    value={montoCadete}
                    onChange={(event) => setMontoCadete(event.target.value)}
                    disabled={createPagoCadete.isPending}
                    required
                  />
                </div>
                <Button type="submit" disabled={createPagoCadete.isPending || !montoCadete}>
                  {createPagoCadete.isPending ? "Guardando…" : "Registrar pago"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
