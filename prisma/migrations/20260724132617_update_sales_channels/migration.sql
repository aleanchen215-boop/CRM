-- AlterEnum
BEGIN;
CREATE TYPE "SalesChannel_new" AS ENUM ('MOSTRADOR', 'DELIVERY', 'APPS');
ALTER TABLE "public"."orders" ALTER COLUMN "channel" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "channel" TYPE "SalesChannel_new" USING ("channel"::text::"SalesChannel_new");
ALTER TYPE "SalesChannel" RENAME TO "SalesChannel_old";
ALTER TYPE "SalesChannel_new" RENAME TO "SalesChannel";
DROP TYPE "public"."SalesChannel_old";
ALTER TABLE "orders" ALTER COLUMN "channel" SET DEFAULT 'MOSTRADOR';
COMMIT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "channelSource" TEXT,
ADD COLUMN     "externalOrderId" TEXT,
ALTER COLUMN "channel" SET DEFAULT 'MOSTRADOR';

-- CreateIndex
CREATE UNIQUE INDEX "orders_channelSource_externalOrderId_key" ON "orders"("channelSource", "externalOrderId");
