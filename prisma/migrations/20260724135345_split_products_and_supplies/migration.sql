-- DropForeignKey
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_orderId_fkey";

-- DropForeignKey
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_productId_fkey";

-- AlterTable
ALTER TABLE "product_variants" DROP COLUMN "stock";

-- AlterTable
ALTER TABLE "products" DROP COLUMN "location",
DROP COLUMN "stockActual",
DROP COLUMN "stockIdeal",
DROP COLUMN "stockMinimo",
DROP COLUMN "stockReservado";

-- DropTable
DROP TABLE "stock_movements";

-- CreateTable
CREATE TABLE "supplies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "stockMinimo" INTEGER NOT NULL DEFAULT 0,
    "stockIdeal" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_movements" (
    "id" TEXT NOT NULL,
    "supplyId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supply_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplies_name_key" ON "supplies"("name");

-- AddForeignKey
ALTER TABLE "supply_movements" ADD CONSTRAINT "supply_movements_supplyId_fkey" FOREIGN KEY ("supplyId") REFERENCES "supplies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

