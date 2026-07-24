"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useFieldArray, useForm, useWatch, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  appsSourceSuggestions,
  orderInputSchema,
  paymentMethodValues,
  salesChannelValues,
  type OrderInput,
} from "@/lib/validation/order";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency } from "@/lib/format";
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

const METHOD_LABELS: Record<(typeof paymentMethodValues)[number], string> = {
  MERCADO_PAGO: "Mercado Pago",
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  OTRO: "Otro",
};

const CHANNEL_LABELS: Record<(typeof salesChannelValues)[number], string> = {
  MOSTRADOR: "Mostrador",
  DELIVERY: "Delivery",
  APPS: "Apps",
};

export function OrderForm({ onSuccess }: { onSuccess: (orderId: string) => void }) {
  const utils = trpc.useUtils();
  const { data: customers } = trpc.customers.list.useQuery({});
  const { data: products } = trpc.products.list.useQuery({});

  const form = useForm<OrderInput>({
    resolver: zodResolver(orderInputSchema) as Resolver<OrderInput>,
    defaultValues: {
      customerId: "",
      method: "EFECTIVO",
      channel: "MOSTRADOR",
      channelSource: "",
      items: [{ productId: "", quantity: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const items = useWatch({ control: form.control, name: "items" });
  const channel = useWatch({ control: form.control, name: "channel" });

  const total = items.reduce((sum, item) => {
    const product = products?.find((p) => p.id === item.productId);
    return sum + (product ? product.price * (item.quantity || 0) : 0);
  }, 0);

  const create = trpc.orders.create.useMutation({
    onSuccess: async (order) => {
      await Promise.all([utils.orders.list.invalidate(), utils.products.list.invalidate()]);
      toast.success("Pedido creado");
      onSuccess(order.id);
    },
    onError: (error) => toast.error(error.message),
  });

  const onSubmit = form.handleSubmit((values) => create.mutate(values));

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FieldGroup className="gap-3.5">
        <Field>
          <FieldLabel htmlFor="customerId">Cliente</FieldLabel>
          <Controller
            control={form.control}
            name="customerId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="customerId" className="w-full">
                  <SelectValue placeholder="Elegir cliente…" />
                </SelectTrigger>
                <SelectContent>
                  {customers?.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.firstName} {customer.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError errors={[form.formState.errors.customerId]} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="method">Método de pago</FieldLabel>
            <Controller
              control={form.control}
              name="method"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="method" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethodValues.map((method) => (
                      <SelectItem key={method} value={method}>
                        {METHOD_LABELS[method]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="channel">Canal</FieldLabel>
            <Controller
              control={form.control}
              name="channel"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="channel" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {salesChannelValues.map((channel) => (
                      <SelectItem key={channel} value={channel}>
                        {CHANNEL_LABELS[channel]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>

        {channel === "APPS" && (
          <Field>
            <FieldLabel htmlFor="channelSource">Plataforma</FieldLabel>
            <Input
              id="channelSource"
              list="apps-source-suggestions"
              placeholder="PedidosYa, Rappi…"
              {...form.register("channelSource")}
            />
            <datalist id="apps-source-suggestions">
              {appsSourceSuggestions.map((source) => (
                <option key={source} value={source} />
              ))}
            </datalist>
          </Field>
        )}

        <Field>
          <FieldLabel>Productos</FieldLabel>
          <div className="flex flex-col gap-2">
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-start gap-2">
                <Controller
                  control={form.control}
                  name={`items.${index}.productId`}
                  render={({ field: selectField }) => (
                    <Select value={selectField.value} onValueChange={selectField.onChange}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Producto…" />
                      </SelectTrigger>
                      <SelectContent>
                        {products?.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name} ({formatCurrency(product.price)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <Input
                  type="number"
                  min={1}
                  className="w-20"
                  {...form.register(`items.${index}.quantity`)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={fields.length === 1}
                  onClick={() => remove(index)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          <FieldError errors={[form.formState.errors.items?.root, form.formState.errors.items]} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => append({ productId: "", quantity: 1 })}
          >
            <Plus />
            Agregar producto
          </Button>
        </Field>

        <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="font-medium">{formatCurrency(total)}</span>
        </div>
      </FieldGroup>

      <Button type="submit" disabled={create.isPending} className="self-end">
        {create.isPending ? "Creando…" : "Crear pedido"}
      </Button>
    </form>
  );
}
