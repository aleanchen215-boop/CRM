import type { PrismaClient } from "@/generated/prisma/client";

// Venta de mostrador sin cliente cargado (alguien que pasa y compra) — en
// vez de hacer customerId nullable en todo el modelo de Order (tocaría cada
// lugar que asume que order.customer existe), se resuelve a un único
// cliente genérico compartido. `whatsapp` es unique y NOT NULL en Customer,
// así que necesita algún valor: uno fijo, no un teléfono real.
export const WALK_IN_WHATSAPP = "consumidor-final";

export async function getOrCreateWalkInCustomer(prisma: PrismaClient) {
  return prisma.customer.upsert({
    where: { whatsapp: WALK_IN_WHATSAPP },
    create: {
      firstName: "Consumidor",
      lastName: "Final",
      whatsapp: WALK_IN_WHATSAPP,
      origin: "Mostrador",
    },
    update: {},
  });
}
