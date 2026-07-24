// Mercado Pago Checkout Pro — crea una preferencia de pago por pedido.
// https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/overview
const MP_API_BASE = "https://api.mercadopago.com";

export async function createMercadoPagoPreference(
  orderId: string,
  amount: number,
): Promise<{ initPoint: string } | null> {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) return null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm-psi-amber.vercel.app";

  const response = await fetch(`${MP_API_BASE}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items: [
        {
          title: `Pedido CRM Paracao`,
          quantity: 1,
          unit_price: amount,
          currency_id: "ARS",
        },
      ],
      external_reference: orderId,
      notification_url: `${appUrl}/api/webhooks/mercadopago`,
      back_urls: {
        success: appUrl,
        pending: appUrl,
        failure: appUrl,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Error al crear la preferencia de Mercado Pago: ${errorBody}`);
  }

  const data = (await response.json()) as { init_point?: string };
  if (!data.init_point) return null;

  return { initPoint: data.init_point };
}

export interface MercadoPagoPayment {
  id: number;
  status: string;
  external_reference?: string;
  transaction_amount?: number;
}

export async function getMercadoPagoPayment(paymentId: string): Promise<MercadoPagoPayment> {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("Mercado Pago no está configurado (falta MERCADO_PAGO_ACCESS_TOKEN).");
  }

  const response = await fetch(`${MP_API_BASE}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Error al consultar el pago de Mercado Pago: ${errorBody}`);
  }

  return response.json() as Promise<MercadoPagoPayment>;
}
