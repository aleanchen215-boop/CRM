-- AlterTable
ALTER TABLE "sucursales" ADD COLUMN "whatsappNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sucursales_whatsappNumber_key" ON "sucursales"("whatsappNumber");

-- El número actual (env WHATSAPP_PHONE_NUMBER) es el de Paracao, la única
-- sucursal con WhatsApp conectado hasta ahora.
UPDATE "sucursales" SET "whatsappNumber" = '+5493434538904' WHERE "slug" = 'paracao';
