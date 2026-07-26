"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Bot, Send, TriangleAlert, UserCog, X } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConversationStatusBadge } from "@/components/conversations/conversation-status-badge";

function senderLabel(sender: string, customerName: string) {
  if (sender === "EMPLEADO") return "Vos";
  if (sender === "IA") return "IA";
  return customerName;
}

export function MessageThread({ conversationId }: { conversationId: string }) {
  const [draft, setDraft] = useState("");
  const utils = trpc.useUtils();

  const { data: conversation, isLoading } = trpc.conversations.getById.useQuery(
    { id: conversationId },
    { refetchInterval: 5000 },
  );

  const sendMessage = trpc.conversations.sendMessage.useMutation({
    onSuccess: async () => {
      setDraft("");
      await Promise.all([
        utils.conversations.getById.invalidate({ id: conversationId }),
        utils.conversations.list.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  const setAiActive = trpc.conversations.setAiActive.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.conversations.getById.invalidate({ id: conversationId }),
        utils.conversations.list.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  const closeConversation = trpc.conversations.close.useMutation({
    onSuccess: async () => {
      toast.success("Conversación cerrada");
      await Promise.all([
        utils.conversations.getById.invalidate({ id: conversationId }),
        utils.conversations.list.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;
    sendMessage.mutate({ conversationId, content });
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-3 p-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-10 w-1/2 self-end" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Conversación no encontrada.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {conversation.status === "PENDIENTE" && (
        <div className="flex items-center gap-2 border-b bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-400">
          <TriangleAlert className="size-4 shrink-0" />
          La IA derivó esta conversación (reclamo o consulta que no pudo resolver sola) — respondé vos directamente, la IA está apagada acá.
        </div>
      )}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="font-medium">
            {conversation.customer.firstName} {conversation.customer.lastName}
          </p>
          <p className="text-xs text-muted-foreground">{conversation.customer.whatsapp}</p>
        </div>
        <div className="flex items-center gap-2">
          <ConversationStatusBadge status={conversation.status} />
          <Button
            type="button"
            size="sm"
            variant={conversation.aiActive ? "outline" : "default"}
            disabled={setAiActive.isPending}
            onClick={() =>
              setAiActive.mutate({ conversationId, aiActive: !conversation.aiActive })
            }
          >
            {conversation.aiActive ? (
              <>
                <UserCog />
                Atender yo
              </>
            ) : (
              <>
                <Bot />
                Reactivar IA
              </>
            )}
          </Button>
          {conversation.status !== "CERRADA" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={closeConversation.isPending}
              onClick={() => {
                if (window.confirm("¿Cerrar esta conversación? El próximo mensaje del cliente va a arrancar una conversación nueva.")) {
                  closeConversation.mutate({ conversationId });
                }
              }}
            >
              <X />
              Cerrar conversación
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        {conversation.messages.length === 0 && (
          <p className="text-sm text-muted-foreground">Todavía no hay mensajes.</p>
        )}
        {conversation.messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "max-w-[75%] rounded-lg px-3 py-2 text-sm",
              message.sender === "CLIENTE"
                ? "self-start bg-muted"
                : message.sender === "IA"
                  ? "self-end bg-secondary text-secondary-foreground"
                  : "self-end bg-primary text-primary-foreground",
            )}
          >
            <p>{message.content}</p>
            <p
              className={cn(
                "mt-1 text-[10px] opacity-70",
                message.sender === "CLIENTE" || message.sender === "IA"
                  ? "text-muted-foreground"
                  : "text-primary-foreground",
              )}
            >
              {senderLabel(message.sender, conversation.customer.firstName)} ·{" "}
              {new Date(message.createdAt).toLocaleTimeString("es-AR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t p-3">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Escribir un mensaje…"
          disabled={sendMessage.isPending}
        />
        <Button type="submit" size="icon" disabled={sendMessage.isPending || !draft.trim()}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
