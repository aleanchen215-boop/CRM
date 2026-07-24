import { router } from "@/server/trpc/trpc";
import { systemRouter } from "@/server/trpc/routers/system";
import { customersRouter } from "@/server/trpc/routers/customers";
import { productsRouter } from "@/server/trpc/routers/products";
import { suppliesRouter } from "@/server/trpc/routers/supplies";
import { ordersRouter } from "@/server/trpc/routers/orders";

// Routers de dominio restantes (conversations, ai, automations, reports,
// users) se suman acá a medida que se implementan en las siguientes fases.
export const appRouter = router({
  system: systemRouter,
  customers: customersRouter,
  products: productsRouter,
  supplies: suppliesRouter,
  orders: ordersRouter,
});

export type AppRouter = typeof appRouter;
