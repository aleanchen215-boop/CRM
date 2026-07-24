import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  // proxy.ts ya redirige a /login si no hay sesión; esto es defensa en profundidad
  // para cuando este layout se renderiza directamente (ver DAL en el plan de arquitectura).
  if (!authUser) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({ where: { authId: authUser.id } });

  if (!user || !user.active) {
    redirect("/login");
  }

  return (
    <SidebarProvider>
      <AppSidebar user={{ name: user.name, email: user.email, role: user.role }} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm text-muted-foreground">CRM Paracao</span>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
