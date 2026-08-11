import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { customerInputSchema, customerUpdateSchema } from "@/lib/validation/customer";
import { requirePermission } from "@/server/trpc/trpc";
import { router } from "@/server/trpc/trpc";

function normalizeEmail(email?: string) {
  return email && email.length > 0 ? email : undefined;
}

export const customersRouter = router({
  list: requirePermission("customers:read")
    .input(
      z.object({
        search: z.string().trim().optional(),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where = input.search
        ? {
            OR: [
              { firstName: { contains: input.search, mode: "insensitive" as const } },
              { lastName: { contains: input.search, mode: "insensitive" as const } },
              { whatsapp: { contains: input.search } },
              { email: { contains: input.search, mode: "insensitive" as const } },
            ],
          }
        : {};

      const [customers, lastClientMessages] = await Promise.all([
        ctx.prisma.customer.findMany({
          where,
          include: {
            tags: true,
            _count: { select: { orders: true } },
            orders: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
          },
        }),
        // No todo pedido por WhatsApp queda bien cargado como pedido a nombre
        // del cliente correcto (a veces se carga como mostrador/otro número)
        // — así que "última compra" no es solo el último Order, sino lo más
        // reciente entre el último pedido Y el último mensaje que ese
        // cliente mandó por WhatsApp, lo que haya pasado después.
        ctx.prisma.message.findMany({
          where: { sender: "CLIENTE" },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, conversation: { select: { customerId: true } } },
        }),
      ]);

      const lastMessageByCustomer = new Map<string, Date>();
      for (const message of lastClientMessages) {
        const customerId = message.conversation.customerId;
        if (!lastMessageByCustomer.has(customerId)) {
          lastMessageByCustomer.set(customerId, message.createdAt);
        }
      }

      // Ordenados por la última vez que pidieron (el que hace más que no
      // pide, más abajo) — no por fecha de alta, así arriba de la lista
      // queda quién está activo ahora mismo. Se ordena acá (no en la query)
      // porque no hay forma directa de pedirle a Prisma "ORDER BY el
      // createdAt más reciente de una relación".
      const sorted = customers
        .map(({ orders, ...customer }) => {
          const lastOrderAt = orders[0]?.createdAt ?? null;
          const lastMessageAt = lastMessageByCustomer.get(customer.id) ?? null;
          const lastOrderAtCombined =
            lastOrderAt && lastMessageAt
              ? lastOrderAt > lastMessageAt
                ? lastOrderAt
                : lastMessageAt
              : (lastOrderAt ?? lastMessageAt);
          return { ...customer, lastOrderAt: lastOrderAtCombined };
        })
        .sort((a, b) => {
          if (!a.lastOrderAt && !b.lastOrderAt) return 0;
          if (!a.lastOrderAt) return 1;
          if (!b.lastOrderAt) return -1;
          return b.lastOrderAt.getTime() - a.lastOrderAt.getTime();
        });

      return sorted.slice(0, input.limit);
    }),

  getById: requirePermission("customers:read")
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const customer = await ctx.prisma.customer.findUnique({
        where: { id: input.id },
        include: {
          tags: true,
          categories: { include: { category: true } },
          orders: { orderBy: { createdAt: "desc" }, take: 10 },
        },
      });

      if (!customer) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return customer;
    }),

  create: requirePermission("customers:write")
    .input(customerInputSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.customer.findUnique({
        where: { whatsapp: input.whatsapp },
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Ya existe un cliente con ese WhatsApp." });
      }

      return ctx.prisma.customer.create({
        data: { ...input, email: normalizeEmail(input.email) },
      });
    }),

  update: requirePermission("customers:write")
    .input(z.object({ id: z.string() }).merge(customerUpdateSchema))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.customer.update({
        where: { id },
        data: { ...data, email: normalizeEmail(data.email) },
      });
    }),

  addTag: requirePermission("customers:write")
    .input(z.object({ customerId: z.string(), tag: z.string().trim().min(1).max(40) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.customerTag.upsert({
        where: { customerId_tag: { customerId: input.customerId, tag: input.tag } },
        create: { customerId: input.customerId, tag: input.tag },
        update: {},
      });
    }),

  removeTag: requirePermission("customers:write")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.customerTag.delete({ where: { id: input.id } });
      return { ok: true };
    }),
});
