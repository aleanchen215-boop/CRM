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
  TRANSFERENCIA: "Mercado Pago (link)",
  OTRO: "Otro",
  PREPAGO: "Prepago",
  VISA: "Visa",
  PAYWAY: "Payway",
};

const CHANNEL_LABELS: Record<string, string> = {
  MOSTRADOR: "Mostrador",
  DELIVERY: "Delivery",
  APPS: "Apps",
};

export const reportsRouter = router({
  // Totales de ventas por día/canal/método de pago, sobre pedidos entregados
  // (mismo criterio que el Dashboard: una venta "cuenta" cuando se entregó).
  ventas: requirePermission("reports:read")
    .input(
      z.object({
        from: z.coerce.date(),
        to: z.coerce.date(),
        sucursalId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // El "to" se interpreta inclusive hasta el final de ese día.
      const toEndOfDay = new Date(input.to);
      toEndOfDay.setHours(23, 59, 59, 999);
      const sucursalId = resolveSucursalFilter(ctx.user, input.sucursalId);

      const orders = await ctx.prisma.order.findMany({
        where: {
          status: "ENTREGADO",
          createdAt: { gte: input.from, lte: toEndOfDay },
          ...(sucursalId ? { sucursalId } : {}),
        },
        select: { total: true, method: true, channel: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });

      const total = orders.reduce((acc, o) => acc + Number(o.total), 0);

      const byDayMap = new Map<string, { total: number; count: number }>();
      const byChannelMap = new Map<string, { total: number; count: number }>();
      const byMethodMap = new Map<string, { total: number; count: number }>();

      for (const order of orders) {
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

        const methodLabel = PAYMENT_METHOD_LABELS[order.method] ?? order.method;
        const methodEntry = byMethodMap.get(methodLabel) ?? { total: 0, count: 0 };
        methodEntry.total += amount;
        methodEntry.count += 1;
        byMethodMap.set(methodLabel, methodEntry);
      }

      return {
        total,
        count: orders.length,
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
      };
    }),
});
