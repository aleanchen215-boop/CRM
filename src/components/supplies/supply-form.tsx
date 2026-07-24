"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import {
  supplyInputSchema,
  supplyUpdateSchema,
  type SupplyInput,
  type SupplyUpdateInput,
} from "@/lib/validation/supply";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";

type SupplyFormProps =
  | { mode: "create"; onSuccess: (supplyId: string) => void }
  | {
      mode: "edit";
      supplyId: string;
      defaultValues: SupplyUpdateInput;
      onSuccess: () => void;
    };

export function SupplyForm(props: SupplyFormProps) {
  const utils = trpc.useUtils();
  const schema = props.mode === "create" ? supplyInputSchema : supplyUpdateSchema;

  const form = useForm<SupplyUpdateInput & { initialQuantity?: number }>({
    resolver: zodResolver(schema) as Resolver<SupplyUpdateInput & { initialQuantity?: number }>,
    defaultValues:
      props.mode === "edit"
        ? props.defaultValues
        : { name: "", unit: "", stockMinimo: 0, stockIdeal: 0, initialQuantity: 0 },
  });

  const create = trpc.supplies.create.useMutation({
    onSuccess: async (supply) => {
      await utils.supplies.list.invalidate();
      toast.success("Insumo creado");
      if (props.mode === "create") props.onSuccess(supply.id);
    },
    onError: (error) => toast.error(error.message),
  });

  const update = trpc.supplies.update.useMutation({
    onSuccess: async () => {
      if (props.mode === "edit") {
        await Promise.all([
          utils.supplies.list.invalidate(),
          utils.supplies.getById.invalidate({ id: props.supplyId }),
        ]);
      }
      toast.success("Insumo actualizado");
      if (props.mode === "edit") props.onSuccess();
    },
    onError: (error) => toast.error(error.message),
  });

  const pending = create.isPending || update.isPending;

  const onSubmit = form.handleSubmit((values) => {
    if (props.mode === "create") {
      create.mutate(values as SupplyInput);
    } else {
      update.mutate({ id: props.supplyId, ...values });
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FieldGroup className="gap-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="name">Nombre</FieldLabel>
            <Input id="name" placeholder="Harina, Muzzarella…" {...form.register("name")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="unit">Unidad (opcional)</FieldLabel>
            <Input id="unit" placeholder="kg, unidades…" {...form.register("unit")} />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {props.mode === "create" && (
            <Field>
              <FieldLabel htmlFor="initialQuantity">Cantidad inicial</FieldLabel>
              <Input id="initialQuantity" type="number" {...form.register("initialQuantity")} />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="stockMinimo">Mínimo</FieldLabel>
            <Input id="stockMinimo" type="number" {...form.register("stockMinimo")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="stockIdeal">Ideal</FieldLabel>
            <Input id="stockIdeal" type="number" {...form.register("stockIdeal")} />
          </Field>
        </div>
      </FieldGroup>

      <Button type="submit" disabled={pending} className="self-end">
        {pending ? "Guardando…" : props.mode === "create" ? "Crear insumo" : "Guardar cambios"}
      </Button>
    </form>
  );
}
