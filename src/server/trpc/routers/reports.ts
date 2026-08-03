import { z } from "zod";
import { requirePermission, router } from "@/server/trpc/trpc";
import { resolveSucursalFilter } from "@/server/trpc/sucursal";

const BUSINESS_TIMEZONE = "America/Argentina/Buenos_Aires";
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

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

const CHANNEL_LABELS: Record<string, string> = {
  MOSTRADOR: "Mostrador",
  DELIVERY: "Delivery",
  APPS: "Apps",
};

// "YYYY-MM-DD" tal cual lo manda el <input type="date"> — representa un día
// de negocio en la zona de Argentina, no un instante puntual.
const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

export const reportsRouter = router({
  // Totales de ventas por día/canal/método de pago + descuentos, productos
  // más vendidos y el detalle de cada pedido, sobre pedidos entregados
  // (mismo criterio que el Dashboard: una venta "cuenta" cuando se entregó).
  ventas: requirePermission("reports:read")
    .input(
      z.object({
        from: dateStringSchema,
        to: dateStringSchema,
        sucursalId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const sucursalId = resolveSucursalFilter(ctx.user, input.sucursalId);

      // from/to son días de negocio en Argentina (UTC-3), no instantes UTC —
      // se pide con un margen de 1 día de cada lado (cubre cualquier
      // corrimiento horario sin importar en qué zona corra el servidor) y
      // el filtro que realmente decide a qué día pertenece cada pedido es
      // dayFormatter más abajo, comparando el string ya en hora Argentina.
      const paddedFrom = new Date(`${input.from}T00:00:00Z`);
      paddedFrom.setUTCDate(paddedFrom.getUTCDate() - 1);
      const paddedTo = new Date(`${input.to}T00:00:00Z`);
      paddedTo.setUTCDate(paddedTo.getUTCDate() + 2);

      const candidates = await ctx.prisma.order.findMany({
        where: {
          status: "ENTREGADO",
          createdAt: { gte: paddedFrom, lte: paddedTo },
          ...(sucursalId ? { sucursalId } : {}),
        },
        select: {
          id: true,
          total: true,
          method: true,
          channel: true,
          createdAt: true,
          discountType: true,
          discountValue: true,
          employeeId: true,
          employee: { select: { name: true } },
          customer: { select: { firstName: true, lastName: true } },
          items: {
            select: {
              quantity: true,
              product: { select: { name: true } },
              promotion: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      const orders = candidates.filter((order) => {
        const day = dayFormatter.format(order.createdAt);
        return day >= input.from && day <= input.to;
      });

      // Cuenta corriente es un consumo interno que se anota para cobrar/
      // descontar después, no plata que haya entrado de verdad — no cuenta
      // como facturación (total, por día, por canal). Sí se sigue viendo su
      // propio renglón en byMethod, para tener a la vista cuánto quedó
      // anotado sin mezclarlo con la facturación real.
      const facturableOrders = orders.filter((o) => o.method !== "CUENTA_CORRIENTE");
      const total = facturableOrders.reduce((acc, o) => acc + Number(o.total), 0);

      const byDayMap = new Map<string, { total: number; count: number }>();
      const byChannelMap = new Map<string, { total: number; count: number }>();
      const byMethodMap = new Map<string, { total: number; count: number }>();
      const productosMap = new Map<string, number>();

      for (const order of facturableOrders) {
        const day = dayFormatter.format(order.createdAt);
        const amount = Number(order.total);

        const dayEntry = byDayMap.get(day) ?? { total: 0, count: 0 };
        dayEntry.total += amount;
        dayEntry.count += 1;
        byDayMap.set(day, dayEntry);

        const channelLabel = CHANNEL_LABELS[order.channel] ?? order.channel;
        const channelEntry = byChannelMap.get(channelLabel) ?? { total: 0, count: 0 };
        channelEntry.total += amount;
        channelEntry.count += 1;
        byChannelMap.set(channelLabel, channelEntry);
      }

      for (const order of orders) {
        const methodLabel = PAYMENT_METHOD_LABELS[order.method] ?? order.method;
        const methodEntry = byMethodMap.get(methodLabel) ?? { total: 0, count: 0 };
        methodEntry.total += Number(order.total);
        methodEntry.count += 1;
        byMethodMap.set(methodLabel, methodEntry);

        for (const item of order.items) {
          const name = item.product?.name ?? item.promotion?.name;
          if (!name) continue;
          productosMap.set(name, (productosMap.get(name) ?? 0) + item.quantity);
        }
      }

      // El total final (order.total) ya viene con el descuento aplicado, no
      // se guarda el subtotal previo — se reconstruye acá para saber cuánta
      // plata representó cada descuento (mismo criterio que el Dashboard).
      function discountAmount(order: (typeof orders)[number]): number {
        const orderTotal = Number(order.total);
        const value = Number(order.discountValue);
        if (order.discountType === "MONTO_FIJO") return value;
        if (value >= 100) return orderTotal;
        const subtotal = orderTotal / (1 - value / 100);
        return subtotal - orderTotal;
      }

      const discountedOrders = orders.filter((o) => o.discountValue != null);
      const byEmployeeMap = new Map<string, { employeeName: string; count: number; total: number }>();
      for (const order of discountedOrders) {
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
        total,
        count: facturableOrders.length,
        byDay: Array.from(byDayMap.entries())
          .map(([date, data]) => ({ date, ...data }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        byChannel: Array.from(byChannelMap.entries()).map(([channel, data]) => ({
          channel,
          ...data,
        })),
        byMethod: Array.from(byMethodMap.entries()).map(([method, data]) => ({
          method,
          ...data,
        })),
        productosMasVendidos: Array.from(productosMap.entries())
          .map(([name, quantity]) => ({ name, quantity }))
          .sort((a, b) => b.quantity - a.quantity),
        descuentos: {
          total: discountedOrders.reduce((acc, o) => acc + discountAmount(o), 0),
          count: discountedOrders.length,
          porVendedor: Array.from(byEmployeeMap.values()).sort((a, b) => b.total - a.total),
        },
        pedidos: orders.map((order) => ({
          id: order.id,
          createdAt: order.createdAt,
          customerName: `${order.customer.firstName} ${order.customer.lastName}`.trim() || "Sin nombre",
          channel: CHANNEL_LABELS[order.channel] ?? order.channel,
          method: PAYMENT_METHOD_LABELS[order.method] ?? order.method,
          total: Number(order.total),
          itemsSummary: order.items
            .map((item) => `${item.quantity}x ${item.product?.name ?? item.promotion?.name ?? "?"}`)
            .join(", "),
        })),
      };
    }),
});
