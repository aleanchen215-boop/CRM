import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { requirePermission, router } from "@/server/trpc/trpc";
import type { Prisma } from "@/generated/prisma/client";

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
      const [ventasEfectivo, retirosAgg] = await Promise.all([
        getCashSalesTotal(ctx.prisma, sucursalId, turno.abiertoEn, now),
        ctx.prisma.retiroCaja.aggregate({ where: { turnoId: turno.id }, _sum: { monto: true } }),
      ]);
      const totalRetiros = Number(retirosAgg._sum.monto ?? 0);
      const montoEsperado = Number(turno.montoApertura) + ventasEfectivo - totalRetiros;
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
});
