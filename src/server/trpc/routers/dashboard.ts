import { z } from "zod";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { resolveSucursalFilter } from "@/server/trpc/sucursal";

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
  PREPAGO: "Prepago",
  VISA: "Visa",
  PAYWAY: "Payway",
  CUENTA_CORRIENTE: "Cuenta corriente",
};

export const dashboardRouter = router({
  // Cualquier usuario logueado puede ver el resumen — no depende de un
  // permiso puntual (Cajero/Productor no tienen este nav item igual, se
  // filtra en el sidebar).
  summary: protectedProcedure
    .input(z.object({ sucursalId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
    const sucursalId = resolveSucursalFilter(ctx.user, input?.sucursalId);
    const now = new Date();
    const today = dayFormatter.format(now);
    const thisMonth = monthFormatter.format(now);

    const [entregados, activeOrdersCount, recentCustomers, supplies, discounted] =
      await Promise.all([
        ctx.prisma.order.findMany({
          where: { status: "ENTREGADO", ...(sucursalId ? { sucursalId } : {}) },
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
          where: {
            status: { in: ["PENDIENTE", "CONFIRMADO", "ENVIADO"] },
            ...(sucursalId ? { sucursalId } : {}),
          },
        }),
        // Rango amplio (48hs) para no perder clientes creados a la noche por
        // el corte UTC de Prisma; el conteo final igual filtra por fecha en
        // la zona del negocio con isToday(). Clientes no son de una sucursal
        // en particular (se comparten entre las dos), así que no se filtran.
        ctx.prisma.customer.findMany({
          where: { createdAt: { gte: new Date(now.getTime() - 48 * 60 * 60 * 1000) } },
          select: { createdAt: true },
        }),
        ctx.prisma.supply.findMany({
          where: sucursalId ? { sucursalId } : {},
          select: { quantity: true, stockMinimo: true },
        }),
        // Descuentos manuales cargados desde Ventas — no depende de que el
        // pedido ya se haya entregado (el vendedor eligió el descuento al
        // cargarlo, eso ya es lo que le interesa auditar al admin), pero sí
        // se excluyen los cancelados porque ese descuento nunca se cobró.
        ctx.prisma.order.findMany({
          where: {
            discountValue: { not: null },
            status: { not: "CANCELADO" },
            ...(sucursalId ? { sucursalId } : {}),
          },
          select: {
            id: true,
            total: true,
            discountType: true,
            discountValue: true,
            createdAt: true,
            employeeId: true,
            employee: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);

    const entregadosHoy = entregados.filter((order) => isToday(order.createdAt, today));
    const entregadosMes = entregados.filter((order) => isThisMonth(order.createdAt, thisMonth));

    // Cuenta corriente es un consumo interno que se anota para cobrar/
    // descontar después (ver comentario del enum PaymentMethod) — descuenta
    // stock como cualquier venta, pero no es plata que haya entrado de
    // verdad, así que no debe sumar a la facturación.
    const sum = (orders: typeof entregados) =>
      orders
        .filter((order) => order.method !== "CUENTA_CORRIENTE")
        .reduce((acc, order) => acc + Number(order.total), 0);

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

    // El total final (order.total) ya viene con el descuento aplicado, no se
    // guarda el subtotal previo — se reconstruye acá para saber cuánta plata
    // representó cada descuento. Monto fijo: el valor cargado es
    // directamente lo descontado (salvo que el pedido diera 0, ahí se
    // recorta al total que quedó antes de descontar). Porcentaje: se
    // despeja el subtotal desde total = subtotal * (1 - value/100).
    function discountAmount(order: (typeof discounted)[number]): number {
      const total = Number(order.total);
      const value = Number(order.discountValue);
      if (order.discountType === "MONTO_FIJO") return value;
      if (value >= 100) return total;
      const subtotal = total / (1 - value / 100);
      return subtotal - total;
    }

    const discountsThisMonth = discounted.filter((o) => isThisMonth(o.createdAt, thisMonth));
    const byEmployeeMap = new Map<string, { employeeName: string; count: number; total: number }>();
    for (const order of discountsThisMonth) {
      const key = order.employeeId ?? "sin-vendedor";
      const current = byEmployeeMap.get(key) ?? {
        employeeName: order.employee?.name ?? "Sin vendedor asignado",
        count: 0,
        total: 0,
      };
      current.count += 1;
      current.total += discountAmount(order);
      byEmployeeMap.set(key, current);
    }

    return {
      ventasHoy: { count: entregadosHoy.length, total: sum(entregadosHoy) },
      ventasMes: { count: entregadosMes.length, total: sum(entregadosMes) },
      facturacionTotal: sum(entregados),
      nuevosClientesHoy: recentCustomers.filter((c) => isToday(c.createdAt, today)).length,
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
      descuentosMes: {
        count: discountsThisMonth.length,
        total: discountsThisMonth.reduce((acc, o) => acc + discountAmount(o), 0),
        porVendedor: Array.from(byEmployeeMap.values()).sort((a, b) => b.total - a.total),
      },
      descuentosRecientes: discounted.slice(0, 15).map((order) => ({
        orderId: order.id,
        employeeName: order.employee?.name ?? "Sin vendedor asignado",
        type: order.discountType,
        value: Number(order.discountValue),
        amount: discountAmount(order),
        total: Number(order.total),
        createdAt: order.createdAt,
      })),
    };
  }),
});
