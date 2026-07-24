"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useFieldArray, useForm, useWatch, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  promotionInputSchema,
  promotionItemKindValues,
  type PromotionInput,
} from "@/lib/validation/promotion";
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

const KIND_LABELS: Record<(typeof promotionItemKindValues)[number], string> = {
  FIJO: "Fijo (producto puntual)",
  VARIABLE: "Variable (a elección de categoría)",
};

type PromotionFormProps = {
  mode: "create" | "edit";
  promotionId?: string;
  defaultValues?: PromotionInput;
  onSuccess: (promotionId: string) => void;
};

export function PromotionForm({ mode, promotionId, defaultValues, onSuccess }: PromotionFormProps) {
  const utils = trpc.useUtils();
  const { data: products } = trpc.products.list.useQuery({});
  const { data: categories } = trpc.products.categories.useQuery();

  const form = useForm<PromotionInput>({
    resolver: zodResolver(promotionInputSchema) as Resolver<PromotionInput>,
    defaultValues: defaultValues ?? {
      name: "",
      price: 0,
      items: [{ kind: "FIJO", quantity: 1, productId: "", categoryId: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const watchedItems = useWatch({ control: form.control, name: "items" });

  const create = trpc.promotions.create.useMutation({
    onSuccess: async (promotion) => {
      await utils.promotions.list.invalidate();
      toast.success("Promoción creada");
      onSuccess(promotion.id);
    },
    onError: (error) => toast.error(error.message),
  });

  const update = trpc.promotions.update.useMutation({
    onSuccess: async (promotion) => {
      await Promise.all([
        utils.promotions.list.invalidate(),
        utils.promotions.getById.invalidate({ id: promotion.id }),
      ]);
      toast.success("Promoción actualizada");
      onSuccess(promotion.id);
    },
    onError: (error) => toast.error(error.message),
  });

  const pending = create.isPending || update.isPending;

  const onSubmit = form.handleSubmit((values) => {
    if (mode === "create") {
      create.mutate(values);
    } else if (promotionId) {
      update.mutate({ id: promotionId, ...values });
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FieldGroup className="gap-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="name">Nombre</FieldLabel>
            <Input id="name" placeholder="Ej: Promo 2 pizzas + empanadas" {...form.register("name")} />
            <FieldError errors={[form.formState.errors.name]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="price">Precio de la promo</FieldLabel>
            <Input id="price" type="number" step="0.01" {...form.register("price")} />
            <FieldError errors={[form.formState.errors.price]} />
          </Field>
        </div>

        <Field>
          <FieldLabel>Renglones</FieldLabel>
          <div className="flex flex-col gap-2">
            {fields.map((field, index) => {
              const kind = watchedItems?.[index]?.kind;
              return (
                <div key={field.id} className="flex items-start gap-2 rounded-lg border p-2">
                  <Controller
                    control={form.control}
                    name={`items.${index}.kind`}
                    render={({ field: selectField }) => (
                      <Select value={selectField.value} onValueChange={selectField.onChange}>
                        <SelectTrigger className="w-44 shrink-0">
                          <SelectValue>
                            {(value: (typeof promotionItemKindValues)[number]) => KIND_LABELS[value]}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {promotionItemKindValues.map((value) => (
                            <SelectItem key={value} value={value}>
                              {KIND_LABELS[value]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />

                  {kind === "FIJO" ? (
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
                  ) : (
                    <Controller
                      control={form.control}
                      name={`items.${index}.categoryId`}
                      render={({ field: selectField }) => (
                        <Select value={selectField.value} onValueChange={selectField.onChange}>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Categoría…">
                              {(id: string) => categories?.find((c) => c.id === id)?.name ?? id}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {categories?.map((category) => (
                              <SelectItem key={category.id} value={category.id}>
                                {category.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  )}

                  <Input
                    type="number"
                    min={1}
                    className="w-20 shrink-0"
                    placeholder="Cant."
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
              );
            })}
          </div>
          <FieldError
            errors={[form.formState.errors.items?.root, form.formState.errors.items]}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => append({ kind: "FIJO", quantity: 1, productId: "", categoryId: "" })}
          >
            <Plus />
            Agregar renglón
          </Button>
        </Field>
      </FieldGroup>

      <Button type="submit" disabled={pending} className="self-end">
        {pending ? "Guardando…" : mode === "create" ? "Crear promoción" : "Guardar cambios"}
      </Button>
    </form>
  );
}
