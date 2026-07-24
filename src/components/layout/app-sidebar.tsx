"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
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

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/conversaciones", label: "Conversaciones", icon: MessageCircle },
  { href: "/ventas", label: "Ventas", icon: ShoppingCart },
  { href: "/productos", label: "Productos", icon: UtensilsCrossed },
  { href: "/stock", label: "Stock", icon: Boxes },
  { href: "/ia", label: "IA", icon: Sparkles },
  { href: "/automatizaciones", label: "Automatizaciones", icon: Workflow },
  { href: "/reportes", label: "Reportes", icon: BarChart3 },
] as const;

type AppSidebarUser = { name: string; email: string; role: string };

export function AppSidebar({ user }: { user: AppSidebarUser }) {
  const pathname = usePathname();

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
              {NAV_ITEMS.map((item) => {
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
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
          <SidebarMenuItem>
            <UserMenu {...user} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
