"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import type { UserRole } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administrador",
  VENDEDOR: "Vendedor",
  DEPOSITO: "Depósito",
  ATENCION: "Atención al cliente",
  SUPERVISOR: "Supervisor",
  CAJERO: "Cajero",
  PRODUCTOR: "Productor",
  VENDEDOR_PARACAO: "Vendedor Paracao",
  VENDEDOR_ALMAFUERTE: "Vendedor Almafuerte",
  REPARTIDOR: "Repartidor",
};

const ROLE_OPTIONS = Object.keys(ROLE_LABELS) as UserRole[];

type FormValues = {
  name: string;
  username: string;
  password: string;
  role: UserRole;
};

export function NewUserDialog() {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const form = useForm<FormValues>({
    defaultValues: { name: "", username: "", password: "", role: "CAJERO" },
  });

  const create = trpc.users.create.useMutation({
    onSuccess: async () => {
      toast.success("Usuario creado");
      await utils.users.list.invalidate();
      form.reset();
      setOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const onSubmit = form.handleSubmit((values) => {
    create.mutate(values);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <UserPlus />
        Nuevo usuario
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FieldGroup className="gap-3.5">
            <Field>
              <FieldLabel htmlFor="name">Nombre</FieldLabel>
              <Input id="name" placeholder="Nombre y apellido" {...form.register("name")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="username">Usuario</FieldLabel>
              <Input
                id="username"
                placeholder="ej: cajero.paracao"
                autoComplete="off"
                {...form.register("username")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Contraseña</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                {...form.register("password")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="role">Rol</FieldLabel>
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="role" className="w-full">
                      <SelectValue>{ROLE_LABELS[field.value]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </FieldGroup>
          <Button type="submit" disabled={create.isPending} className="self-end">
            {create.isPending ? "Creando…" : "Crear usuario"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
