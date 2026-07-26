"use client";

import { Bot } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { ConversationStatusBadge } from "@/components/conversations/conversation-status-badge";
import { useSucursalSelection } from "@/components/layout/sucursal-context";

export function ConversationList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { selectedSucursalId } = useSucursalSelection();
  const { data: conversations, isLoading } = trpc.conversations.list.useQuery(
    { sucursalId: selectedSucursalId },
    { refetchInterval: 5000 },
  );

  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">Cargando…</p>;
  }

  if (!conversations || conversations.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Todavía no hay conversaciones. Van a aparecer acá apenas llegue el primer mensaje de
        WhatsApp.
      </p>
    );
  }

  return (
    <div className="flex flex-col overflow-y-auto">
      {conversations.map((conversation) => (
        <button
          key={conversation.id}
          type="button"
          onClick={() => onSelect(conversation.id)}
          className={cn(
            "flex flex-col gap-1 border-b p-3 text-left text-sm transition-colors hover:bg-muted/50",
            selectedId === conversation.id && "bg-muted",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-medium">
              {conversation.aiActive && (
                <Bot className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              {conversation.customer.firstName} {conversation.customer.lastName}
              {conversation.status === "PENDIENTE" && (
                <span
                  title="La IA derivó esta conversación — hay que responder manualmente"
                  className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white"
                >
                  !
                </span>
              )}
            </span>
            <ConversationStatusBadge status={conversation.status} />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {conversation.customer.whatsapp}
              {!selectedSucursalId ? ` · ${conversation.sucursal.name}` : ""}
            </span>
            <span>{conversation._count.messages} mensaje{conversation._count.messages === 1 ? "" : "s"}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
