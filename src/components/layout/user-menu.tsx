"use client";

import { logout } from "@/app/actions/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";

const ROLE_LABELS: Record<string, string> = {
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

export function UserMenu({ name, email, role }: { name: string; email: string; role: string }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
        <Avatar className="size-7">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col text-left leading-tight group-data-[collapsible=icon]:hidden">
          <span className="text-sm font-medium">{name}</span>
          <span className="text-xs text-muted-foreground">
            {ROLE_LABELS[role] ?? role}
          </span>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate text-xs text-muted-foreground">
          {email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => logout()}>Cerrar sesión</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
