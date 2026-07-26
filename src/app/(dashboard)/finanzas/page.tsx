"use client";

import { trpc } from "@/lib/trpc/client";
import { isShiftRole } from "@/lib/shift-roles";
import { TurnoActivoCard } from "@/components/turnos/turno-activo-card";
import { FinanzasAdminView } from "@/components/turnos/finanzas-admin-view";

export default function FinanzasPage() {
  const { data: me } = trpc.system.me.useQuery();
  const shiftRole = isShiftRole(me?.role);
  // El ShiftGate del layout ya garantiza que hay un turno abierto antes de
  // poder llegar a esta pantalla — acá solo se muestra su estado y el
  // retiro, la apertura queda resuelta antes de entrar al sistema.
  const { data: turno } = trpc.turnos.getActive.useQuery(undefined, {
    enabled: shiftRole,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Finanzas</h1>
        <p className="text-sm text-muted-foreground">
          {me?.role === "ADMIN"
            ? "Cierres de turno y retiros a caja fuerte de ambas sucursales."
            : "Turno de caja y retiros a caja fuerte."}
        </p>
      </div>

      {me?.role === "ADMIN" && <FinanzasAdminView />}

      {shiftRole && turno && <TurnoActivoCard turno={turno} />}
    </div>
  );
}
