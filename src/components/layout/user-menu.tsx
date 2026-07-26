"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { LogoutButton } from "@/components/layout/logout-button";

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
  REPARTIDOR: "Repartidor",
};

// Sin dropdown a propósito: un menú desplegable acá quedaba anidado dentro
// del Sheet modal del sidebar en mobile (ambos de @base-ui) y el toque en
// el trigger terminaba navegando a una página rota en vez de abrir el
// menú, incluso probando modal={false}. Botón directo, sin overlays
// anidados — así no hay ambigüedad posible.
export function UserMenu({ name, email, role }: { name: string; email: string; role: string }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex items-center gap-1">
      <SidebarMenuButton size="lg" className="cursor-default hover:bg-transparent" tabIndex={-1}>
        <Avatar className="size-7">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col text-left leading-tight group-data-[collapsible=icon]:hidden">
          <span className="text-sm font-medium">{name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {ROLE_LABELS[role] ?? role} · {email}
          </span>
        </div>
      </SidebarMenuButton>
      <LogoutButton className="group-data-[collapsible=icon]:hidden" />
    </div>
  );
}
