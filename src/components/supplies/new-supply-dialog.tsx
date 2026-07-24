"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SupplyForm } from "@/components/supplies/supply-form";

export function NewSupplyDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus />
        Nuevo insumo
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo insumo</DialogTitle>
        </DialogHeader>
        <SupplyForm
          mode="create"
          onSuccess={(supplyId) => {
            router.push(`/stock/${supplyId}`);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
