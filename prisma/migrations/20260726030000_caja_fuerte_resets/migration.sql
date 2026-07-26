-- CreateTable
CREATE TABLE "caja_fuerte_resets" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caja_fuerte_resets_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "caja_fuerte_resets" ADD CONSTRAINT "caja_fuerte_resets_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "caja_fuerte_resets" ADD CONSTRAINT "caja_fuerte_resets_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
