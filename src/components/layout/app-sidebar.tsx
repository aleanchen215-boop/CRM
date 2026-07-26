"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  Landmark,
  LayoutDashboard,
  MessageCircle,
  Settings,
  ShoppingCart,
  Sparkles,
  UtensilsCrossed,
  Users,
  Workflow,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { CerrarTurnoButton } from "@/components/turnos/cerrar-turno-button";
import { isShiftRole } from "@/lib/shift-roles";
import type { UserRole } from "@/generated/prisma/enums";

// Cajero, Productor y Depósito son roles acotados a un par de pantallas
// puntuales (creados a pedido: cajero = conversaciones + ventas, productor =
// stock de ambas sucursales, depósito = solo ver stock/faltantes de ambas,
// sin modificar nada); Vendedor Paracao/Almafuerte son igual de acotados
// pero además solo ven su propia sucursal (se filtra del lado del servidor
// según User.sucursalId). El resto de los roles ve el set "de negocio"
// completo.
const NAV_ITEMS = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["ADMIN", "VENDEDOR", "ATENCION", "SUPERVISOR"],
  },
  {
    href: "/clientes",
    label: "Clientes",
    icon: Users,
    roles: ["ADMIN", "VENDEDOR", "ATENCION", "SUPERVISOR"],
  },
  {
    href: "/conversaciones",
    label: "Conversaciones",
    icon: MessageCircle,
    roles: ["ADMIN", "VENDEDOR", "ATENCION", "SUPERVISOR", "CAJERO", "VENDEDOR_PARACAO", "VENDEDOR_ALMAFUERTE"],
  },
  {
    href: "/ventas",
    label: "Ventas",
    icon: ShoppingCart,
    roles: ["ADMIN", "VENDEDOR", "SUPERVISOR", "CAJERO", "VENDEDOR_PARACAO", "VENDEDOR_ALMAFUERTE"],
  },
  {
    href: "/productos",
    label: "Productos",
    icon: UtensilsCrossed,
    roles: ["ADMIN", "VENDEDOR", "SUPERVISOR"],
  },
  {
    href: "/stock",
    label: "Stock",
    icon: Boxes,
    roles: [
      "ADMIN",
      "DEPOSITO",
      "SUPERVISOR",
      "PRODUCTOR",
      "VENDEDOR_PARACAO",
      "VENDEDOR_ALMAFUERTE",
      "REPARTIDOR",
    ],
  },
  {
    href: "/ia",
    label: "IA",
    icon: Sparkles,
    roles: ["ADMIN", "ATENCION", "SUPERVISOR"],
  },
  {
    href: "/automatizaciones",
    label: "Automatizaciones",
    icon: Workflow,
    roles: ["ADMIN"],
  },
  {
    href: "/reportes",
    label: "Reportes",
    icon: BarChart3,
    roles: ["ADMIN", "VENDEDOR", "SUPERVISOR"],
  },
  {
    href: "/finanzas",
    label: "Finanzas",
    icon: Landmark,
    roles: ["ADMIN", "CAJERO", "VENDEDOR_PARACAO", "VENDEDOR_ALMAFUERTE"],
  },
] as const satisfies ReadonlyArray<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: readonly UserRole[];
}>;

const CONFIGURACION_ROLES: readonly UserRole[] = ["ADMIN"];

type AppSidebarUser = { name: string; email: string; role: UserRole };

export function AppSidebar({ user }: { user: AppSidebarUser }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => (item.roles as readonly UserRole[]).includes(user.role));
  const showConfiguracion = CONFIGURACION_ROLES.includes(user.role);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-semibold">
            P
          </div>
          <span className="text-sm font-semibold group-data-[collapsible=icon]:hidden">
            CRM Paracao
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isActive =
                  item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={isActive}
                      tooltip={item.label}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              {isShiftRole(user.role) && (
                <SidebarMenuItem>
                  <CerrarTurnoButton />
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {showConfiguracion && (
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link href="/configuracion" />}
                isActive={pathname.startsWith("/configuracion")}
                tooltip="Configuración"
              >
                <Settings />
                <span>Configuración</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <UserMenu {...user} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
