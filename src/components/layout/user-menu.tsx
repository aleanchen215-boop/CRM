"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
  REPARTIDOR: "Repartidor",
};

// Sin dropdown a propósito: un menú desplegable acá quedaba anidado dentro
// del Sheet modal del sidebar en mobile (ambos de @base-ui) y el toque en
// el trigger terminaba navegando a una página rota en vez de abrir el
// menú, incluso probando modal={false}. Botón directo, sin overlays
// anidados — así no hay ambigüedad posible.
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
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-destructive hover:text-destructive group-data-[collapsible=icon]:hidden"
        title="Cerrar sesión"
        onClick={() => void handleLogout()}
      >
        <LogOut />
        <span className="sr-only">Cerrar sesión</span>
      </Button>
    </div>
  );
}
