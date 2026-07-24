import { z } from "zod";
import { requirePermission, router } from "@/server/trpc/trpc";

export const aiRouter = router({
  getSettings: requirePermission("ai:configure").query(async ({ ctx }) => {
    return ctx.prisma.aiSettings.findFirst({ orderBy: { activeSince: "desc" } });
  }),

  updateSettings: requirePermission("ai:configure")
    .input(z.object({ systemPrompt: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const last = await ctx.prisma.aiSettings.findFirst({ orderBy: { version: "desc" } });
      return ctx.prisma.aiSettings.create({
        data: { version: (last?.version ?? 0) + 1, systemPrompt: input.systemPrompt },
      });
    }),
});
