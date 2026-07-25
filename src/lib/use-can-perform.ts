"use client";

import { trpc } from "@/lib/trpc/client";
import { canPerform, type PermissionAction } from "@/server/trpc/permissions";

// Chequeo de permiso del lado del cliente, solo para mostrar/ocultar
// controles de escritura (el servidor sigue siendo la autoridad real vía
// requirePermission en cada procedure — esto es puramente cosmético).
export function useCanPerform(action: PermissionAction): boolean {
  const { data: me } = trpc.system.me.useQuery();
  if (!me) return false;
  return canPerform(me.role, action);
}
