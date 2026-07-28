"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Trash2, X } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function WasteRowControl({
  supplyId,
  currentQuantity,
}: {
  supplyId: string;
  currentQuantity: number;
}) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();

  const registerWaste = trpc.supplies.registerWaste.useMutation({
    onSuccess: async () => {
      toast.success("Desperdicio registrado");
      setQuantity("");
      setReason("");
      setOpen(false);
      await utils.supplies.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={currentQuantity <= 0}
        onClick={() => setOpen(true)}
      >
        <Trash2 />
        Registrar
      </Button>
    );
  }

  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const n = Number(quantity);
        if (!n || n <= 0) return;
        registerWaste.mutate({ supplyId, quantity: n, reason: reason.trim() || undefined });
      }}
    >
      <Input
        type="number"
        min={1}
        max={currentQuantity}
        autoFocus
        placeholder="Cant."
        className="h-7 w-16"
        value={quantity}
        onChange={(event) => setQuantity(event.target.value)}
        disabled={registerWaste.isPending}
      />
      <Input
        placeholder="Motivo (opcional)"
        className="h-7 w-36"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        disabled={registerWaste.isPending}
      />
      <Button type="submit" size="icon-sm" disabled={registerWaste.isPending || !quantity}>
        <Check />
        <span className="sr-only">Confirmar</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={registerWaste.isPending}
        onClick={() => {
          setOpen(false);
          setQuantity("");
          setReason("");
        }}
      >
        <X />
        <span className="sr-only">Cancelar</span>
      </Button>
    </form>
  );
}

// Lista los mismos insumos que Stock (misma fuente, supplies.list) para que
// el vendedor registre acá lo que se tira/rompe/vence — descuenta stock de
// verdad (SupplyMovement SALIDA, motivo "Desperdicio") en vez de tener que
// disfrazarlo de venta o consumo interno solo para que el conteo cierre.
export function WasteSupplies({ sucursalId }: { sucursalId: string }) {
  const { data: supplies, isLoading } = trpc.supplies.list.useQuery({ sucursalId });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Desperdicios</CardTitle>
        <p className="text-sm text-muted-foreground">
          Si hay que tirar algo (se venció, se rompió, salió mal), registralo acá — no lo cargues
          como venta ni como consumo interno.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Insumo</TableHead>
              <TableHead>Disponible</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && supplies?.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                  Todavía no hay insumos cargados.
                </TableCell>
              </TableRow>
            )}
            {supplies?.map((supply) => (
              <TableRow key={supply.id}>
                <TableCell className="font-medium">{supply.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {supply.quantity}
                  {supply.unit ? ` ${supply.unit}` : ""}
                </TableCell>
                <TableCell>
                  <WasteRowControl supplyId={supply.id} currentQuantity={supply.quantity} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
