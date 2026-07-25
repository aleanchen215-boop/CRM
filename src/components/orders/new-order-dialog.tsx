"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Store, Bike, Smartphone } from "lucide-react";
import { salesChannelValues, appsSourceValues } from "@/lib/validation/order";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { OrderForm } from "@/components/orders/order-form";

const CHANNEL_OPTIONS = [
  { value: "MOSTRADOR" as const, label: "Mostrador", icon: Store },
  { value: "DELIVERY" as const, label: "Delivery", icon: Bike },
];

type Channel = (typeof salesChannelValues)[number];

// Rappi/PedidosYa son botones fijos (no texto libre): el método de pago
// depende de cuál es exactamente, así que hace falta que coincida siempre
// con el mismo valor.
function ChannelStep({ onSelect }: { onSelect: (channel: Channel, channelSource?: string) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">¿De dónde viene el pedido?</p>
      <div className="grid grid-cols-2 gap-3">
        {CHANNEL_OPTIONS.map((option) => (
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
        {appsSourceValues.map((source) => (
          <button
            key={source}
            type="button"
            onClick={() => onSelect("APPS", source)}
            className="flex flex-col items-center gap-2 rounded-lg border p-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Smartphone className="size-6" />
            {source}
          </button>
        ))}
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
