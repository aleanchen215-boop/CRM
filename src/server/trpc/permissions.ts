import type { UserRole } from "@/generated/prisma/enums";

// Matriz acción -> roles permitidos (sección 10 del plan de arquitectura).
// Un solo lugar de verdad: agregar una acción acá la habilita en todos los
// procedures que la referencien, sin tocar cada router.
export const PERMISSIONS = {
  "customers:read": ["ADMIN", "VENDEDOR", "ATENCION", "SUPERVISOR", "CAJERO", "VENDEDOR_PARACAO", "VENDEDOR_ALMAFUERTE"],
  "customers:write": ["ADMIN", "VENDEDOR", "CAJERO", "VENDEDOR_PARACAO", "VENDEDOR_ALMAFUERTE"],
  "conversations:read": ["ADMIN", "VENDEDOR", "ATENCION", "SUPERVISOR", "CAJERO", "VENDEDOR_PARACAO", "VENDEDOR_ALMAFUERTE"],
  "conversations:write": ["ADMIN", "VENDEDOR", "ATENCION", "CAJERO", "VENDEDOR_PARACAO", "VENDEDOR_ALMAFUERTE"],
  "ai:approve": ["ADMIN", "ATENCION", "SUPERVISOR"],
  "ai:configure": ["ADMIN"],
  "orders:write": ["ADMIN", "VENDEDOR", "CAJERO", "VENDEDOR_PARACAO", "VENDEDOR_ALMAFUERTE"],
  "orders:read": ["ADMIN", "VENDEDOR", "SUPERVISOR", "CAJERO", "VENDEDOR_PARACAO", "VENDEDOR_ALMAFUERTE"],
  // Cancelar una venta ya hecha es más sensible que actualizar su estado
  // normal (afecta caja/reportes, y ahora devuelve stock) — solo Admin,
  // ningún rol de venta (Cajero ni Vendedor de sucursal) puede cancelar
  // por su cuenta (pedido explícito del dueño).
  "orders:cancel": ["ADMIN"],
  // Productos = catálogo de venta (nombre/precio). Todos los que venden
  // necesitan verlo; solo Admin lo edita (cambios de precio son sensibles).
  // Depósito no vende — no necesita ver el catálogo, solo Stock/faltantes.
  "products:read": ["ADMIN", "VENDEDOR", "SUPERVISOR", "CAJERO", "VENDEDOR_PARACAO", "VENDEDOR_ALMAFUERTE"],
  "products:write": ["ADMIN"],
  // Stock = insumos/ingredientes (cantidad). Depósito es de solo lectura
  // (ve stock e insumos faltantes de las dos sucursales, no modifica nada
  // — ni cantidades ni la lista de faltantes); Productor entra solo a ver
  // esto (stock y faltantes) de las dos sucursales; el vendedor de cada
  // sucursal solo ve la suya (queda resuelto por su User.sucursalId, no acá).
  "stock:write": ["ADMIN"],
  "stock:read": [
    "ADMIN",
    "DEPOSITO",
    "SUPERVISOR",
    "PRODUCTOR",
    "VENDEDOR_PARACAO",
    "VENDEDOR_ALMAFUERTE",
    "REPARTIDOR",
  ],
  // Acción acotada para Repartidor: sumar cantidad a un insumo que ya
  // existe (nunca crear/editar/sacar) y marcar un faltante como ya
  // llevado — no es lo mismo que stock:write completo.
  "stock:add": ["ADMIN", "REPARTIDOR"],
  // Anotar un insumo faltante (no resolverlo) — el vendedor de cada
  // sucursal puede avisar que algo se está por terminar, pero no marcarlo
  // como ya llevado/comprado (eso sigue siendo stock:add/stock:write).
  "stock:reportMissing": ["ADMIN", "VENDEDOR_PARACAO", "VENDEDOR_ALMAFUERTE"],
  // Registrar que algo se tiró/rompió (se venció, se cayó, salió mal y no
  // se pudo vender) — descuenta stock igual que una venta, pero separado
  // para no tener que disfrazarlo de venta o consumo interno solo para que
  // el conteo de stock quede bien. Mismo alcance que reportMissing: Admin y
  // el vendedor de cada sucursal, nunca Cajero ni el resto de los roles de
  // Stock (Depósito/Productor/Repartidor no venden, no tiran producto).
  "stock:waste": ["ADMIN", "VENDEDOR_PARACAO", "VENDEDOR_ALMAFUERTE"],
  "automations:write": ["ADMIN"],
  "reports:read": ["ADMIN", "VENDEDOR", "SUPERVISOR"],
  "users:manage": ["ADMIN"],
  // Abrir/cerrar el turno de caja de su sucursal y registrar retiros a
  // caja fuerte — lo usan Vendedor Paracao/Almafuerte (Cajero lo tiene
  // habilitado también pero no se usa en la práctica); Admin puede operar
  // cualquiera.
  "turnos:operate": ["ADMIN", "CAJERO", "VENDEDOR_PARACAO", "VENDEDOR_ALMAFUERTE"],
  // Ver el historial de cierres de turno (con la diferencia contado vs.
  // esperado) y de retiros de ambas sucursales — solo Admin.
  "finanzas:audit": ["ADMIN"],
} as const satisfies Record<string, readonly UserRole[]>;

export type PermissionAction = keyof typeof PERMISSIONS;

export function canPerform(role: UserRole, action: PermissionAction): boolean {
  return (PERMISSIONS[action] as readonly UserRole[]).includes(role);
}
