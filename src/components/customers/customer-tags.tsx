"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CustomerTags({
  customerId,
  tags,
}: {
  customerId: string;
  tags: { id: string; tag: string }[];
}) {
  const [value, setValue] = useState("");
  const utils = trpc.useUtils();

  const addTag = trpc.customers.addTag.useMutation({
    onSuccess: async () => {
      await utils.customers.getById.invalidate({ id: customerId });
      setValue("");
    },
    onError: (error) => toast.error(error.message),
  });

  const removeTag = trpc.customers.removeTag.useMutation({
    onSuccess: async () => {
      await utils.customers.getById.invalidate({ id: customerId });
    },
    onError: (error) => toast.error(error.message),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const tag = value.trim();
    if (!tag) return;
    addTag.mutate({ customerId, tag });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {tags.length === 0 && (
          <p className="text-sm text-muted-foreground">Sin etiquetas todavía.</p>
        )}
        {tags.map((tag) => (
          <Badge key={tag.id} variant="secondary" className="gap-1 pr-1">
            {tag.tag}
            <button
              type="button"
              onClick={() => removeTag.mutate({ id: tag.id })}
              className="rounded-full p-0.5 hover:bg-muted-foreground/20"
              aria-label={`Quitar etiqueta ${tag.tag}`}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Nueva etiqueta…"
          className="h-8 max-w-[200px]"
        />
        <Button type="submit" size="sm" variant="outline" disabled={addTag.isPending}>
          Agregar
        </Button>
      </form>
    </div>
  );
}
