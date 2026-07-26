"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LogoutButton({
  variant = "icon",
  className,
}: {
  // "icon": botón chico solo con ícono (para el header del sidebar).
  // "full": botón con texto, para pantallas sin sidebar (ej. el gate de
  // apertura de turno).
  variant?: "icon" | "full";
  className?: string;
}) {
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push("/login");
    router.refresh();
  }

  if (variant === "full") {
    return (
      <Button
        type="button"
        variant="outline"
        className={cn("text-destructive hover:text-destructive", className)}
        onClick={() => void handleLogout()}
      >
        <LogOut />
        Cerrar sesión
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={cn("shrink-0 text-destructive hover:text-destructive", className)}
      title="Cerrar sesión"
      onClick={() => void handleLogout()}
    >
      <LogOut />
      <span className="sr-only">Cerrar sesión</span>
    </Button>
  );
}
