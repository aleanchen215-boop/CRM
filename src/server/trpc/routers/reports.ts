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

// Mismo formato que arma resolveOrderItem (create-order.ts) y que ya lee la
// pantalla de Ventas (ver ventas/[id]/page.tsx) — acá se usa para saber
// exactamente qué sabor quedó vendido dentro de una promo (el top 5 por
// sabor no se puede sacar de PromotionItem: eso es la definición actual de
// la promo, no lo que el cliente eligió en cada pedido puntual).
type PromoSelection =
  | { type: "FIJO"; productId: string | null; nombre: string; cantidad: number }
  | { type: "VARIABLE"; categoria: string; productos: { productId: string; nombre: string }[] };

function parsePromoSelections(raw: unknown): PromoSelection[] {
  return Array.isArray(raw) ? (raw as PromoSelection[]) : [];
}

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

      // Para resolver a qué categoría pertenece cada sabor dentro de una
      // promo (top 5) se mira el producto directo, no el campo `categoria`
      // que quedó guardado en `selections` — en pedidos viejos ese campo a
      // veces quedó vacío (bug de una versión anterior al armar la promo),
      // así que confiar en el productId de cada elección es más seguro.
      const allProducts = await ctx.prisma.product.findMany({
        select: { id: true, category: { select: { name: true } } },
      });
      const productCategoryById = new Map(allProducts.map((p) => [p.id, p.category?.name]));

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
              selections: true,
              product: { select: { name: true, category: { select: { name: true } } } },
              promotion: {
                select: {
                  name: true,
                  items: {
                    select: {
                      kind: true,
                      quantity: true,
                      productId: true,
                      category: { select: { name: true } },
                      product: { select: { category: { select: { name: true } } } },
                    },
                  },
                },
              },
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
      // Pizzas y empanadas vendidas, contando también lo que viene de promos
      // (ej. "Docena de empanadas" = 12, "3 Muzzarellas" = 3 pizzas) — igual
      // que la facturación, Cuenta Corriente queda afuera: no es una venta
      // real todavía (se cobra/descuenta después), así que no suma acá.
      let pizzasTotal = 0;
      let empanadasTotal = 0;
      const pizzasByDayMap = new Map<string, number>();
      const empanadasByDayMap = new Map<string, number>();
      // Top 5 por sabor puntual (ej. "Muzzarella", "Jamón y queso") — a
      // diferencia de pizzasTotal/empanadasTotal (categoría entera), esto
      // agrupa por producto real, tanto suelto como dentro de una promo.
      const pizzaFlavorMap = new Map<string, number>();
      const empanadaFlavorMap = new Map<string, number>();

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
      }

      for (const order of facturableOrders) {
        const day = dayFormatter.format(order.createdAt);

        for (const item of order.items) {
          const name = item.product?.name ?? item.promotion?.name;
          if (name) {
            productosMap.set(name, (productosMap.get(name) ?? 0) + item.quantity);
          }

          // Renglón de producto suelto (pizza entera o media/media — ambas
          // apuntan a un Product real vía productId, la mitad y mitad
          // igual consume/representa una pizza física por unidad, atribuida
          // entera al primer sabor — mismo criterio que el descuento de
          // stock, ver resolveOrderItem).
          if (item.product) {
            const categoryName = item.product.category?.name;
            if (categoryName === "Pizzas") {
              pizzasTotal += item.quantity;
              pizzasByDayMap.set(day, (pizzasByDayMap.get(day) ?? 0) + item.quantity);
              pizzaFlavorMap.set(item.product.name, (pizzaFlavorMap.get(item.product.name) ?? 0) + item.quantity);
            } else if (categoryName === "Empanadas") {
              empanadasTotal += item.quantity;
              empanadasByDayMap.set(day, (empanadasByDayMap.get(day) ?? 0) + item.quantity);
              empanadaFlavorMap.set(
                item.product.name,
                (empanadaFlavorMap.get(item.product.name) ?? 0) + item.quantity,
              );
            }
            continue;
          }

          // Renglón de promo: el total por categoría sale de PromotionItem
          // (FIJO mira la categoría del producto puntual, VARIABLE ya trae
          // la categoría directo). Para el top 5 por sabor hace falta algo
          // más fino — ahí sí hay que mirar `selections`, que es lo único
          // que registra QUÉ sabor puntual eligió el cliente en ese pedido.
          if (item.promotion) {
            for (const promoItem of item.promotion.items) {
              const categoryName =
                promoItem.kind === "VARIABLE" ? promoItem.category?.name : promoItem.product?.category?.name;
              const qty = promoItem.quantity * item.quantity;
              if (categoryName === "Pizzas") {
                pizzasTotal += qty;
                pizzasByDayMap.set(day, (pizzasByDayMap.get(day) ?? 0) + qty);
              } else if (categoryName === "Empanadas") {
                empanadasTotal += qty;
                empanadasByDayMap.set(day, (empanadasByDayMap.get(day) ?? 0) + qty);
              }
            }

            for (const selection of parsePromoSelections(item.selections)) {
              if (selection.type === "FIJO") {
                const categoryName = selection.productId ? productCategoryById.get(selection.productId) : undefined;
                const qty = selection.cantidad * item.quantity;
                if (categoryName === "Pizzas") {
                  pizzaFlavorMap.set(selection.nombre, (pizzaFlavorMap.get(selection.nombre) ?? 0) + qty);
                } else if (categoryName === "Empanadas") {
                  empanadaFlavorMap.set(selection.nombre, (empanadaFlavorMap.get(selection.nombre) ?? 0) + qty);
                }
              } else {
                const qty = item.quantity;
                for (const producto of selection.productos) {
                  const categoryName = productCategoryById.get(producto.productId);
                  if (categoryName === "Pizzas") {
                    pizzaFlavorMap.set(producto.nombre, (pizzaFlavorMap.get(producto.nombre) ?? 0) + qty);
                  } else if (categoryName === "Empanadas") {
                    empanadaFlavorMap.set(producto.nombre, (empanadaFlavorMap.get(producto.nombre) ?? 0) + qty);
                  }
                }
              }
            }
          }
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
        pizzas: {
          total: pizzasTotal,
          byDay: Array.from(pizzasByDayMap.entries())
            .map(([date, quantity]) => ({ date, quantity }))
            .sort((a, b) => a.date.localeCompare(b.date)),
          top5: Array.from(pizzaFlavorMap.entries())
            .map(([name, quantity]) => ({ name, quantity }))
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 5),
        },
        empanadas: {
          total: empanadasTotal,
          byDay: Array.from(empanadasByDayMap.entries())
            .map(([date, quantity]) => ({ date, quantity }))
            .sort((a, b) => a.date.localeCompare(b.date)),
          top5: Array.from(empanadaFlavorMap.entries())
            .map(([name, quantity]) => ({ name, quantity }))
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 5),
        },
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
