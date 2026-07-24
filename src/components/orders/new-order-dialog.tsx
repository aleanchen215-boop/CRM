"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Store, Bike, Smartphone } from "lucide-react";
import { salesChannelValues, appsSourceSuggestions } from "@/lib/validation/order";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { OrderForm } from "@/components/orders/order-form";

const CHANNEL_OPTIONS = [
  { value: "MOSTRADOR", label: "Mostrador", icon: Store },
  { value: "DELIVERY", label: "Delivery", icon: Bike },
  { value: "APPS", label: "Apps", icon: Smartphone },
] as const;

type Channel = (typeof salesChannelValues)[number];

function ChannelStep({ onSelect }: { onSelect: (channel: Channel, channelSource?: string) => void }) {
  const [appsSource, setAppsSource] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">¿De dónde viene el pedido?</p>
      <div className="grid grid-cols-3 gap-3">
        {CHANNEL_OPTIONS.filter((option) => option.value !== "APPS").map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            className="flex flex-col items-center gap-2 rounded-lg border p-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            <option.icon className="size-6" />
            {option.label}
          </button>
        ))}
        <div className="flex flex-col items-center gap-2 rounded-lg border p-4 text-sm font-medium">
          <Smartphone className="size-6" />
          Apps
        </div>
      </div>
      <div className="flex items-end gap-2 rounded-lg border p-3">
        <div className="flex-1">
          <label htmlFor="apps-source" className="text-xs text-muted-foreground">
            Plataforma (si es un pedido de Apps)
          </label>
          <Input
            id="apps-source"
            list="apps-source-suggestions"
            placeholder="PedidosYa, Rappi…"
            value={appsSource}
            onChange={(event) => setAppsSource(event.target.value)}
          />
          <datalist id="apps-source-suggestions">
            {appsSourceSuggestions.map((source) => (
              <option key={source} value={source} />
            ))}
          </datalist>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!appsSource.trim()}
          onClick={() => onSelect("APPS", appsSource.trim())}
        >
          Continuar
        </Button>
      </div>
    </div>
  );
}

export function NewOrderDialog() {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [channelSource, setChannelSource] = useState<string | undefined>(undefined);
  const router = useRouter();

  function reset() {
    setChannel(null);
    setChannelSource(undefined);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button />}>
        <Plus />
        Nuevo pedido
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nuevo pedido</DialogTitle>
        </DialogHeader>
        {channel === null ? (
          <ChannelStep
            onSelect={(selected, source) => {
              setChannel(selected);
              setChannelSource(source);
            }}
          />
        ) : (
          <OrderForm
            channel={channel}
            channelSource={channelSource}
            onBack={reset}
            onSuccess={(orderId) => {
              router.push(`/ventas/${orderId}`);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
