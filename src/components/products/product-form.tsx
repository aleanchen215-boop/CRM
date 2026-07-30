"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import {
  productInputSchema,
  productUpdateSchema,
  type ProductInput,
  type ProductUpdateInput,
} from "@/lib/validation/product";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";

type ProductFormProps =
  | { mode: "create"; onSuccess: (productId: string) => void }
  | {
      mode: "edit";
      productId: string;
      defaultValues: ProductUpdateInput;
      onSuccess: () => void;
    };

export function ProductForm(props: ProductFormProps) {
  const utils = trpc.useUtils();
  const schema = props.mode === "create" ? productInputSchema : productUpdateSchema;

  const form = useForm<ProductUpdateInput>({
    resolver: zodResolver(schema) as Resolver<ProductUpdateInput>,
    defaultValues:
      props.mode === "edit"
        ? props.defaultValues
        : {
            sku: "",
            internalCode: "",
            name: "",
            category: "",
            supplier: "",
            cost: 0,
            price: 0,
            priceApps: 0,
            ingredients: "",
          },
  });

  const create = trpc.products.create.useMutation({
    onSuccess: async (product) => {
      await utils.products.list.invalidate();
      toast.success("Producto creado");
      if (props.mode === "create") props.onSuccess(product.id);
    },
    onError: (error) => toast.error(error.message),
  });

  const update = trpc.products.update.useMutation({
    onSuccess: async () => {
      if (props.mode === "edit") {
        await Promise.all([
          utils.products.list.invalidate(),
          utils.products.getById.invalidate({ id: props.productId }),
        ]);
      }
      toast.success("Producto actualizado");
      if (props.mode === "edit") props.onSuccess();
    },
    onError: (error) => toast.error(error.message),
  });

  const pending = create.isPending || update.isPending;

  const onSubmit = form.handleSubmit((values) => {
    if (props.mode === "create") {
      create.mutate(values as ProductInput);
    } else {
      update.mutate({ id: props.productId, ...values });
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FieldGroup className="gap-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="name">Nombre</FieldLabel>
            <Input id="name" {...form.register("name")} />
            <FieldError errors={[form.formState.errors.name]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="sku">SKU (opcional)</FieldLabel>
            <Input id="sku" {...form.register("sku")} />
            <FieldError errors={[form.formState.errors.sku]} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="category">Categoría</FieldLabel>
            <Input id="category" placeholder="Ej: Pizzas" {...form.register("category")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="supplier">Proveedor</FieldLabel>
            <Input id="supplier" {...form.register("supplier")} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="cost">Costo</FieldLabel>
            <Input id="cost" type="number" step="0.01" {...form.register("cost")} />
            <FieldError errors={[form.formState.errors.cost]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="internalCode">Código interno (opcional)</FieldLabel>
            <Input id="internalCode" {...form.register("internalCode")} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="price">Lista oficial</FieldLabel>
            <Input id="price" type="number" step="0.01" {...form.register("price")} />
            <FieldError errors={[form.formState.errors.price]} />
            <p className="text-xs text-muted-foreground">Mostrador y Delivery.</p>
          </Field>
          <Field>
            <FieldLabel htmlFor="priceApps">Lista Apps</FieldLabel>
            <Input id="priceApps" type="number" step="0.01" {...form.register("priceApps")} />
            <FieldError errors={[form.formState.errors.priceApps]} />
            <p className="text-xs text-muted-foreground">Rappi y PedidosYa.</p>
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="ingredients">Ingredientes (opcional)</FieldLabel>
          <Textarea
            id="ingredients"
            placeholder="Ej: muzzarella, jamón, morrón"
            rows={2}
            {...form.register("ingredients")}
          />
        </Field>
      </FieldGroup>

      <Button type="submit" disabled={pending} className="self-end">
        {pending ? "Guardando…" : props.mode === "create" ? "Crear producto" : "Guardar cambios"}
      </Button>
    </form>
  );
}
