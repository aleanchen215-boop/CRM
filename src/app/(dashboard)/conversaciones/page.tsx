"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { ConversationList } from "@/components/conversations/conversation-list";
import { MessageThread } from "@/components/conversations/message-thread";

export default function ConversacionesPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="flex h-[calc(100vh-8.5rem)] flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conversaciones</h1>
        <p className="text-sm text-muted-foreground">Inbox de WhatsApp.</p>
      </div>

      <Card className="flex flex-1 flex-row overflow-hidden p-0">
        <div className="w-72 shrink-0 overflow-y-auto border-r">
          <ConversationList selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        {selectedId ? (
          <MessageThread conversationId={selectedId} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Elegí una conversación para ver los mensajes.
          </div>
        )}
      </Card>
    </div>
  );
}
