"use client";

import { useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ArrowLeft, Plus, UserPlus } from "lucide-react";
import { paymentMethodValues, salesChannelValues, type OrderInput } from "@/lib/validation/order";
import type { OrderFormValues } from "@/components/orders/order-form-types";
import { trpc } from "@/lib/trpc/client";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { OrderItemRow } from "@/components/orders/order-item-row";

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

function emptyRow(): OrderFormValues["items"][number] {
  return { rowType: "PIZZA", productId: "", quantity: 1, promotionId: "", variableSelections: [] };
}

// Valida a mano (no con zodResolver): la forma de cada renglón en el form
// es más simple que la unión discriminada que espera la API, así que acá
// se chequea lo mínimo y se transforma recién al enviar.
function validateRows(rows: OrderFormValues["items"]): string | null {
  for (const row of rows) {
    if (row.rowType === "PROMOCION") {
      if (!row.promotionId) return "Elegí una promoción en todos los renglones.";
      for (const selection of row.variableSelections) {
        if (selection.productIds.some((id) => !id)) {
          return "Completá todos los sabores a elección antes de crear el pedido.";
        }
      }
    } else if (!row.productId) {
      return "Elegí un producto en todos los renglones.";
    }
  }
  return null;
}

function toApiItems(rows: OrderFormValues["items"]): OrderInput["items"] {
  return rows.map((row) =>
    row.rowType === "PROMOCION"
      ? { kind: "PROMOCION" as const, promotionId: row.promotionId, variableSelections: row.variableSelections }
      : { kind: "PRODUCTO" as const, productId: row.productId, quantity: row.quantity },
  );
}

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
  const { data: promotions } = trpc.promotions.list.useQuery();
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);

  const form = useForm<OrderFormValues>({
    defaultValues: {
      customerId: "",
      method: "EFECTIVO",
      items: [emptyRow()],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const watchedItems = useWatch({ control: form.control, name: "items" });

  const total = (watchedItems ?? []).reduce((sum, row) => {
    if (row.rowType === "PROMOCION") {
      const promo = promotions?.find((p) => p.id === row.promotionId);
      return sum + (promo?.price ?? 0);
    }
    const product = products?.find((p) => p.id === row.productId);
    return sum + (product ? product.price * (row.quantity || 0) : 0);
  }, 0);

  const create = trpc.orders.create.useMutation({
    onSuccess: async (order) => {
      await utils.orders.list.invalidate();
      toast.success("Pedido creado");
      onSuccess(order.id);
    },
    onError: (error) => toast.error(error.message),
  });

  const onSubmit = form.handleSubmit((values) => {
    if (!values.customerId) {
      toast.error("Elegí un cliente.");
      return;
    }
    const error = validateRows(values.items);
    if (error) {
      toast.error(error);
      return;
    }
    create.mutate({
      customerId: values.customerId,
      method: values.method,
      channel,
      channelSource,
      items: toApiItems(values.items),
    });
  });

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
                <OrderItemRow
                  key={field.id}
                  index={index}
                  control={form.control}
                  onRemove={() => remove(index)}
                  canRemove={fields.length > 1}
                />
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => append(emptyRow())}
            >
              <Plus />
              Agregar renglón
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
