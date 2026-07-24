"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import {
  customerInputSchema,
  customerStatusValues,
  customerUpdateSchema,
  type CustomerInput,
  type CustomerUpdateInput,
} from "@/lib/validation/customer";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CustomerFormProps =
  | {
      mode: "create";
      onSuccess: (customerId: string) => void;
    }
  | {
      mode: "edit";
      customerId: string;
      defaultValues: CustomerUpdateInput;
      onSuccess: () => void;
    };

const STATUS_LABELS: Record<(typeof customerStatusValues)[number], string> = {
  ACTIVO: "Activo",
  INACTIVO: "Inactivo",
  PERDIDO: "Perdido",
};

export function CustomerForm(props: CustomerFormProps) {
  const utils = trpc.useUtils();
  const schema = props.mode === "create" ? customerInputSchema : customerUpdateSchema;

  const form = useForm<CustomerUpdateInput>({
    resolver: zodResolver(schema) as Resolver<CustomerUpdateInput>,
    defaultValues:
      props.mode === "edit"
        ? props.defaultValues
        : {
            firstName: "",
            lastName: "",
            whatsapp: "",
            email: "",
            address: "",
            city: "",
            province: "",
            country: "",
            origin: "",
            notes: "",
          },
  });

  const create = trpc.customers.create.useMutation({
    onSuccess: async (customer) => {
      await utils.customers.list.invalidate();
      toast.success("Cliente creado");
      if (props.mode === "create") props.onSuccess(customer.id);
    },
    onError: (error) => toast.error(error.message),
  });

  const update = trpc.customers.update.useMutation({
    onSuccess: async () => {
      if (props.mode === "edit") {
        await Promise.all([
          utils.customers.list.invalidate(),
          utils.customers.getById.invalidate({ id: props.customerId }),
        ]);
      }
      toast.success("Cliente actualizado");
      if (props.mode === "edit") props.onSuccess();
    },
    onError: (error) => toast.error(error.message),
  });

  const pending = create.isPending || update.isPending;

  const onSubmit = form.handleSubmit((values) => {
    if (props.mode === "create") {
      // zodResolver ya validó los campos requeridos de customerInputSchema en este modo.
      create.mutate(values as CustomerInput);
    } else {
      update.mutate({ id: props.customerId, ...values });
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FieldGroup className="gap-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="firstName">Nombre</FieldLabel>
            <Input id="firstName" {...form.register("firstName")} />
            <FieldError errors={[form.formState.errors.firstName]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="lastName">Apellido</FieldLabel>
            <Input id="lastName" {...form.register("lastName")} />
            <FieldError errors={[form.formState.errors.lastName]} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="whatsapp">WhatsApp</FieldLabel>
            <Input id="whatsapp" placeholder="+54 9 11 ..." {...form.register("whatsapp")} />
            <FieldError errors={[form.formState.errors.whatsapp]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" type="email" {...form.register("email")} />
            <FieldError errors={[form.formState.errors.email]} />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="address">Dirección</FieldLabel>
          <Input id="address" {...form.register("address")} />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field>
            <FieldLabel htmlFor="city">Ciudad</FieldLabel>
            <Input id="city" {...form.register("city")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="province">Provincia</FieldLabel>
            <Input id="province" {...form.register("province")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="country">País</FieldLabel>
            <Input id="country" {...form.register("country")} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="origin">Origen</FieldLabel>
            <Input id="origin" placeholder="WhatsApp, referido, etc." {...form.register("origin")} />
          </Field>
          {props.mode === "edit" && (
            <Field>
              <FieldLabel htmlFor="status">Estado</FieldLabel>
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="status" className="w-full">
                      <SelectValue placeholder="Estado">
                        {(value: (typeof customerStatusValues)[number]) => STATUS_LABELS[value]}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {customerStatusValues.map((status) => (
                        <SelectItem key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          )}
        </div>

        <Field>
          <FieldLabel htmlFor="notes">Notas internas</FieldLabel>
          <Textarea id="notes" rows={3} {...form.register("notes")} />
        </Field>
      </FieldGroup>

      <Button type="submit" disabled={pending} className="self-end">
        {pending ? "Guardando…" : props.mode === "create" ? "Crear cliente" : "Guardar cambios"}
      </Button>
    </form>
  );
}
