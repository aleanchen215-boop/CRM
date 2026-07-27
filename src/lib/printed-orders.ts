// Registro liviano (localStorage) de qué pedidos ya se imprimieron o el
// cajero ya decidió imprimir — compartido entre el detalle de pedido (que
// dispara la impresión real vía ?autoprint=1) y la lista de Ventas (que
// avisa de pedidos nuevos por WhatsApp y no debe re-avisar de uno que ya
// se imprimió, sea desde esta pestaña o desde el flujo de creación manual).
const KEY = "crm:printed-order-ids";
const MAX = 300;

function readIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function hasBeenHandled(orderId: string): boolean {
  return readIds().includes(orderId);
}

export function markAsHandled(orderId: string) {
  if (typeof window === "undefined") return;
  try {
    const ids = readIds();
    if (!ids.includes(orderId)) {
      localStorage.setItem(KEY, JSON.stringify([...ids, orderId].slice(-MAX)));
    }
  } catch {
    // localStorage puede fallar (modo privado, cuota llena) — no es crítico.
  }
}
