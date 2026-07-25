import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getHomeRoute } from "@/lib/home-route";
import { DashboardContent } from "@/components/dashboard/dashboard-content";

export default async function DashboardPage() {
  // Roles acotados a una sola pantalla (Cajero, Depósito, Productor,
  // Vendedor de sucursal) no tienen Dashboard — si entran acá (por login o
  // tipeando la URL) se los manda directo a la pantalla que sí les
  // corresponde en vez de mostrarles el Dashboard vacío/ajeno.
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (authUser) {
    const user = await prisma.user.findUnique({ where: { authId: authUser.id } });
    if (user) {
      const homeRoute = getHomeRoute(user.role);
      if (homeRoute !== "/") {
        redirect(homeRoute);
      }
    }
  }

  return <DashboardContent />;
}
