import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sendMessageInputSchema } from "@/lib/validation/conversation";
import { sendWhatsappTextMessage } from "@/server/integrations/whatsapp/client";
import { requirePermission, router } from "@/server/trpc/trpc";

export const conversationsRouter = router({
  // Las cerradas no aparecen en el inbox (no se borran de la base, solo se
  // ocultan de esta vista) — el historial sigue accesible por link directo
  // si hace falta consultarlo.
  list: requirePermission("conversations:read").query(async ({ ctx }) => {
    return ctx.prisma.conversation.findMany({
      where: { status: { not: "CERRADA" } },
      orderBy: { lastMessageAt: "desc" },
      include: { customer: true, _count: { select: { messages: true } } },
    });
  }),

  getById: requirePermission("conversations:read")
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const conversation = await ctx.prisma.conversation.findUnique({
        where: { id: input.id },
        include: { customer: true, messages: { orderBy: { createdAt: "asc" } } },
      });
      if (!conversation) throw new TRPCError({ code: "NOT_FOUND" });
      return conversation;
    }),

  sendMessage: requirePermission("conversations:write")
    .input(sendMessageInputSchema)
    .mutation(async ({ ctx, input }) => {
      const conversation = await ctx.prisma.conversation.findUnique({
        where: { id: input.conversationId },
        include: { customer: true },
      });
      if (!conversation) throw new TRPCError({ code: "NOT_FOUND" });

      let whatsappMessageId: string;
      try {
        whatsappMessageId = await sendWhatsappTextMessage(conversation.customer.whatsapp, input.content);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "No se pudo enviar el mensaje.",
        });
      }

      const message = await ctx.prisma.message.create({
        data: {
          conversationId: conversation.id,
          sender: "EMPLEADO",
          content: input.content,
          type: "TEXTO",
          whatsappMessageId: whatsappMessageId || undefined,
        },
      });

      await ctx.prisma.conversation.update({
        where: { id: conversation.id },
        // Si un empleado escribe manualmente, asumimos que tomó la conversación:
        // se apaga la IA para que no le pise la respuesta al cliente.
        data: { lastMessageAt: new Date(), aiActive: false },
      });

      return message;
    }),

  setAiActive: requirePermission("conversations:write")
    .input(z.object({ conversationId: z.string(), aiActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.conversation.update({
        where: { id: input.conversationId },
        data: { aiActive: input.aiActive },
      });
    }),

  close: requirePermission("conversations:write")
    .input(z.object({ conversationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.conversation.update({
        where: { id: input.conversationId },
        data: { status: "CERRADA" },
      });
    }),
});
