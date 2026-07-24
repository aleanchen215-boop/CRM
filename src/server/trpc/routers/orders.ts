import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { orderInputSchema, orderStatusUpdateSchema, type OrderInput } from "@/lib/validation/order";
import { requirePermission, router } from "@/server/trpc/trpc";
import { sendWhatsappTextMessage } from "@/server/integrations/whatsapp/client";

function toNumber<T extends { total: unknown }>(order: T) {
  return { ...order, total: Number(order.total) };
}

const NOTIFICATION_MESSAGES = {
  LISTO: "¡Hola! Tu pedido ya está listo para retirar por el local. Te esperamos 😊",
  EN_CAMINO: "¡Hola! Tu pedido ya salió con el cadete, en breve llega a tu casa 🛵",
} as const;

type OrderItemInput = OrderInput["items"][number];

async function resolveOrderItem(
  tx: Prisma.TransactionClient,
  item: OrderItemInput,
): Promise<{ data: Prisma.OrderItemCreateManyOrderInput; price: number }> {
  if (item.kind === "PRODUCTO") {
    const product = await tx.product.findUnique({ where: { id: item.productId } });
    if (!product) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Producto no encontrado." });
    }
    return {
      data: { productId: product.id, quantity: item.quantity, unitPrice: product.price },
      price: Number(product.price) * item.quantity,
    };
  }

  const promotion = await tx.promotion.findUnique({
    where: { id: item.promotionId },
    include: { items: { include: { product: true, category: true } } },
  });
  if (!promotion) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Promoción no encontrada." });
  }

  const selections: Array<Record<string, unknown>> = [];

  for (const promoItem of promotion.items) {
    if (promoItem.kind === "FIJO") {
      selections.push({
        type: "FIJO",
        productId: promoItem.productId,
        nombre: promoItem.product?.name ?? "Producto",
        cantidad: promoItem.quantity,
      });
      continue;
    }

    const selection = item.variableSelections.find((s) => s.promotionItemId === promoItem.id);
    if (!selection || selection.productIds.length !== promoItem.quantity) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Faltan elegir ${promoItem.quantity} unidad(es) de "${promoItem.category?.name ?? "una categoría"}" en la promo "${promotion.name}".`,
      });
    }

    const chosenProducts = await tx.product.findMany({
      where: { id: { in: selection.productIds } },
    });
    if (chosenProducts.length !== selection.productIds.length) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Producto elegido no encontrado." });
    }
    const invalid = chosenProducts.find((product) => product.categoryId !== promoItem.categoryId);
    if (invalid) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `"${invalid.name}" no pertenece a la categoría "${promoItem.category?.name ?? ""}" que pide la promo.`,
      });
    }

    selections.push({
      type: "VARIABLE",
      categoria: promoItem.category?.name ?? "",
      productos: selection.productIds.map((id) => ({
        productId: id,
        nombre: chosenProducts.find((p) => p.id === id)?.name ?? "",
      })),
    });
  }

  return {
    data: {
      promotionId: promotion.id,
      quantity: 1,
      unitPrice: promotion.price,
      selections: selections as Prisma.InputJsonValue,
    },
    price: Number(promotion.price),
  };
}

export const ordersRouter = router({
  list: requirePermission("orders:read").query(async ({ ctx }) => {
    const orders = await ctx.prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      include: { customer: true, _count: { select: { items: true } } },
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
      const order = await ctx.prisma.$transaction(async (tx) => {
        let total = 0;
        const itemsData: Prisma.OrderItemCreateManyOrderInput[] = [];

        for (const item of input.items) {
          const resolved = await resolveOrderItem(tx, item);
          total += resolved.price;
          itemsData.push(resolved.data);
        }

        return tx.order.create({
          data: {
            customerId: input.customerId,
            method: input.method,
            channel: input.channel,
            channelSource: input.channel === "APPS" ? input.channelSource : undefined,
            status: "PENDIENTE",
            total,
            employeeId: ctx.user.id,
            items: { createMany: { data: itemsData } },
            invoice: { create: { type: "INTERNO", status: "EMITIDO" } },
          },
        });
      });

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
