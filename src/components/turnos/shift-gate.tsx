"use client";

import { trpc } from "@/lib/trpc/client";
import { isShiftRole } from "@/lib/shift-roles";
import { AbrirTurnoCard } from "@/components/turnos/abrir-turno-card";
import { LogoutButton } from "@/components/layout/logout-button";
import type { UserRole } from "@/generated/prisma/enums";

// Bloquea el sistema entero (sidebar incluido) hasta que se abra el turno
// de caja — nada de banner ni de recordatorio: se entra, se abre el turno,
// y recién ahí aparece el sistema normal.
export function ShiftGate({ role, children }: { role: UserRole; children: React.ReactNode }) {
  const shiftRole = isShiftRole(role);
  const { data: turno, isLoading } = trpc.turnos.getActive.useQuery(undefined, {
    enabled: shiftRole,
  });

  if (!shiftRole) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Cargando…
      </div>
    );
  }

  if (!turno) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="flex w-full max-w-sm flex-col gap-4">
          <p className="text-center text-lg font-semibold">Abrí tu turno para empezar</p>
          <AbrirTurnoCard />
          {/* Después de cerrar un turno el próximo suele ser recién al otro
              día — conviene poder cerrar sesión directo desde acá en vez de
              tener que abrir un turno para llegar al menú y recién ahí salir. */}
          <LogoutButton variant="full" className="self-center" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
