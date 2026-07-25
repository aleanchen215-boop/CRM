import { protectedProcedure, router } from "@/server/trpc/trpc";

export const sucursalesRouter = router({
  // Cualquier usuario logueado puede listarlas (para el selector de
  // sucursal arriba, o para elegir a cuál pertenece un pedido/insumo
  // nuevo) — no hay nada sensible en nombre/slug.
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.sucursal.findMany({ orderBy: { name: "asc" } });
  }),
});
