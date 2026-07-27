-- AlterTable
ALTER TABLE "orders" ADD COLUMN "staffNotes" TEXT;

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'CUENTA_CORRIENTE';
