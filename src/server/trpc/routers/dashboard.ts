import { protectedProcedure, router } from "@/server/trpc/trpc";

// Mismo criterio de "día de negocio" que usa la IA para separar pedidos por
// fecha (ver BUSINESS_TIMEZONE en create-order-tool.ts): Argentina no tiene
// horario de verano, así que comparar por fecha en esta zona alcanza sin
// tener que armar rangos UTC.
const BUSINESS_TIMEZONE = "America/Argentina/Buenos_Aires";
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const monthFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
});

function isToday(date: Date, today: string): boolean {
  return dayFormatter.format(date) === today;
}
function isThisMonth(date: Date, thisMonth: string): boolean {
  return monthFormatter.format(date) === thisMonth;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  MERCADO_PAGO: "Mercado Pago",
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  OTRO: "Otro",
};

export const dashboardRouter = router({
  // Cualquier usuario logueado puede ver el resumen — no depende de un
  // permiso puntual (Cajero/Productor no tienen este nav item igual, se
  // filtra en el sidebar).
  summary: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const today = dayFormatter.format(now);
    const thisMonth = monthFormatter.format(now);

    const [entregados, activeOrdersCount, recentCustomers, openConversations, supplies] =
      await Promise.all([
        ctx.prisma.order.findMany({
          where: { status: "ENTREGADO" },
          select: {
            id: true,
            total: true,
            method: true,
            createdAt: true,
            items: {
              select: {
                quantity: true,
                productId: true,
                promotionId: true,
                product: { select: { name: true } },
                promotion: { select: { name: true } },
              },
            },
          },
        }),
        ctx.prisma.order.count({
          where: { status: { in: ["PENDIENTE", "CONFIRMADO", "ENVIADO"] } },
        }),
        // Rango amplio (48hs) para no perder clientes creados a la noche por
        // el corte UTC de Prisma; el conteo final igual filtra por fecha en
        // la zona del negocio con isToday().
        ctx.prisma.customer.findMany({
          where: { createdAt: { gte: new Date(now.getTime() - 48 * 60 * 60 * 1000) } },
          select: { createdAt: true },
        }),
        ctx.prisma.conversation.count({ where: { status: { not: "CERRADA" } } }),
        ctx.prisma.supply.findMany({ select: { quantity: true, stockMinimo: true } }),
      ]);

    const entregadosHoy = entregados.filter((order) => isToday(order.createdAt, today));
    const entregadosMes = entregados.filter((order) => isThisMonth(order.createdAt, thisMonth));

    const sum = (orders: typeof entregados) =>
      orders.reduce((acc, order) => acc + Number(order.total), 0);

    const productosVendidosHoy = new Map<string, number>();
    const formasDePagoHoy = new Map<string, { count: number; total: number }>();
    for (const order of entregadosHoy) {
      const label = PAYMENT_METHOD_LABELS[order.method] ?? order.method;
      const current = formasDePagoHoy.get(label) ?? { count: 0, total: 0 };
      current.count += 1;
      current.total += Number(order.total);
      formasDePagoHoy.set(label, current);

      for (const item of order.items) {
        const name = item.product?.name ?? item.promotion?.name;
        if (!name) continue;
        productosVendidosHoy.set(name, (productosVendidosHoy.get(name) ?? 0) + item.quantity);
      }
    }

    return {
      ventasHoy: { count: entregadosHoy.length, total: sum(entregadosHoy) },
      ventasMes: { count: entregadosMes.length, total: sum(entregadosMes) },
      facturacionTotal: sum(entregados),
      nuevosClientesHoy: recentCustomers.filter((c) => isToday(c.createdAt, today)).length,
      conversacionesAbiertas: openConversations,
      ticketsAbiertos: activeOrdersCount,
      stockBajo: supplies.filter((s) => s.quantity > 0 && s.quantity <= s.stockMinimo).length,
      sinStock: supplies.filter((s) => s.quantity <= 0).length,
      productosVendidosHoy: Array.from(productosVendidosHoy.entries())
        .map(([name, quantity]) => ({ name, quantity }))
        .sort((a, b) => b.quantity - a.quantity),
      formasDePagoHoy: Array.from(formasDePagoHoy.entries()).map(([label, data]) => ({
        label,
        ...data,
      })),
    };
  }),
});
