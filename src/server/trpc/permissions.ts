import type { UserRole } from "@/generated/prisma/enums";

// Matriz acción -> roles permitidos (sección 10 del plan de arquitectura).
// Un solo lugar de verdad: agregar una acción acá la habilita en todos los
// procedures que la referencien, sin tocar cada router.
export const PERMISSIONS = {
  "customers:read": ["ADMIN", "VENDEDOR", "ATENCION", "SUPERVISOR"],
  "customers:write": ["ADMIN", "VENDEDOR"],
  "conversations:read": ["ADMIN", "VENDEDOR", "ATENCION", "SUPERVISOR"],
  "conversations:write": ["ADMIN", "VENDEDOR", "ATENCION"],
  "ai:approve": ["ADMIN", "ATENCION", "SUPERVISOR"],
  "orders:write": ["ADMIN", "VENDEDOR"],
  "orders:read": ["ADMIN", "VENDEDOR", "SUPERVISOR"],
  "stock:write": ["ADMIN", "DEPOSITO"],
  "stock:read": ["ADMIN", "DEPOSITO", "SUPERVISOR"],
  "automations:write": ["ADMIN"],
  "reports:read": ["ADMIN", "VENDEDOR", "DEPOSITO", "SUPERVISOR"],
  "users:manage": ["ADMIN"],
} as const satisfies Record<string, readonly UserRole[]>;

export type PermissionAction = keyof typeof PERMISSIONS;

export function canPerform(role: UserRole, action: PermissionAction): boolean {
  return (PERMISSIONS[action] as readonly UserRole[]).includes(role);
}
