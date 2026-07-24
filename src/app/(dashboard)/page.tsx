import {
  AlertTriangle,
  MessageCircle,
  PackageX,
  ShoppingCart,
  Ticket,
  UserPlus,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const METRICS = [
  { label: "Ventas del día", icon: ShoppingCart },
  { label: "Ventas del mes", icon: ShoppingCart },
  { label: "Facturación total", icon: Wallet },
  { label: "Nuevos clientes", icon: UserPlus },
  { label: "Conversaciones abiertas", icon: MessageCircle },
  { label: "Tickets abiertos", icon: Ticket },
  { label: "Stock bajo", icon: AlertTriangle },
  { label: "Sin stock", icon: PackageX },
] as const;

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Resumen general de la operación.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {METRICS.map((metric) => (
          <Card key={metric.label}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {metric.label}
              </CardTitle>
              <metric.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">—</div>
              <p className="text-xs text-muted-foreground">Sin datos todavía</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Actividad reciente</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Todavía no hay actividad. Esta sección se completa a medida que se cargan
            clientes, conversaciones y ventas.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
