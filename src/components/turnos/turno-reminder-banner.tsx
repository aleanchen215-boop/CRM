"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { isShiftRole } from "@/lib/shift-roles";

// Recordatorio persistente en cualquier pantalla (menos Finanzas, donde ya
// está la acción de abrir turno) cuando todavía no abrió el turno de caja
// de su sucursal.
export function TurnoReminderBanner() {
  const pathname = usePathname();
  const { data: me } = trpc.system.me.useQuery();
  const shiftRole = isShiftRole(me?.role);
  const { data: turno, isLoading } = trpc.turnos.getActive.useQuery(undefined, {
    enabled: shiftRole,
  });

  if (!shiftRole || isLoading || turno || pathname.startsWith("/finanzas")) {
    return null;
  }

  return (
    <Link
      href="/finanzas"
      className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive hover:bg-destructive/20"
    >
      <AlertTriangle className="size-4 shrink-0" />
      Todavía no abriste el turno de caja — tocá acá para abrirlo.
    </Link>
  );
}
