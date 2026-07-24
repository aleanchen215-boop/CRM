-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deliveryFee" DECIMAL(12,2),
ADD COLUMN     "shippingAddress" TEXT;
