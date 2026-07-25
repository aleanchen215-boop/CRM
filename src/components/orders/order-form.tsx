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
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
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

// 0.5 = media pizza. Dos renglones de 0.5 se combinan en una mitad y mitad
// (dos sabores); si queda uno solo sin pareja, es media pizza de ese sabor
// sola. Solo tiene sentido para pizzas, no empanadas.
function isHalfPizzaRow(row: OrderFormValues["items"][number]): boolean {
  return row.rowType === "PIZZA" && row.quantity === 0.5;
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
      continue;
    }
    if (!row.productId) return "Elegí un producto en todos los renglones.";
    if (row.rowType === "EMPANADA" && row.quantity === 0.5) {
      return "0.5 (media unidad) solo se puede usar en pizzas, no en empanadas.";
    }
    if (!Number.isInteger(row.quantity) && row.quantity !== 0.5) {
      return "La cantidad tiene que ser un número entero (o 0.5 para media pizza).";
    }
  }
  return null;
}

function toApiItems(rows: OrderFormValues["items"]): OrderInput["items"] {
  const items: OrderInput["items"] = [];
  const halfPizzas = rows.filter(isHalfPizzaRow);
  const normalRows = rows.filter((row) => !isHalfPizzaRow(row));

  for (const row of normalRows) {
    items.push(
      row.rowType === "PROMOCION"
        ? { kind: "PROMOCION" as const, promotionId: row.promotionId, variableSelections: row.variableSelections }
        : { kind: "PRODUCTO" as const, productId: row.productId, quantity: row.quantity },
    );
  }

  // De a dos: mitad y mitad (dos sabores). Si sobra uno solo, media pizza
  // de ese sabor sola (mismo precio: entero/2 + $1.000, sin productId2).
  for (let i = 0; i < halfPizzas.length; i += 2) {
    const [first, second] = [halfPizzas[i], halfPizzas[i + 1]];
    items.push({
      kind: "MEDIA_MEDIA" as const,
      productId1: first.productId,
      productId2: second?.productId,
      quantity: 1,
    });
  }

  return items;
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
      notes: "",
      shippingAddress: "",
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const watchedItems = useWatch({ control: form.control, name: "items" });

  const itemsTotal = (watchedItems ?? []).reduce((sum, row) => {
    if (row.rowType === "PROMOCION") {
      const promo = promotions?.find((p) => p.id === row.promotionId);
      return sum + (promo?.price ?? 0);
    }
    const product = products?.find((p) => p.id === row.productId);
    return sum + (product ? product.price * (row.quantity || 0) : 0);
  }, 0);
  // Mismo valor fijo que DELIVERY_FEE en el servidor — se suma solo acá
  // para que la vista previa del total coincida con lo que se va a cobrar.
  const total = channel === "DELIVERY" ? itemsTotal + 3500 : itemsTotal;

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
    if (channel === "DELIVERY" && !values.shippingAddress.trim()) {
      toast.error("Completá la dirección de entrega.");
      return;
    }
    create.mutate({
      customerId: values.customerId,
      method: values.method,
      channel,
      channelSource,
      items: toApiItems(values.items),
      notes: values.notes.trim() || undefined,
      shippingAddress: channel === "DELIVERY" ? values.shippingAddress.trim() : undefined,
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
                    // Precarga la dirección guardada del cliente si el pedido
                    // es delivery y todavía no se escribió nada — no pisa lo
                    // que el usuario ya haya tipeado.
                    if (channel === "DELIVERY" && !form.getValues("shippingAddress")) {
                      const customer = customers?.find((c) => c.id === value);
                      if (customer?.address) form.setValue("shippingAddress", customer.address);
                    }
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

          {channel === "DELIVERY" && (
            <Field>
              <FieldLabel htmlFor="shippingAddress">Dirección de entrega</FieldLabel>
              <Input
                id="shippingAddress"
                placeholder="Calle, número, referencia…"
                {...form.register("shippingAddress")}
              />
            </Field>
          )}

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

          <Field>
            <FieldLabel htmlFor="notes">Observaciones</FieldLabel>
            <Controller
              control={form.control}
              name="notes"
              render={({ field }) => (
                <Textarea
                  id="notes"
                  placeholder="Ej: pizza bien dorada, sin cebolla…"
                  rows={2}
                  {...field}
                />
              )}
            />
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
