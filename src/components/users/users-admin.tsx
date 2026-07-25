"use client";

import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import type { UserRole } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NewUserDialog } from "@/components/users/new-user-dialog";

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
};

const ROLE_OPTIONS = Object.keys(ROLE_LABELS) as UserRole[];

// Nulo = ve/opera en todas las sucursales.
const NONE_VALUE = "__ninguna__";

export function UsersAdmin() {
  const utils = trpc.useUtils();
  const { data: me } = trpc.system.me.useQuery();
  const { data: users, isLoading } = trpc.users.list.useQuery();
  const { data: sucursales } = trpc.sucursales.list.useQuery();

  const updateRole = trpc.users.updateRole.useMutation({
    onSuccess: async () => {
      toast.success("Rol actualizado");
      await utils.users.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateActive = trpc.users.updateActive.useMutation({
    onSuccess: async () => {
      await utils.users.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateSucursal = trpc.users.updateSucursal.useMutation({
    onSuccess: async () => {
      toast.success("Sucursal actualizada");
      await utils.users.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base font-medium">Usuarios y roles</CardTitle>
        <NewUserDialog />
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {!isLoading && users && users.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Usuario / email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Sucursal</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const isSelf = user.id === me?.id;
                return (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.username ?? user.email}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={user.role}
                        onValueChange={(role) =>
                          updateRole.mutate({ id: user.id, role: role as UserRole })
                        }
                        disabled={isSelf || updateRole.isPending}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue>{ROLE_LABELS[user.role] ?? user.role}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((role) => (
                            <SelectItem key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={user.sucursalId ?? NONE_VALUE}
                        onValueChange={(value) =>
                          updateSucursal.mutate({
                            id: user.id,
                            sucursalId: value === NONE_VALUE ? null : value,
                          })
                        }
                        disabled={updateSucursal.isPending}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue>{user.sucursal?.name ?? "Todas"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>Todas</SelectItem>
                          {sucursales?.map((sucursal) => (
                            <SelectItem key={sucursal.id} value={sucursal.id}>
                              {sucursal.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.active ? "default" : "secondary"}>
                        {user.active ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isSelf || updateActive.isPending}
                        onClick={() =>
                          updateActive.mutate({ id: user.id, active: !user.active })
                        }
                      >
                        {user.active ? "Desactivar" : "Activar"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
