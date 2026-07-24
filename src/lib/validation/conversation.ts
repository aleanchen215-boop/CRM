import { z } from "zod";

export const sendMessageInputSchema = z.object({
  conversationId: z.string(),
  content: z.string().trim().min(1, "Escribí un mensaje"),
});

export type SendMessageInput = z.infer<typeof sendMessageInputSchema>;
