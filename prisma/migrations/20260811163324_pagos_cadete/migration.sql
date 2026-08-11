-- CreateTable
CREATE TABLE "pagos_cadete" (
    "id" TEXT NOT NULL,
    "turnoId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_cadete_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "pagos_cadete" ADD CONSTRAINT "pagos_cadete_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "turnos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_cadete" ADD CONSTRAINT "pagos_cadete_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_cadete" ADD CONSTRAINT "pagos_cadete_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
