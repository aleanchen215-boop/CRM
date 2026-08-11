"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  Landmark,
  LayoutDashboard,
  Settings,
  ShoppingCart,
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
// puntuales (creados a pedido: cajero = ventas, productor =
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
          <Image
            src="/logo.png"
            alt="Empapizza"
            width={28}
            height={28}
            className="size-7 shrink-0 rounded-md"
          />
          <span className="text-sm font-semibold group-data-[collapsible=icon]:hidden">
            Empapizza
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
                      <span className="flex-1">{item.label}</span>
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
