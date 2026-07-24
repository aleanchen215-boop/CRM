"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { ArrowLeftRight } from "lucide-react";
import {
  movementTypeValues,
  stockMovementInputSchema,
  type StockMovementInput,
} from "@/lib/validation/product";
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
  AJUSTE: "Ajuste (fija el stock total)",
};

export function MovementDialog({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const form = useForm<StockMovementInput>({
    resolver: zodResolver(stockMovementInputSchema) as Resolver<StockMovementInput>,
    defaultValues: { productId, type: "ENTRADA", quantity: 1, reason: "" },
  });

  const addMovement = trpc.products.addMovement.useMutation({
    onSuccess: async () => {
      await utils.products.getById.invalidate({ id: productId });
      await utils.products.list.invalidate();
      toast.success("Movimiento registrado");
      setOpen(false);
      form.reset({ productId, type: "ENTRADA", quantity: 1, reason: "" });
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
          <DialogTitle>Registrar movimiento de stock</DialogTitle>
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
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {movementTypeValues.map((type) => (
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
