"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

export const NEW_CUSTOMER_VALUE = "__new__";

type ComboItem = { value: string; label: string };

// Combina nombre y teléfono en el mismo texto: filtra (y se ve) por
// cualquiera de los dos, para distinguir clientes con el mismo nombre.
function customerLabel(customer: { firstName: string; lastName: string; whatsapp: string }) {
  return `${customer.firstName} ${customer.lastName} — ${customer.whatsapp}`;
}

// La opción "crear cliente" tiene que sobrevivir siempre al filtro interno
// del combobox (aunque lo tipeado no matchee ningún cliente existente) —
// si no, cuando no hay resultados no queda forma de dar de alta a nadie.
function comboboxFilter(item: ComboItem, query: string) {
  if (item.value === NEW_CUSTOMER_VALUE) return true;
  if (!query) return true;
  return item.label.toLowerCase().includes(query.toLowerCase());
}

export function CustomerCombobox({
  value,
  onChange,
  onCreateNew,
  placeholder = "Buscar por nombre o teléfono…",
  allowClear = false,
}: {
  value: string;
  onChange: (customerId: string) => void;
  onCreateNew: (prefillWhatsapp?: string) => void;
  placeholder?: string;
  allowClear?: boolean;
}) {
  const { data: customers } = trpc.customers.list.useQuery({});
  const [inputValue, setInputValue] = useState("");

  // Si lo tipeado no coincide con ningún cliente cargado, la opción de
  // crear cliente nuevo se ofrece con ese texto ya puesto (normalmente un
  // número de teléfono), para no tener que volver a escribirlo en el alta.
  const trimmedInput = inputValue.trim();
  const newCustomerLabel = trimmedInput ? `Crear cliente con "${trimmedInput}"…` : "Nuevo cliente…";

  const items: ComboItem[] = [
    { value: NEW_CUSTOMER_VALUE, label: newCustomerLabel },
    ...(customers?.map((customer) => ({ value: customer.id, label: customerLabel(customer) })) ?? []),
  ];

  const selected = items.find((item) => item.value === value) ?? null;

  return (
    <Combobox
      items={items}
      value={selected}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
      filter={comboboxFilter}
      onValueChange={(item) => {
        if (!item) {
          onChange("");
          return;
        }
        if (item.value === NEW_CUSTOMER_VALUE) {
          onCreateNew(trimmedInput || undefined);
          return;
        }
        onChange(item.value);
      }}
    >
      <ComboboxInput placeholder={placeholder} showClear={allowClear} className="w-full" />
      <ComboboxContent>
        <ComboboxEmpty>No se encontraron clientes</ComboboxEmpty>
        <ComboboxList>
          {(item: ComboItem) => (
            <ComboboxItem key={item.value} value={item}>
              {item.value === NEW_CUSTOMER_VALUE ? (
                <span className="flex items-center gap-1.5 text-primary">
                  <UserPlus className="size-4" />
                  {item.label}
                </span>
              ) : (
                item.label
              )}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
