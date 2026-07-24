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

  const form = useForm<ProductUpdateInput & { initialStock?: number }>({
    resolver: zodResolver(schema) as Resolver<ProductUpdateInput & { initialStock?: number }>,
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
            stockMinimo: 0,
            stockIdeal: 0,
            location: "",
            initialStock: 0,
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
            <FieldLabel htmlFor="sku">SKU</FieldLabel>
            <Input id="sku" {...form.register("sku")} />
            <FieldError errors={[form.formState.errors.sku]} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="category">Categoría</FieldLabel>
            <Input id="category" placeholder="Ej: Indumentaria" {...form.register("category")} />
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
            <FieldLabel htmlFor="price">Precio</FieldLabel>
            <Input id="price" type="number" step="0.01" {...form.register("price")} />
            <FieldError errors={[form.formState.errors.price]} />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {props.mode === "create" && (
            <Field>
              <FieldLabel htmlFor="initialStock">Stock inicial</FieldLabel>
              <Input id="initialStock" type="number" {...form.register("initialStock")} />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="stockMinimo">Stock mínimo</FieldLabel>
            <Input id="stockMinimo" type="number" {...form.register("stockMinimo")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="stockIdeal">Stock ideal</FieldLabel>
            <Input id="stockIdeal" type="number" {...form.register("stockIdeal")} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="internalCode">Código interno</FieldLabel>
            <Input id="internalCode" {...form.register("internalCode")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="location">Ubicación</FieldLabel>
            <Input id="location" placeholder="Depósito, estante…" {...form.register("location")} />
          </Field>
        </div>
      </FieldGroup>

      <Button type="submit" disabled={pending} className="self-end">
        {pending ? "Guardando…" : props.mode === "create" ? "Crear producto" : "Guardar cambios"}
      </Button>
    </form>
  );
}
