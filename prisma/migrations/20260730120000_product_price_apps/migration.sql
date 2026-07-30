-- AlterTable: agrega la lista de precios "Apps" (Rappi/PedidosYa) como
-- columna separada de "price" (lista oficial, Mostrador/Delivery). Arranca
-- igual a price para no dejar ningún producto sin precio Apps cargado, y
-- después se edita por separado desde Productos.
ALTER TABLE "products" ADD COLUMN "priceApps" DECIMAL(12,2);

UPDATE "products" SET "priceApps" = "price" WHERE "priceApps" IS NULL;

ALTER TABLE "products" ALTER COLUMN "priceApps" SET NOT NULL;
