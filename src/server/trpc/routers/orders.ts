import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { orderInputSchema, orderStatusUpdateSchema } from "@/lib/validation/order";
import { requirePermission, router } from "@/server/trpc/trpc";
import { sendWhatsappTextMessage } from "@/server/integrations/whatsapp/client";
import { createOrder } from "@/server/orders/create-order";

function toNumber<T extends { total: unknown }>(order: T) {
  return { ...order, total: Number(order.total) };
}

const NOTIFICATION_MESSAGES = {
  LISTO: "¡Hola! Tu pedido ya está listo para retirar por el local. Te esperamos 😊",
  EN_CAMINO: "¡Hola! Tu pedido ya salió con el cadete, en breve llega a tu casa 🛵",
} as const;

export const ordersRouter = router({
  // Los cancelados y los ya entregados no aparecen en el tablero de ventas
  // (quedan afuera de la vista, no se borran de la base) — el detalle sigue
  // accesible por link directo, y lo entregado pasa a contar en el
  // Dashboard/Reportes en vez de seguir ocupando la vista de "en curso".
  list: requirePermission("orders:read").query(async ({ ctx }) => {
    const orders = await ctx.prisma.order.findMany({
      where: { status: { notIn: ["CANCELADO", "ENTREGADO"] } },
      orderBy: { createdAt: "desc" },
      include: {
        customer: true,
        _count: { select: { items: true } },
        payments: { select: { status: true } },
      },
    });
    return orders.map(toNumber);
  }),

  getById: requirePermission("orders:read")
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const order = await ctx.prisma.order.findUnique({
        where: { id: input.id },
        include: {
          customer: true,
          items: { include: { product: true, promotion: true } },
          invoice: true,
          payments: true,
        },
      });
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });

      return {
        ...toNumber(order),
        items: order.items.map((item) => ({ ...item, unitPrice: Number(item.unitPrice) })),
      };
    }),

  create: requirePermission("orders:write")
    .input(orderInputSchema)
    .mutation(async ({ ctx, input }) => {
      const order = await createOrder({ ...input, employeeId: ctx.user.id });
      return toNumber(order);
    }),

  updateStatus: requirePermission("orders:write")
    .input(orderStatusUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.prisma.order.findUnique({ where: { id: input.id } });
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });

      const order = await ctx.prisma.order.update({
        where: { id: input.id },
        data: { status: input.status },
      });

      return toNumber(order);
    }),

  cancel: requirePermission("orders:cancel")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.prisma.order.findUnique({ where: { id: input.id } });
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });

      const order = await ctx.prisma.order.update({
        where: { id: input.id },
        data: { status: "CANCELADO" },
      });

      return toNumber(order);
    }),

  notifyStatus: requirePermission("orders:write")
    .input(z.object({ orderId: z.string(), kind: z.enum(["LISTO", "EN_CAMINO"]) }))
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.prisma.order.findUnique({
        where: { id: input.orderId },
        include: { customer: true },
      });
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });

      const content = NOTIFICATION_MESSAGES[input.kind];

      let whatsappMessageId: string;
      try {
        whatsappMessageId = await sendWhatsappTextMessage(order.customer.whatsapp, content);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "No se pudo enviar el WhatsApp.",
        });
      }

      let conversation = await ctx.prisma.conversation.findFirst({
        where: { customerId: order.customerId, status: { not: "CERRADA" } },
        orderBy: { lastMessageAt: "desc" },
      });
      if (!conversation) {
        conversation = await ctx.prisma.conversation.create({
          data: { customerId: order.customerId, status: "ABIERTA", aiActive: true },
        });
      }

      await ctx.prisma.message.create({
        data: {
          conversationId: conversation.id,
          sender: "IA",
          content,
          type: "TEXTO",
          approved: true,
          whatsappMessageId: whatsappMessageId || undefined,
        },
      });
      await ctx.prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      });

      return { ok: true };
    }),
});
