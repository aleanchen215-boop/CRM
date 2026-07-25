-- CreateTable
CREATE TABLE "sucursales" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sucursales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sucursales_name_key" ON "sucursales"("name");
CREATE UNIQUE INDEX "sucursales_slug_key" ON "sucursales"("slug");

-- Seed: todo lo que ya existe en la base es de la sucursal Paracao (la única
-- que operaba hasta ahora); Almafuerte arranca vacía.
INSERT INTO "sucursales" ("id", "name", "slug") VALUES
    ('64dc273c-e237-4be2-bb4e-8bab7e53f3ec', 'Paracao', 'paracao'),
    ('114795b0-5952-4af3-8944-f4ae6285e6d4', 'Almafuerte', 'almafuerte');

-- AlterTable: users (nullable — nulo = ve/opera en todas las sucursales)
ALTER TABLE "users" ADD COLUMN "sucursalId" TEXT;
ALTER TABLE "users" ADD CONSTRAINT "users_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: conversations (todo lo existente es de Paracao)
ALTER TABLE "conversations" ADD COLUMN "sucursalId" TEXT;
UPDATE "conversations" SET "sucursalId" = '64dc273c-e237-4be2-bb4e-8bab7e53f3ec';
ALTER TABLE "conversations" ALTER COLUMN "sucursalId" SET NOT NULL;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: orders (todo lo existente es de Paracao)
ALTER TABLE "orders" ADD COLUMN "sucursalId" TEXT;
UPDATE "orders" SET "sucursalId" = '64dc273c-e237-4be2-bb4e-8bab7e53f3ec';
ALTER TABLE "orders" ALTER COLUMN "sucursalId" SET NOT NULL;
ALTER TABLE "orders" ADD CONSTRAINT "orders_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: supplies (todo lo existente es de Paracao) — el nombre deja de
-- ser único global y pasa a ser único por sucursal (Almafuerte va a tener
-- sus propios insumos con los mismos nombres).
DROP INDEX "supplies_name_key";
ALTER TABLE "supplies" ADD COLUMN "sucursalId" TEXT;
UPDATE "supplies" SET "sucursalId" = '64dc273c-e237-4be2-bb4e-8bab7e53f3ec';
ALTER TABLE "supplies" ALTER COLUMN "sucursalId" SET NOT NULL;
ALTER TABLE "supplies" ADD CONSTRAINT "supplies_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "supplies_name_sucursalId_key" ON "supplies"("name", "sucursalId");

-- AlterTable: missing_supply_items (todo lo existente es de Paracao)
ALTER TABLE "missing_supply_items" ADD COLUMN "sucursalId" TEXT;
UPDATE "missing_supply_items" SET "sucursalId" = '64dc273c-e237-4be2-bb4e-8bab7e53f3ec';
ALTER TABLE "missing_supply_items" ALTER COLUMN "sucursalId" SET NOT NULL;
ALTER TABLE "missing_supply_items" ADD CONSTRAINT "missing_supply_items_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
