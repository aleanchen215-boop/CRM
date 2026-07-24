import { router } from "@/server/trpc/trpc";
import { systemRouter } from "@/server/trpc/routers/system";

// Routers de dominio (customers, conversations, products, orders, ai,
// automations, reports, users) se suman acá a medida que se implementan
// en las siguientes fases.
export const appRouter = router({
  system: systemRouter,
});

export type AppRouter = typeof appRouter;
