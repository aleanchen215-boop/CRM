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

