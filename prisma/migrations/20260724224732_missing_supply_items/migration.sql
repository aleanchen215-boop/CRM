-- CreateTable
CREATE TABLE "missing_supply_items" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "missing_supply_items_pkey" PRIMARY KEY ("id")
);
