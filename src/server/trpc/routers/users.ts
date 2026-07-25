import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { requirePermission, router } from "@/server/trpc/trpc";

const userRoleValues = [
  "ADMIN",
  "VENDEDOR",
  "DEPOSITO",
  "ATENCION",
  "SUPERVISOR",
  "CAJERO",
  "PRODUCTOR",
  "VENDEDOR_PARACAO",
  "VENDEDOR_ALMAFUERTE",
] as const;

export const usersRouter = router({
  list: requirePermission("users:manage").query(async ({ ctx }) => {
    return ctx.prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        role: true,
        active: true,
        sucursalId: true,
        sucursal: { select: { id: true, name: true } },
        createdAt: true,
      },
    });
  }),

  updateRole: requirePermission("users:manage")
    .input(z.object({ id: z.string(), role: z.enum(userRoleValues) }))
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No podés cambiar tu propio rol.",
        });
      }

      // VENDEDOR_PARACAO/VENDEDOR_ALMAFUERTE quedan atados a su sucursal
      // automáticamente (no depende de que el Admin también toque el
      // selector de sucursal aparte) — el resto de los roles no se toca acá.
      const slugByRole: Partial<Record<(typeof userRoleValues)[number], string>> = {
        VENDEDOR_PARACAO: "paracao",
        VENDEDOR_ALMAFUERTE: "almafuerte",
      };
      const slug = slugByRole[input.role];
      const sucursalId = slug
        ? (await ctx.prisma.sucursal.findUniqueOrThrow({ where: { slug } })).id
        : undefined;

      return ctx.prisma.user.update({
        where: { id: input.id },
        data: { role: input.role, ...(sucursalId ? { sucursalId } : {}) },
      });
    }),

  updateActive: requirePermission("users:manage")
    .input(z.object({ id: z.string(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No podés desactivar tu propia cuenta.",
        });
      }
      return ctx.prisma.user.update({
        where: { id: input.id },
        data: { active: input.active },
      });
    }),

  // Nulo = ve/opera en todas las sucursales (Admin, Productor, Supervisor).
  updateSucursal: requirePermission("users:manage")
    .input(z.object({ id: z.string(), sucursalId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.user.update({
        where: { id: input.id },
        data: { sucursalId: input.sucursalId },
      });
    }),
});
