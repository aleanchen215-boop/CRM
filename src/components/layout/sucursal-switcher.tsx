"use client";

import { Store } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useSucursalSelection } from "@/components/layout/sucursal-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_VALUE = "__todas__";

// Solo aparece para usuarios sin sucursal fija (User.sucursalId nulo — Admin,
// Supervisor, etc.): el resto de los roles ya está atado a una sola y no
// necesita elegir. Afecta qué ve en Ventas/Conversaciones/Stock/Reportes.
export function SucursalSwitcher() {
  const { data: me } = trpc.system.me.useQuery();
  const { data: sucursales } = trpc.sucursales.list.useQuery();
  const { selectedSucursalId, setSelectedSucursalId } = useSucursalSelection();

  if (!me || me.sucursalId || !sucursales || sucursales.length === 0) return null;

  return (
    <Select
      value={selectedSucursalId ?? ALL_VALUE}
      onValueChange={(value) => setSelectedSucursalId(!value || value === ALL_VALUE ? undefined : value)}
    >
      <SelectTrigger className="w-44 gap-1.5">
        <Store className="size-4 text-muted-foreground" />
        <SelectValue>
          {sucursales.find((s) => s.id === selectedSucursalId)?.name ?? "Todas las sucursales"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>Todas las sucursales</SelectItem>
        {sucursales.map((sucursal) => (
          <SelectItem key={sucursal.id} value={sucursal.id}>
            {sucursal.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
