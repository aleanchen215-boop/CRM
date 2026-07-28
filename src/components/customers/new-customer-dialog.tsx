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
import { CustomerForm } from "@/components/customers/customer-form";

export function NewCustomerDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus />
        Nuevo cliente
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
        </DialogHeader>
        <CustomerForm
          mode="create"
          onSuccess={(customer) => {
            // No cerramos el diálogo antes de navegar: la navegación ya
            // desmonta todo el árbol, y hacerlo a mano corta la animación
            // de cierre a mitad de camino, dejando el fondo del diálogo
            // "pegado" e invisible, bloqueando los clics en la página nueva.
            router.push(`/clientes/${customer.id}`);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
