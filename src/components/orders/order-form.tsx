"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useFieldArray, useForm, useWatch, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, UserPlus } from "lucide-react";
import {
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
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CustomerForm } from "@/components/customers/customer-form";

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

const NEW_CUSTOMER_VALUE = "__new__";

export function OrderForm({
  channel,
  channelSource,
  onBack,
  onSuccess,
}: {
  channel: (typeof salesChannelValues)[number];
  channelSource?: string;
  onBack: () => void;
  onSuccess: (orderId: string) => void;
}) {
  const utils = trpc.useUtils();
  const { data: customers } = trpc.customers.list.useQuery({});
  const { data: products } = trpc.products.list.useQuery({});
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);

  const form = useForm<OrderInput>({
    resolver: zodResolver(orderInputSchema) as Resolver<OrderInput>,
    defaultValues: {
      customerId: "",
      method: "EFECTIVO",
      channel,
      channelSource,
      items: [{ productId: "", quantity: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const items = useWatch({ control: form.control, name: "items" });

  const total = items.reduce((sum, item) => {
    const product = products?.find((p) => p.id === item.productId);
    return sum + (product ? product.price * (item.quantity || 0) : 0);
  }, 0);

  const create = trpc.orders.create.useMutation({
    onSuccess: async (order) => {
      await utils.orders.list.invalidate();
      toast.success("Pedido creado");
      onSuccess(order.id);
    },
    onError: (error) => toast.error(error.message),
  });

  const onSubmit = form.handleSubmit((values) => create.mutate(values));

  return (
    <>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft />
          Cambiar canal
        </Button>
        <span>·</span>
        <span className="font-medium text-foreground">
          {CHANNEL_LABELS[channel]}
          {channelSource ? ` (${channelSource})` : ""}
        </span>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FieldGroup className="gap-3.5">
          <Field>
            <FieldLabel htmlFor="customerId">Cliente</FieldLabel>
            <Controller
              control={form.control}
              name="customerId"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    if (value === NEW_CUSTOMER_VALUE) {
                      setNewCustomerOpen(true);
                      return;
                    }
                    field.onChange(value);
                  }}
                >
                  <SelectTrigger id="customerId" className="w-full">
                    <SelectValue placeholder="Elegir cliente…">
                      {(id: string) => {
                        const customer = customers?.find((c) => c.id === id);
                        return customer ? `${customer.firstName} ${customer.lastName}` : id;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NEW_CUSTOMER_VALUE}>
                      <UserPlus className="size-4" />
                      Nuevo cliente…
                    </SelectItem>
                    <SelectSeparator />
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

          <Field>
            <FieldLabel htmlFor="method">Método de pago</FieldLabel>
            <Controller
              control={form.control}
              name="method"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="method" className="w-full">
                    <SelectValue>
                      {(value: (typeof paymentMethodValues)[number]) => METHOD_LABELS[value]}
                    </SelectValue>
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
                          <SelectValue placeholder="Producto…">
                            {(id: string) => {
                              const product = products?.find((p) => p.id === id);
                              return product
                                ? `${product.name} (${formatCurrency(product.price)})`
                                : id;
                            }}
                          </SelectValue>
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

      <Dialog open={newCustomerOpen} onOpenChange={setNewCustomerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo cliente</DialogTitle>
          </DialogHeader>
          <CustomerForm
            mode="create"
            onSuccess={async (customerId) => {
              await utils.customers.list.invalidate();
              form.setValue("customerId", customerId);
              setNewCustomerOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
