import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { requirePermission, router } from "@/server/trpc/trpc";
import type { Prisma } from "@/generated/prisma/client";

// Mismo criterio de "día de negocio" que dashboard.ts/orders.ts: Argentina
// no tiene horario de verano, así que agrupar por fecha en esta zona
// alcanza sin armar rangos UTC.
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Argentina/Buenos_Aires",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

async function getCashSalesTotal(
  prisma: Prisma.TransactionClient,
  sucursalId: string,
  from: Date,
  to: Date,
): Promise<number> {
  const result = await prisma.order.aggregate({
    where: {
      sucursalId,
      method: "EFECTIVO",
      status: { not: "CANCELADO" },
      createdAt: { gte: from, lt: to },
    },
    _sum: { total: true },
  });
  return Number(result._sum.total ?? 0);
}

export const turnosRouter = router({
  // Turno abierto de la sucursal del usuario (Cajero) — o de la que se
  // pida si no está atado a una sola (Admin revisando otra sucursal).
  getActive: requirePermission("turnos:operate")
    .input(z.object({ sucursalId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const sucursalId = ctx.user.sucursalId ?? input?.sucursalId;
      if (!sucursalId) return null;
      const turno = await ctx.prisma.turno.findFirst({
        where: { sucursalId, cerradoEn: null },
        include: { sucursal: true, employee: { select: { name: true } } },
        orderBy: { abiertoEn: "desc" },
      });
      if (!turno) return null;
      return { ...turno, montoApertura: Number(turno.montoApertura) };
    }),

  // El monto de apertura sale siempre del cierre contado del turno
  // anterior de esa sucursal (nunca lo tipea el cajero) — 0 si es el
  // primer turno que se abre para esa sucursal.
  getNextOpeningAmount: requirePermission("turnos:operate")
    .input(z.object({ sucursalId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const sucursalId = ctx.user.sucursalId ?? input?.sucursalId;
      if (!sucursalId) return 0;
      const lastClosed = await ctx.prisma.turno.findFirst({
        where: { sucursalId, cerradoEn: { not: null } },
        orderBy: { cerradoEn: "desc" },
      });
      return lastClosed?.montoCierreContado != null ? Number(lastClosed.montoCierreContado) : 0;
    }),

  open: requirePermission("turnos:operate")
    .input(z.object({ tipo: z.enum(["MANANA", "NOCHE"]).optional(), sucursalId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const sucursalId = ctx.user.sucursalId ?? input.sucursalId;
      if (!sucursalId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tu cuenta no tiene una sucursal asignada — pedile a un administrador que te la asigne.",
        });
      }

      const existing = await ctx.prisma.turno.findFirst({ where: { sucursalId, cerradoEn: null } });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Ya hay un turno abierto en esta sucursal." });
      }

      const sucursal = await ctx.prisma.sucursal.findUniqueOrThrow({ where: { id: sucursalId } });
      // Paracao solo tiene turno noche; el resto (Almafuerte, y cualquier
      // sucursal futura) elige mañana o noche.
      if (sucursal.slug !== "paracao" && !input.tipo) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Elegí turno mañana o noche." });
      }
      const tipo = sucursal.slug === "paracao" ? "NOCHE" : input.tipo!;

      const lastClosed = await ctx.prisma.turno.findFirst({
        where: { sucursalId, cerradoEn: { not: null } },
        orderBy: { cerradoEn: "desc" },
      });
      const montoApertura = lastClosed?.montoCierreContado ?? 0;

      const turno = await ctx.prisma.turno.create({
        data: { sucursalId, tipo, employeeId: ctx.user.id, montoApertura },
        include: { sucursal: true },
      });
      return { ...turno, montoApertura: Number(turno.montoApertura) };
    }),

  // Se permite cerrar aunque el efectivo contado no coincida con lo
  // esperado — la diferencia queda registrada para que el Admin la vea en
  // Finanzas, no bloquea el cierre.
  close: requirePermission("turnos:operate")
    .input(z.object({ montoContado: z.coerce.number().min(0) }))
    .mutation(async ({ ctx, input }) => {
      const sucursalId = ctx.user.sucursalId;
      if (!sucursalId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tu cuenta no tiene una sucursal asignada." });
      }
      const turno = await ctx.prisma.turno.findFirst({ where: { sucursalId, cerradoEn: null } });
      if (!turno) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No hay un turno abierto para cerrar." });
      }

      const now = new Date();
      const [ventasEfectivo, retirosAgg, pagosCadeteAgg] = await Promise.all([
        getCashSalesTotal(ctx.prisma, sucursalId, turno.abiertoEn, now),
        ctx.prisma.retiroCaja.aggregate({ where: { turnoId: turno.id }, _sum: { monto: true } }),
        ctx.prisma.pagoCadete.aggregate({ where: { turnoId: turno.id }, _sum: { monto: true } }),
      ]);
      const totalRetiros = Number(retirosAgg._sum.monto ?? 0);
      const totalPagosCadete = Number(pagosCadeteAgg._sum.monto ?? 0);
      const montoEsperado = Number(turno.montoApertura) + ventasEfectivo - totalRetiros - totalPagosCadete;
      const diferencia = input.montoContado - montoEsperado;

      const closed = await ctx.prisma.turno.update({
        where: { id: turno.id },
        data: {
          cerradoEn: now,
          cerradoPorId: ctx.user.id,
          montoCierreContado: input.montoContado,
          montoCierreEsperado: montoEsperado,
          diferencia,
        },
      });
      return {
        ...closed,
        montoApertura: Number(closed.montoApertura),
        montoCierreContado: Number(closed.montoCierreContado),
        montoCierreEsperado: Number(closed.montoCierreEsperado),
        diferencia: Number(closed.diferencia),
      };
    }),

  createRetiro: requirePermission("turnos:operate")
    .input(z.object({ monto: z.coerce.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      const sucursalId = ctx.user.sucursalId;
      if (!sucursalId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tu cuenta no tiene una sucursal asignada." });
      }
      const turno = await ctx.prisma.turno.findFirst({ where: { sucursalId, cerradoEn: null } });
      if (!turno) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Abrí el turno antes de registrar un retiro." });
      }

      return ctx.prisma.retiroCaja.create({
        data: { turnoId: turno.id, sucursalId, employeeId: ctx.user.id, monto: input.monto },
      });
    }),

  // Pago en efectivo al cadete (ej. viáticos/comisión) — a diferencia de
  // createRetiro, esta plata no va a la caja fuerte, sale directo del
  // negocio. Igual resta del efectivo esperado al cierre del turno.
  createPagoCadete: requirePermission("turnos:operate")
    .input(z.object({ monto: z.coerce.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      const sucursalId = ctx.user.sucursalId;
      if (!sucursalId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tu cuenta no tiene una sucursal asignada." });
      }
      const turno = await ctx.prisma.turno.findFirst({ where: { sucursalId, cerradoEn: null } });
      if (!turno) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Abrí el turno antes de registrar un pago." });
      }

      return ctx.prisma.pagoCadete.create({
        data: { turnoId: turno.id, sucursalId, employeeId: ctx.user.id, monto: input.monto },
      });
    }),

  // --- Auditoría (solo Admin) ---
  listClosedTurnos: requirePermission("finanzas:audit")
    .input(z.object({ from: z.coerce.date(), to: z.coerce.date(), sucursalId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const toEnd = new Date(input.to);
      toEnd.setHours(23, 59, 59, 999);
      const turnos = await ctx.prisma.turno.findMany({
        where: {
          cerradoEn: { gte: input.from, lte: toEnd, not: null },
          ...(input.sucursalId ? { sucursalId: input.sucursalId } : {}),
        },
        include: {
          sucursal: true,
          employee: { select: { name: true } },
          cerradoPor: { select: { name: true } },
        },
        orderBy: { cerradoEn: "desc" },
      });
      return turnos.map((t) => ({
        ...t,
        montoApertura: Number(t.montoApertura),
        montoCierreContado: t.montoCierreContado != null ? Number(t.montoCierreContado) : null,
        montoCierreEsperado: t.montoCierreEsperado != null ? Number(t.montoCierreEsperado) : null,
        diferencia: t.diferencia != null ? Number(t.diferencia) : null,
      }));
    }),

  listRetiros: requirePermission("finanzas:audit")
    .input(z.object({ from: z.coerce.date(), to: z.coerce.date(), sucursalId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const toEnd = new Date(input.to);
      toEnd.setHours(23, 59, 59, 999);
      const retiros = await ctx.prisma.retiroCaja.findMany({
        where: {
          createdAt: { gte: input.from, lte: toEnd },
          ...(input.sucursalId ? { sucursalId: input.sucursalId } : {}),
        },
        include: { sucursal: true, employee: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      });
      return retiros.map((r) => ({ ...r, monto: Number(r.monto) }));
    }),

  // Pagos a cadete agrupados por día (huso Argentina) — a diferencia de
  // listRetiros, acá Finanzas quiere ver la salida diaria total, no un
  // listado plano de movimientos sueltos.
  listPagosCadete: requirePermission("finanzas:audit")
    .input(z.object({ from: z.coerce.date(), to: z.coerce.date(), sucursalId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const toEnd = new Date(input.to);
      toEnd.setHours(23, 59, 59, 999);
      const pagos = await ctx.prisma.pagoCadete.findMany({
        where: {
          createdAt: { gte: input.from, lte: toEnd },
          ...(input.sucursalId ? { sucursalId: input.sucursalId } : {}),
        },
        include: { sucursal: true, employee: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      });

      const groups = new Map<
        string,
        { date: string; total: number; pagos: { id: string; monto: number; createdAt: Date; sucursal: { name: string }; employee: { name: string } }[] }
      >();
      for (const pago of pagos) {
        const date = dayFormatter.format(pago.createdAt);
        const group = groups.get(date) ?? { date, total: 0, pagos: [] };
        group.total += Number(pago.monto);
        group.pagos.push({ ...pago, monto: Number(pago.monto) });
        groups.set(date, group);
      }

      return Array.from(groups.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
    }),

  // Saldo de la caja fuerte de cada sucursal: suma de sus retiros desde el
  // último "caja en 0" (o desde siempre, si nunca se reseteó). No se
  // borra ningún RetiroCaja — el historial de arriba sigue completo.
  listSaldosCajaFuerte: requirePermission("finanzas:audit").query(async ({ ctx }) => {
    const sucursales = await ctx.prisma.sucursal.findMany({ orderBy: { name: "asc" } });

    return Promise.all(
      sucursales.map(async (sucursal) => {
        const lastReset = await ctx.prisma.cajaFuerteReset.findFirst({
          where: { sucursalId: sucursal.id },
          orderBy: { createdAt: "desc" },
        });
        const agg = await ctx.prisma.retiroCaja.aggregate({
          where: {
            sucursalId: sucursal.id,
            ...(lastReset ? { createdAt: { gt: lastReset.createdAt } } : {}),
          },
          _sum: { monto: true },
        });
        return {
          sucursal,
          saldo: Number(agg._sum.monto ?? 0),
          resetEn: lastReset?.createdAt ?? null,
        };
      }),
    );
  }),

  resetCajaFuerte: requirePermission("finanzas:audit")
    .input(z.object({ sucursalId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.cajaFuerteReset.create({
        data: { sucursalId: input.sucursalId, employeeId: ctx.user.id },
      });
    }),
});
