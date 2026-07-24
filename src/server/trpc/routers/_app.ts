import { router } from "@/server/trpc/trpc";
import { systemRouter } from "@/server/trpc/routers/system";
import { customersRouter } from "@/server/trpc/routers/customers";
import { productsRouter } from "@/server/trpc/routers/products";
import { promotionsRouter } from "@/server/trpc/routers/promotions";
import { suppliesRouter } from "@/server/trpc/routers/supplies";
import { ordersRouter } from "@/server/trpc/routers/orders";
import { conversationsRouter } from "@/server/trpc/routers/conversations";
import { aiRouter } from "@/server/trpc/routers/ai";

// Routers de dominio restantes (automations, reports, users) se suman acá
// a medida que se implementan en las siguientes fases.
export const appRouter = router({
  system: systemRouter,
  customers: customersRouter,
  products: productsRouter,
  promotions: promotionsRouter,
  supplies: suppliesRouter,
  orders: ordersRouter,
  conversations: conversationsRouter,
  ai: aiRouter,
});

export type AppRouter = typeof appRouter;
