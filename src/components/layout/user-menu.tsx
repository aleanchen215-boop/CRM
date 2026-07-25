"use client";

import { useRouter } from "next/navigation";
import { ChevronsUpDown, LogOut } from "lucide-react";
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
  const router = useRouter();
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function handleLogout() {
    await logout();
    router.push("/login");
    router.refresh();
  }

  return (
    // modal={false}: en mobile este menú vive adentro del Sheet del sidebar
    // (también modal) — dos overlays modales anidados compiten por el
    // manejo de "click afuera", y el toque en el trigger terminaba
    // cerrando el Sheet en vez de abrir el menú (esto es lo que el usuario
    // reportó como "se abre otra página y no carga").
    <DropdownMenu modal={false}>
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
        <ChevronsUpDown className="ml-auto size-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate text-xs text-muted-foreground">
          {email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void handleLogout()}>
          <LogOut />
          Cerrar sesión e iniciar con otro usuario
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
