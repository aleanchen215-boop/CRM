import type { UserRole } from "@/generated/prisma/enums";

// A qué pantalla entra cada rol al loguearse — los roles acotados a una
// sola pantalla (Cajero, Productor, Depósito, Vendedor de sucursal) no
// tienen Dashboard, así que entrar ahí les mostraba una pantalla vacía o
// con datos a los que no tienen acceso real. El resto (Admin, Vendedor,
// Atención, Supervisor) sigue entrando al Dashboard como siempre.
const HOME_ROUTE_BY_ROLE: Partial<Record<UserRole, string>> = {
  CAJERO: "/ventas",
  VENDEDOR_PARACAO: "/ventas",
  VENDEDOR_ALMAFUERTE: "/ventas",
  DEPOSITO: "/stock",
  PRODUCTOR: "/stock",
  REPARTIDOR: "/stock",
};

export function getHomeRoute(role: UserRole): string {
  return HOME_ROUTE_BY_ROLE[role] ?? "/";
}
