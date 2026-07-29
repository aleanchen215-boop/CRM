-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PORCENTAJE', 'MONTO_FIJO');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "discountType" "DiscountType",
ADD COLUMN     "discountValue" DECIMAL(12,2);
