import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sendMessageInputSchema } from "@/lib/validation/conversation";
import { sendWhatsappTextMessage } from "@/server/integrations/whatsapp/client";
import { requirePermission, router } from "@/server/trpc/trpc";

export const conversationsRouter = router({
  list: requirePermission("conversations:read").query(async ({ ctx }) => {
    return ctx.prisma.conversation.findMany({
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
        data: { lastMessageAt: new Date() },
      });

      return message;
    }),
});
