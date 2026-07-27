"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

// Observación INTERNA del pedido (ej. "cliente canceló por demora", una
// hora de retiro anotada a mano) — a diferencia de las observaciones de
// preparación, esto nunca se imprime en la comanda y no tiene que ver con
// los productos. Pensado sobre todo para Cajero, que no puede cancelar
// ventas: acá deja constancia de qué pasó en vez de borrar nada.
export function StaffNotesCard({ orderId, staffNotes }: { orderId: string; staffNotes: string | null }) {
  const [draft, setDraft] = useState(staffNotes ?? "");
  // Si `staffNotes` cambia por fuera (otra pestaña, u otro empleado guardó
  // algo distinto) mientras no se estaba editando, se refleja acá — mismo
  // patrón que QuantityInput para "resetear estado cuando cambia una prop"
  // sin useEffect.
  const [prevStaffNotes, setPrevStaffNotes] = useState(staffNotes);
  if (staffNotes !== prevStaffNotes && draft === (prevStaffNotes ?? "")) {
    setPrevStaffNotes(staffNotes);
    setDraft(staffNotes ?? "");
  } else if (staffNotes !== prevStaffNotes) {
    setPrevStaffNotes(staffNotes);
  }
  const utils = trpc.useUtils();

  const update = trpc.orders.updateStaffNotes.useMutation({
    onSuccess: async () => {
      toast.success("Observación guardada");
      await Promise.all([
        utils.orders.getById.invalidate({ id: orderId }),
        utils.orders.list.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  const dirty = draft !== (staffNotes ?? "");

  return (
    <Card className="print:hidden">
      <CardHeader>
        <CardTitle className="text-base font-medium">Observaciones internas</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          No se imprime ni tiene que ver con los productos — para dejar constancia de cosas como
          &quot;cliente canceló por demora&quot; o una hora de retiro anotada a mano.
        </p>
        <div className="flex items-start gap-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Escribir una observación…"
            rows={2}
            className="flex-1"
          />
          <Button
            type="button"
            size="icon"
            variant={dirty ? "default" : "outline"}
            disabled={!dirty || update.isPending}
            onClick={() => update.mutate({ id: orderId, staffNotes: draft })}
          >
            <Check />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
