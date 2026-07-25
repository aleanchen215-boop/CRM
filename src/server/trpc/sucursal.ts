import { TRPCError } from "@trpc/server";

type ScopedUser = { sucursalId: string | null };

// Filtro de sucursal para una query de listado:
// - Usuario atado a una sucursal (ej. VENDEDOR_PARACAO): siempre la suya,
//   pisando lo que haya mandado el cliente — no se puede bypassear pidiendo
//   otra.
// - Usuario sin sucursal fija (Admin, Productor, Supervisor...): la que pidió
//   el cliente (el selector de sucursal), o ninguna (ve todas juntas) si no
//   mandó nada.
export function resolveSucursalFilter(user: ScopedUser, requested?: string): string | undefined {
  return user.sucursalId ?? requested;
}

// Igual, pero para altas: siempre hace falta una sucursal puntual (no se
// puede crear un pedido/insumo "de todas las sucursales a la vez").
export function resolveSucursalForWrite(user: ScopedUser, requested?: string): string {
  const sucursalId = user.sucursalId ?? requested;
  if (!sucursalId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Falta indicar la sucursal." });
  }
  return sucursalId;
}
