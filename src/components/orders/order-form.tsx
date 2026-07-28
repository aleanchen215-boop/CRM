"use client";

import { useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import {
  paymentMethodValues,
  salesChannelValues,
  getAllowedPaymentMethods,
} from "@/lib/validation/order";
import type { OrderFormValues } from "@/components/orders/order-form-types";
import { emptyRow, isHalfPizzaRow, validateRows, toApiItems } from "@/components/orders/order-row-utils";
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
import { CustomerCombobox } from "@/components/customers/customer-combobox";
import { OrderItemRow } from "@/components/orders/order-item-row";
import { useSucursalSelection } from "@/components/layout/sucursal-context";

const METHOD_LABELS: Record<(typeof paymentMethodValues)[number], string> = {
  MERCADO_PAGO: "Mercado Pago",
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Mercado Pago (link)",
  OTRO: "Otro",
  PREPAGO: "Prepago",
  VISA: "Visa",
  PAYWAY: "Payway",
  CUENTA_CORRIENTE: "Cuenta corriente",
};

const CHANNEL_LABELS: Record<(typeof salesChannelValues)[number], string> = {
  MOSTRADOR: "Mostrador",
  DELIVERY: "Delivery",
  APPS: "Apps",
};


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
  const { data: me } = trpc.system.me.useQuery();
  const { data: customers } = trpc.customers.list.useQuery({});
  const { data: products } = trpc.products.list.useQuery({});
  const { data: promotions } = trpc.promotions.list.useQuery();
  const { data: sucursales } = trpc.sucursales.list.useQuery();
  const { selectedSucursalId } = useSucursalSelection();
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerPrefill, setNewCustomerPrefill] = useState<string | undefined>(undefined);
  // Cuando se precarga la dirección guardada del cliente, se muestra como
  // texto fijo con un lápiz al lado en vez de un input editable directo —
  // así se ve claro que es la dirección guardada, sin poder pisarla sin
  // querer. El lápiz pasa a modo edición normal.
  const [addressLocked, setAddressLocked] = useState(false);

  // Solo hace falta elegir sucursal si quien crea el pedido no está atado a
  // una sola (el servidor la exige en ese caso) — se precarga con la que
  // esté elegida arriba en el selector, si hay una.
  const needsSucursalPicker = Boolean(me && !me.sucursalId);

  // Qué métodos de pago tienen sentido según el canal (y, en Apps, la
  // plataforma) — Rappi solo tiene uno (Visa), así que ni se elige.
  const allowedMethods = getAllowedPaymentMethods(channel, channelSource);
  const methodLocked = allowedMethods.length === 1;

  const form = useForm<OrderFormValues>({
    defaultValues: {
      customerId: "",
      method: allowedMethods[0],
      items: [emptyRow()],
      notes: "",
      shippingAddress: "",
      sucursalId: selectedSucursalId ?? "",
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const watchedItems = useWatch({ control: form.control, name: "items" });
  const watchedSucursalId = useWatch({ control: form.control, name: "sucursalId" });
  const watchedShippingAddress = useWatch({ control: form.control, name: "shippingAddress" });
  // Para saber qué stock mirar en el picker de productos: la sucursal que se
  // haya elegido en el form (si hace falta elegirla) o si no, la que ya está
  // seleccionada arriba en el layout.
  const stockSucursalId = watchedSucursalId || selectedSucursalId || undefined;

  const itemsTotal = (watchedItems ?? []).reduce((sum, row) => {
    if (row.rowType === "PROMOCION") {
      const promo = promotions?.find((p) => p.id === row.promotionId);
      return sum + (promo?.price ?? 0);
    }
    const product = products?.find((p) => p.id === row.productId);
    if (!product) return sum;
    // Media pizza (0.5): (precio entero / 2) + $1.000, no precio * 0.5 —
    // mismo cálculo tanto si queda sola como si se combina con otra mitad
    // (la suma de las dos mitades da el mismo total que la fórmula del
    // servidor para la mitad y mitad).
    if (isHalfPizzaRow(row)) return sum + Math.round(product.price / 2 + 1000);
    return sum + product.price * (row.quantity || 0);
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
    // Mostrador es venta anónima habitual (cliente que pasa y compra) — no
    // hace falta cargarle un cliente. Delivery/Apps sí lo necesitan (hay que
    // saber a quién/dónde enviar).
    if (!values.customerId && channel !== "MOSTRADOR") {
      toast.error("Elegí un cliente.");
      return;
    }
    if (needsSucursalPicker && !values.sucursalId) {
      toast.error("Elegí a qué sucursal pertenece esta venta.");
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
      customerId: values.customerId || undefined,
      method: values.method,
      channel,
      channelSource,
      items: toApiItems(values.items),
      notes: values.notes.trim() || undefined,
      shippingAddress: channel === "DELIVERY" ? values.shippingAddress.trim() : undefined,
      sucursalId: needsSucursalPicker ? values.sucursalId : undefined,
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
            <FieldLabel htmlFor="customerId">
              Cliente{channel === "MOSTRADOR" ? " (opcional)" : ""}
            </FieldLabel>
            <Controller
              control={form.control}
              name="customerId"
              render={({ field }) => (
                <CustomerCombobox
                  value={field.value}
                  allowClear={channel === "MOSTRADOR"}
                  placeholder={
                    channel === "MOSTRADOR"
                      ? "Buscar por nombre o teléfono (opcional)…"
                      : "Buscar por nombre o teléfono…"
                  }
                  onCreateNew={(prefillWhatsapp) => {
                    setNewCustomerPrefill(prefillWhatsapp);
                    setNewCustomerOpen(true);
                  }}
                  onChange={(customerId) => {
                    field.onChange(customerId);
                    // Precarga la dirección guardada del cliente si el pedido
                    // es delivery y todavía no se escribió nada — no pisa lo
                    // que el usuario ya haya tipeado. Si tiene dirección
                    // guardada, queda en modo "solo lectura + lápiz" para
                    // dejar claro que es la guardada antes de tocarla.
                    if (channel === "DELIVERY" && !form.getValues("shippingAddress")) {
                      const customer = customers?.find((c) => c.id === customerId);
                      if (customer?.address) {
                        form.setValue("shippingAddress", customer.address);
                        setAddressLocked(true);
                      } else {
                        setAddressLocked(false);
                      }
                    }
                  }}
                />
              )}
            />
          </Field>

          {needsSucursalPicker && (
            <Field>
              <FieldLabel htmlFor="sucursalId">Sucursal</FieldLabel>
              <Controller
                control={form.control}
                name="sucursalId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="sucursalId" className="w-full">
                      <SelectValue placeholder="Elegir sucursal…">
                        {(id: string) => sucursales?.find((s) => s.id === id)?.name ?? id}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {sucursales?.map((sucursal) => (
                        <SelectItem key={sucursal.id} value={sucursal.id}>
                          {sucursal.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          )}

          {channel === "DELIVERY" && (
            <Field>
              <FieldLabel htmlFor="shippingAddress">Dirección de entrega</FieldLabel>
              {addressLocked ? (
                <div className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-1.5 text-sm">
                  <span className="flex-1 truncate">{watchedShippingAddress}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setAddressLocked(false)}
                    aria-label="Editar dirección"
                  >
                    <Pencil />
                  </Button>
                </div>
              ) : (
                <Input
                  id="shippingAddress"
                  placeholder="Calle, número, referencia…"
                  {...form.register("shippingAddress")}
                />
              )}
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="method">Método de pago</FieldLabel>
            {methodLocked ? (
              <Input
                id="method"
                disabled
                value={METHOD_LABELS[allowedMethods[0]]}
                className="disabled:opacity-100"
              />
            ) : (
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
                      {allowedMethods.map((method) => (
                        <SelectItem key={method} value={method}>
                          {METHOD_LABELS[method]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
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
                  sucursalId={stockSucursalId}
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
            key={newCustomerPrefill ?? "blank"}
            mode="create"
            defaultWhatsapp={newCustomerPrefill}
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
