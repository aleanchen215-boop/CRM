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

// Si lo que se tipeó son básicamente dígitos (con algún +, espacio o
// guión de por medio) lo tratamos como número de teléfono para poder
// ofrecer "crear cliente con este número" — un nombre de pila no cuenta.
function isPhoneLike(text: string) {
  const digitsOnly = text.replace(/[\s\-()+]/g, "");
  return digitsOnly.length >= 6 && /^\d+$/.test(digitsOnly);
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

  // Si lo tipeado parece un teléfono y no coincide con ningún cliente
  // cargado, la opción de crear cliente nuevo se ofrece con ese número ya
  // puesto, para no tener que volver a escribirlo en el formulario.
  const trimmedInput = inputValue.trim();
  const phoneQuery = isPhoneLike(trimmedInput) ? trimmedInput : undefined;
  const newCustomerLabel = phoneQuery ? `Crear cliente con el número "${phoneQuery}"…` : "Nuevo cliente…";

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
      onValueChange={(item) => {
        if (!item) {
          onChange("");
          return;
        }
        if (item.value === NEW_CUSTOMER_VALUE) {
          onCreateNew(phoneQuery);
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
