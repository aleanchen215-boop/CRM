"use client";

import { useRef } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

export default function IaPage() {
  const utils = trpc.useUtils();
  const { data: settings, isLoading } = trpc.ai.getSettings.useQuery();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const update = trpc.ai.updateSettings.useMutation({
    onSuccess: async () => {
      await utils.ai.getSettings.invalidate();
      toast.success("Comportamiento actualizado");
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">IA</h1>
        <p className="text-sm text-muted-foreground">
          Configuración del asistente que responde WhatsApp.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base font-medium">Comportamiento</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            // key fuerza a remontar el textarea (no controlado) apenas llega
            // el valor guardado, para no necesitar un efecto que haga setState.
            <Textarea
              key={settings?.id ?? "default"}
              ref={textareaRef}
              defaultValue={settings?.systemPrompt}
              rows={12}
              className="font-mono text-sm"
            />
          )}
          <p className="text-xs text-muted-foreground">
            Versión actual: {settings?.version ?? "sin guardar todavía (usa el comportamiento por defecto)"}
          </p>
          <Button
            onClick={() => {
              const value = textareaRef.current?.value.trim();
              if (value) update.mutate({ systemPrompt: value });
            }}
            disabled={update.isPending}
            className="self-end"
          >
            {update.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
