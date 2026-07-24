import { protectedProcedure, publicProcedure, router } from "@/server/trpc/trpc";

export const systemRouter = router({
  health: publicProcedure.query(() => ({ ok: true as const })),
  me: protectedProcedure.query(({ ctx }) => ctx.user),
});
