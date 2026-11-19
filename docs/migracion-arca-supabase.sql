-- Pegar entero en Supabase > SQL Editor > New query > Run.
-- Crea las columnas de la factura C y la tabla de tickets de ARCA, y lo
-- anota en el historial de Prisma para que no se vuelva a aplicar. Si un
-- deploy anterior dejó esta migración marcada como fallida, la limpia.

BEGIN;

-- CreateEnum
CREATE TYPE "ArcaStatus" AS ENUM ('PENDIENTE', 'AUTORIZADO', 'ERROR');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "arcaError" TEXT,
ADD COLUMN     "arcaRequestedAt" TIMESTAMP(3),
ADD COLUMN     "arcaStatus" "ArcaStatus",
ADD COLUMN     "cae" TEXT,
ADD COLUMN     "caeVencimiento" TEXT,
ADD COLUMN     "cbteFecha" TEXT,
ADD COLUMN     "cbteNumero" INTEGER,
ADD COLUMN     "cbteTipo" INTEGER,
ADD COLUMN     "importe" DECIMAL(12,2),
ADD COLUMN     "puntoVenta" INTEGER;

-- CreateTable
CREATE TABLE "arca_tickets" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "sign" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arca_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "arca_tickets_key_key" ON "arca_tickets"("key");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_cae_key" ON "invoices"("cae");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_cbteTipo_puntoVenta_cbteNumero_key" ON "invoices"("cbteTipo", "puntoVenta", "cbteNumero");

UPDATE "_prisma_migrations"
SET "rolled_back_at" = now()
WHERE "migration_name" = '20261119120000_arca_factura_electronica'
  AND "finished_at" IS NULL
  AND "rolled_back_at" IS NULL;

INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
VALUES (gen_random_uuid()::text, 'f7f97751913ba10d6bc47be53ffb97dd77328271678192923c8361765f76df3a', now(), '20261119120000_arca_factura_electronica', NULL, NULL, now(), 1);

COMMIT;
