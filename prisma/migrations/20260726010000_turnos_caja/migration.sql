-- CreateEnum
CREATE TYPE "TurnoTipo" AS ENUM ('MANANA', 'NOCHE');

-- CreateTable
CREATE TABLE "turnos" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "tipo" "TurnoTipo" NOT NULL,
    "employeeId" TEXT NOT NULL,
    "montoApertura" DECIMAL(12,2) NOT NULL,
    "montoCierreContado" DECIMAL(12,2),
    "montoCierreEsperado" DECIMAL(12,2),
    "diferencia" DECIMAL(12,2),
    "abiertoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradoEn" TIMESTAMP(3),
    "cerradoPorId" TEXT,

    CONSTRAINT "turnos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retiros_caja" (
    "id" TEXT NOT NULL,
    "turnoId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retiros_caja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "turnos_sucursalId_cerradoEn_idx" ON "turnos"("sucursalId", "cerradoEn");

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_cerradoPorId_fkey" FOREIGN KEY ("cerradoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retiros_caja" ADD CONSTRAINT "retiros_caja_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "turnos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retiros_caja" ADD CONSTRAINT "retiros_caja_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retiros_caja" ADD CONSTRAINT "retiros_caja_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
