"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

const STORAGE_KEY = "crm-sucursal-seleccionada";

// undefined = "todas las sucursales juntas" (comportamiento de antes de que
// existiera Almafuerte). Solo tiene sentido para usuarios sin User.sucursalId
// fijo (Admin, Supervisor...) — el resto ve siempre la suya, la elijan o no.
type SucursalContextValue = {
  selectedSucursalId: string | undefined;
  setSelectedSucursalId: (id: string | undefined) => void;
};

const SucursalContext = createContext<SucursalContextValue | null>(null);

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return window.localStorage.getItem(STORAGE_KEY) ?? undefined;
}

function getServerSnapshot() {
  return undefined;
}

function setStoredSucursalId(id: string | undefined) {
  if (id) {
    window.localStorage.setItem(STORAGE_KEY, id);
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  for (const listener of listeners) listener();
}

export function SucursalProvider({ children }: { children: React.ReactNode }) {
  const selectedSucursalId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <SucursalContext.Provider
      value={{ selectedSucursalId, setSelectedSucursalId: setStoredSucursalId }}
    >
      {children}
    </SucursalContext.Provider>
  );
}

export function useSucursalSelection() {
  const ctx = useContext(SucursalContext);
  if (!ctx) throw new Error("useSucursalSelection debe usarse dentro de SucursalProvider");
  return ctx;
}
