import { UsersAdmin } from "@/components/users/users-admin";

export default function ConfiguracionPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Usuarios y roles. Integraciones (WhatsApp, Mercado Pago) y categorías de cliente se
          suman después.
        </p>
      </div>
      <UsersAdmin />
    </div>
  );
}
