-- CreateTable
CREATE TABLE "product_supply_usage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplyId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "product_supply_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_supply_usage_productId_supplyId_key" ON "product_supply_usage"("productId", "supplyId");

-- AddForeignKey
ALTER TABLE "product_supply_usage" ADD CONSTRAINT "product_supply_usage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_supply_usage" ADD CONSTRAINT "product_supply_usage_supplyId_fkey" FOREIGN KEY ("supplyId") REFERENCES "supplies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
