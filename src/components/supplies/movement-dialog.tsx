"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { ArrowLeftRight } from "lucide-react";
import {
  movementTypeValues,
  supplyMovementInputSchema,
  type SupplyMovementInput,
} from "@/lib/validation/supply";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const TYPE_LABELS: Record<(typeof movementTypeValues)[number], string> = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  AJUSTE: "Ajuste (fija la cantidad total)",
};

// La salida se registra sola cuando un pedido consume el insumo — acá solo
// se carga entrada (compras) o ajuste (correcciones de conteo).
const MANUAL_TYPE_VALUES = movementTypeValues.filter((type) => type !== "SALIDA");

export function MovementDialog({ supplyId }: { supplyId: string }) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const form = useForm<SupplyMovementInput>({
    resolver: zodResolver(supplyMovementInputSchema) as Resolver<SupplyMovementInput>,
    defaultValues: { supplyId, type: "ENTRADA", quantity: 1, reason: "" },
  });

  const addMovement = trpc.supplies.addMovement.useMutation({
    onSuccess: async () => {
      await utils.supplies.getById.invalidate({ id: supplyId });
      await utils.supplies.list.invalidate();
      toast.success("Movimiento registrado");
      setOpen(false);
      form.reset({ supplyId, type: "ENTRADA", quantity: 1, reason: "" });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <ArrowLeftRight />
        Registrar movimiento
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar movimiento</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((values) => addMovement.mutate(values))}
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="type">Tipo</FieldLabel>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="type" className="w-full">
                      <SelectValue>
                        {(value: (typeof movementTypeValues)[number]) => TYPE_LABELS[value]}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {MANUAL_TYPE_VALUES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="quantity">Cantidad</FieldLabel>
              <Input id="quantity" type="number" min={1} {...form.register("quantity")} />
              <FieldError errors={[form.formState.errors.quantity]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="reason">Motivo (opcional)</FieldLabel>
              <Input id="reason" {...form.register("reason")} />
            </Field>
          </FieldGroup>
          <Button type="submit" disabled={addMovement.isPending} className="self-end">
            {addMovement.isPending ? "Guardando…" : "Registrar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
