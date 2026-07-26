-- AlterTable
ALTER TABLE "orders" ADD COLUMN "modifiedByCustomerAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "cancelRequestedByCustomerAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN "addedByCustomerAt" TIMESTAMP(3);
