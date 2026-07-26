"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Input } from "@/components/ui/input";
import { NewSupplyDialog } from "@/components/supplies/new-supply-dialog";
import { MissingSupplies } from "@/components/supplies/missing-supplies";
import { SupplyTable } from "@/components/supplies/supply-table";
import { CombinedSupplyTable } from "@/components/supplies/combined-supply-table";
import { useSucursalSelection } from "@/components/layout/sucursal-context";
import { useCanPerform } from "@/lib/use-can-perform";

export default function StockPage() {
  const [search, setSearch] = useState("");
  const canWrite = useCanPerform("stock:write");
  const { data: me } = trpc.system.me.useQuery();
  const { data: sucursales } = trpc.sucursales.list.useQuery();
  const { selectedSucursalId } = useSucursalSelection();

  // Depósito y Repartidor ven las dos sucursales siempre separadas en
  // secciones apiladas (una abajo de la otra, nunca una al lado de la
  // otra) en vez de una tabla combinada con columna de sucursal.
  const stackedBySucursal = me?.role === "DEPOSITO" || me?.role === "REPARTIDOR";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stock</h1>
          <p className="text-sm text-muted-foreground">
            Insumos e ingredientes, solo cantidad disponible.
          </p>
        </div>
        {canWrite && <NewSupplyDialog />}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar insumo…"
          className="pl-8"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {stackedBySucursal ? (
        <div className="flex flex-col gap-8">
          {sucursales?.map((sucursal) => (
            <div key={sucursal.id} className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold tracking-tight">{sucursal.name}</h2>
              <MissingSupplies sucursalId={sucursal.id} />
              <SupplyTable sucursalId={sucursal.id} search={search} />
            </div>
          ))}
        </div>
      ) : (
        <>
          <MissingSupplies />
          {selectedSucursalId ? (
            <SupplyTable sucursalId={selectedSucursalId} search={search} />
          ) : (
            <CombinedSupplyTable search={search} />
          )}
        </>
      )}
    </div>
  );
}
