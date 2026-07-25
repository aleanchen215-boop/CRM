import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { requirePermission, router } from "@/server/trpc/trpc";
import { createAdminClient } from "@/lib/supabase/admin";

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

// VENDEDOR_PARACAO/VENDEDOR_ALMAFUERTE quedan atados a su sucursal
// automáticamente — no depende de que el Admin también toque el selector de
// sucursal aparte al crear la cuenta o cambiarle el rol después.
const SUCURSAL_SLUG_BY_ROLE: Partial<Record<(typeof userRoleValues)[number], string>> = {
  VENDEDOR_PARACAO: "paracao",
  VENDEDOR_ALMAFUERTE: "almafuerte",
};

// Cuentas de staff sin email real: Supabase Auth igual exige un email con
// forma válida, así que se arma uno sintético a partir del username. Nunca
// se manda correo a este dominio, el login es siempre por username.
const STAFF_EMAIL_DOMAIN = "staff.crmparacao.internal";

async function resolveSucursalForRole(
  prisma: { sucursal: { findUniqueOrThrow: (args: { where: { slug: string } }) => Promise<{ id: string }> } },
  role: (typeof userRoleValues)[number],
): Promise<string | undefined> {
  const slug = SUCURSAL_SLUG_BY_ROLE[role];
  if (!slug) return undefined;
  return (await prisma.sucursal.findUniqueOrThrow({ where: { slug } })).id;
}

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

  // Alta de cuentas de staff sin email real (Cajero, Productor, Vendedor de
  // sucursal, etc.) — crea el usuario en Supabase Auth con un email
  // sintético + contraseña puesta por el Admin, y el registro en la tabla
  // users acá. Si falla la parte de Prisma, se borra la cuenta de Auth para
  // no dejar un usuario huérfano sin fila correspondiente.
  create: requirePermission("users:manage")
    .input(
      z.object({
        name: z.string().trim().min(1, "Requerido"),
        username: z
          .string()
          .trim()
          .toLowerCase()
          .min(3, "Mínimo 3 caracteres")
          .regex(/^[a-z0-9._-]+$/, "Solo letras, números, puntos, guiones y guiones bajos"),
        password: z.string().min(6, "Mínimo 6 caracteres"),
        role: z.enum(userRoleValues),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.user.findUnique({ where: { username: input.username } });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Ese nombre de usuario ya existe." });
      }

      const email = `${input.username}@${STAFF_EMAIL_DOMAIN}`;
      const admin = createAdminClient();
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: input.password,
        email_confirm: true,
      });
      if (error || !data.user) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "No se pudo crear la cuenta.",
        });
      }

      try {
        const sucursalId = await resolveSucursalForRole(ctx.prisma, input.role);
        return await ctx.prisma.user.create({
          data: {
            authId: data.user.id,
            email,
            username: input.username,
            name: input.name,
            role: input.role,
            sucursalId,
          },
        });
      } catch (err) {
        await admin.auth.admin.deleteUser(data.user.id).catch(() => {});
        throw err;
      }
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

      const sucursalId = await resolveSucursalForRole(ctx.prisma, input.role);

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
