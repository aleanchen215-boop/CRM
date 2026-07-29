import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sendMessageInputSchema } from "@/lib/validation/conversation";
import { sendWhatsappTextMessage } from "@/server/integrations/whatsapp/client";
import { requirePermission, router } from "@/server/trpc/trpc";
import { resolveSucursalFilter } from "@/server/trpc/sucursal";

export const conversationsRouter = router({
  // Las cerradas no aparecen en el inbox (no se borran de la base, solo se
  // ocultan de esta vista) — el historial sigue accesible por link directo
  // si hace falta consultarlo. Se filtra por sucursal: un usuario atado a
  // una (ej. VENDEDOR_ALMAFUERTE) solo ve las suyas; uno sin sucursal fija ve
  // la que haya elegido en el selector, o todas si no eligió ninguna.
  list: requirePermission("conversations:read")
    .input(z.object({ sucursalId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const sucursalId = resolveSucursalFilter(ctx.user, input?.sucursalId);
      return ctx.prisma.conversation.findMany({
        where: { status: { not: "CERRADA" }, ...(sucursalId ? { sucursalId } : {}) },
        orderBy: { lastMessageAt: "desc" },
        include: { customer: true, sucursal: true, _count: { select: { messages: true } } },
      });
    }),

  // Cuántas conversaciones quedaron en PENDIENTE (la IA se apagó porque
  // necesita que alguien del local la atienda a mano — reclamo, demora, o un
  // caso puntual como Johana/picada en Almafuerte) — se usa para el aviso
  // "!" en la barra de navegación, así se ve aunque no se esté parado en
  // Conversaciones.
  pendingCount: requirePermission("conversations:read")
    .input(z.object({ sucursalId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const sucursalId = resolveSucursalFilter(ctx.user, input?.sucursalId);
      return ctx.prisma.conversation.count({
        where: { status: "PENDIENTE", ...(sucursalId ? { sucursalId } : {}) },
      });
    }),

  getById: requirePermission("conversations:read")
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const conversation = await ctx.prisma.conversation.findUnique({
        where: { id: input.id },
        include: { customer: true, sucursal: true, messages: { orderBy: { createdAt: "asc" } } },
      });
      if (!conversation) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.sucursalId && conversation.sucursalId !== ctx.user.sucursalId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
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
        whatsappMessageId = await sendWhatsappTextMessage(
          conversation.customer.whatsapp,
          input.content,
          conversation.sucursalId,
        );
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
