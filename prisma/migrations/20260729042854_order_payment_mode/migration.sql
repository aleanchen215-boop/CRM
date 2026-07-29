-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('SIMPLE', 'MULTIPLE');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "paymentMode" "PaymentMode" NOT NULL DEFAULT 'SIMPLE';
