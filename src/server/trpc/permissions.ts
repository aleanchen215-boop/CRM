import type { UserRole } from "@/generated/prisma/enums";

// Matriz acción -> roles permitidos (sección 10 del plan de arquitectura).
// Un solo lugar de verdad: agregar una acción acá la habilita en todos los
// procedures que la referencien, sin tocar cada router.
export const PERMISSIONS = {
  "customers:read": ["ADMIN", "VENDEDOR", "ATENCION", "SUPERVISOR", "CAJERO"],
  "customers:write": ["ADMIN", "VENDEDOR", "CAJERO"],
  "conversations:read": ["ADMIN", "VENDEDOR", "ATENCION", "SUPERVISOR", "CAJERO"],
  "conversations:write": ["ADMIN", "VENDEDOR", "ATENCION", "CAJERO"],
  "ai:approve": ["ADMIN", "ATENCION", "SUPERVISOR"],
  "ai:configure": ["ADMIN"],
  "orders:write": ["ADMIN", "VENDEDOR", "CAJERO"],
  "orders:read": ["ADMIN", "VENDEDOR", "SUPERVISOR", "CAJERO"],
  // Cancelar una venta ya hecha es más sensible que actualizar su estado
  // normal (afecta caja/reportes) — solo Admin (Cajero puede crear, no
  // borrar/cancelar).
  "orders:cancel": ["ADMIN"],
  // Productos = catálogo de venta (nombre/precio). Todos los que venden
  // necesitan verlo; solo Admin lo edita (cambios de precio son sensibles).
  "products:read": ["ADMIN", "VENDEDOR", "DEPOSITO", "SUPERVISOR", "CAJERO"],
  "products:write": ["ADMIN"],
  // Stock = insumos/ingredientes (cantidad). Productor entra solo a ver
  // esto (stock y faltantes), nada más.
  "stock:write": ["ADMIN", "DEPOSITO"],
  "stock:read": ["ADMIN", "DEPOSITO", "SUPERVISOR", "PRODUCTOR"],
  "automations:write": ["ADMIN"],
  "reports:read": ["ADMIN", "VENDEDOR", "DEPOSITO", "SUPERVISOR"],
  "users:manage": ["ADMIN"],
} as const satisfies Record<string, readonly UserRole[]>;

export type PermissionAction = keyof typeof PERMISSIONS;

export function canPerform(role: UserRole, action: PermissionAction): boolean {
  return (PERMISSIONS[action] as readonly UserRole[]).includes(role);
}
