import type { UserRole } from "@/generated/prisma/enums";

// Roles que operan turnos de caja (abrir/cerrar, retiros) — Cajero lo tiene
// habilitado pero no se usa en la práctica, los que realmente lo usan son
// los vendedores de cada sucursal.
export const SHIFT_ROLES: readonly UserRole[] = ["CAJERO", "VENDEDOR_PARACAO", "VENDEDOR_ALMAFUERTE"];

export function isShiftRole(role: UserRole | undefined): boolean {
  return !!role && SHIFT_ROLES.includes(role);
}
