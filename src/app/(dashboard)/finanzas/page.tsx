"use client";

import { trpc } from "@/lib/trpc/client";
import { AbrirTurnoCard } from "@/components/turnos/abrir-turno-card";
import { TurnoActivoCard } from "@/components/turnos/turno-activo-card";
import { FinanzasAdminView } from "@/components/turnos/finanzas-admin-view";

export default function FinanzasPage() {
  const { data: me } = trpc.system.me.useQuery();
  const { data: turno, isLoading } = trpc.turnos.getActive.useQuery(undefined, {
    enabled: me?.role === "CAJERO",
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Finanzas</h1>
        <p className="text-sm text-muted-foreground">
          {me?.role === "ADMIN"
            ? "Cierres de turno y retiros a caja fuerte de ambas sucursales."
            : "Turno de caja: apertura, cierre y retiros a caja fuerte."}
        </p>
      </div>

      {me?.role === "ADMIN" && <FinanzasAdminView />}

      {me?.role === "CAJERO" && !isLoading && (turno ? <TurnoActivoCard turno={turno} /> : <AbrirTurnoCard />)}
    </div>
  );
}
