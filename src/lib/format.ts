const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
});

export function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

const scheduledTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  hour: "2-digit",
  minute: "2-digit",
});

// "Retira 21:30" / "Envía 21:30" — hora puntual que pidió el cliente por
// WhatsApp, no una nota más (ver Order.scheduledFor).
export function formatScheduledLabel(scheduledFor: string | Date, channel: string) {
  const time = scheduledTimeFormatter.format(new Date(scheduledFor));
  return `${channel === "DELIVERY" ? "Envía" : "Retira"} ${time}`;
}
