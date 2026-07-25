"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function MissingSupplies() {
  const [text, setText] = useState("");
  const utils = trpc.useUtils();

  const { data: items, isLoading } = trpc.supplies.missingList.useQuery();

  const create = trpc.supplies.missingCreate.useMutation({
    onSuccess: async () => {
      setText("");
      await utils.supplies.missingList.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const resolve = trpc.supplies.missingResolve.useMutation({
    onSuccess: async () => {
      await utils.supplies.missingList.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    create.mutate({ text: value });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Insumos faltantes</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Input
            placeholder="Ej: bolsas de muzzarella, cajas para empanadas…"
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={create.isPending}
          />
          <Button type="submit" size="icon" disabled={create.isPending || !text.trim()}>
            <Plus />
          </Button>
        </form>

        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {!isLoading && items?.length === 0 && (
          <p className="text-sm text-muted-foreground">No hay nada anotado como faltante.</p>
        )}
        {items && items.length > 0 && (
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <span>{item.text}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate({ id: item.id })}
                >
                  <Check />
                  Recibido
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
