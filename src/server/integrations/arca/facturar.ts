import { prisma } from "@/lib/prisma";
import { getPuntoVenta, isArcaConfigured } from "@/server/integrations/arca/config";
import { getArcaCredentials } from "@/server/integrations/arca/wsaa";
import { ArcaConnectionError } from "@/server/integrations/arca/soap";
import {
  CBTE_TIPO_FACTURA_C,
  consultarComprobante,
  solicitarCaeFacturaC,
  ultimoComprobanteAutorizado,
} from "@/server/integrations/arca/wsfe";

// Emite la factura C (monotributo, consumidor final) de un pedido en ARCA y
// guarda el CAE en su Invoice. Idempotente: si ya tiene CAE lo devuelve tal
// cual, nunca factura dos veces el mismo pedido.
//
// Numeración: ARCA exige números correlativos por punto de venta, y si dos
// cajas facturan a la vez con el mismo punto de venta las dos leerían el
// mismo "último número". Por eso todo el tramo "leer último → pedir CAE"
// corre con un lock de Postgres (pg_advisory_xact_lock) por punto de venta.
//
// Cortes de conexión: el número elegido se guarda ANTES de pedir el CAE. Si
// la respuesta de ARCA se pierde (timeout, se cae el server), el reintento
// consulta ese número en ARCA: si quedó autorizado con el mismo importe, lo
// adopta en vez de sacar otro y duplicar la factura.

// Un PENDIENTE más viejo que esto se considera colgado (ej. se cortó el
// request a mitad de camino) y se deja reintentar.
const STALE_PENDING_MS = 2 * 60 * 1000;

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Argentina/Buenos_Aires",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function hoyArca(): string {
  return dateFormatter.format(new Date()).replace(/-/g, "");
}

export class FacturaError extends Error {}

export async function emitirFacturaC(orderId: string) {
  if (!isArcaConfigured()) throw new FacturaError("La facturación con ARCA no está configurada.");

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { sucursal: true, invoice: true },
  });
  if (!order) throw new FacturaError("Pedido no encontrado.");
  if (order.invoice?.arcaStatus === "AUTORIZADO") return order.invoice;
  if (order.status === "CANCELADO") throw new FacturaError("No se puede facturar una venta cancelada.");

  const importe = Number(order.total);
  if (importe <= 0) throw new FacturaError("No se puede facturar una venta con total $0.");

  const puntoVenta = getPuntoVenta(order.sucursal.slug);

  // Pedidos viejos podrían no tener Invoice (hoy se crea siempre junto con el pedido).
  if (!order.invoice) {
    await prisma.invoice.create({ data: { orderId, type: "INTERNO", status: "EMITIDO" } });
  }

  // "Toma" la emisión: si otra pestaña/caja ya la está haciendo, no se pisa.
  const claimed = await prisma.invoice.updateMany({
    where: {
      orderId,
      OR: [
        { arcaStatus: null },
        { arcaStatus: "ERROR" },
        { arcaStatus: "PENDIENTE", arcaRequestedAt: { lt: new Date(Date.now() - STALE_PENDING_MS) } },
      ],
    },
    data: { arcaStatus: "PENDIENTE", arcaRequestedAt: new Date(), arcaError: null },
  });
  if (claimed.count === 0) {
    const current = await prisma.invoice.findUnique({ where: { orderId } });
    if (current?.arcaStatus === "AUTORIZADO") return current;
    throw new FacturaError("La factura de esta venta ya se está emitiendo, esperá unos segundos.");
  }

  try {
    const auth = await getArcaCredentials();
    const lockKey = CBTE_TIPO_FACTURA_C * 100_000 + puntoVenta;

    const outcome = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey}::bigint)`;

        // Las escrituras van con `prisma` (no `tx`) a propósito: tienen que
        // quedar guardadas aunque el pedido a ARCA falle a mitad de camino.
        // `tx` solo sostiene el lock.
        const invoice = await prisma.invoice.findUniqueOrThrow({ where: { orderId } });
        const ultimo = await ultimoComprobanteAutorizado(auth, puntoVenta, CBTE_TIPO_FACTURA_C);

        // ¿Un intento anterior de este mismo pedido quedó autorizado en ARCA
        // pero la respuesta nunca llegó?
        if (
          invoice.cbteNumero &&
          invoice.puntoVenta === puntoVenta &&
          invoice.cbteTipo === CBTE_TIPO_FACTURA_C &&
          invoice.cbteNumero <= ultimo
        ) {
          const previo = await consultarComprobante(auth, puntoVenta, CBTE_TIPO_FACTURA_C, invoice.cbteNumero);
          const usadoPorOtro = previo ? await prisma.invoice.findUnique({ where: { cae: previo.cae } }) : null;
          if (previo && Math.abs(previo.importe - importe) < 0.01 && !usadoPorOtro) {
            return { ok: true as const, ...previo, numero: invoice.cbteNumero, observaciones: [] };
          }
        }

        const numero = ultimo + 1;
        const fecha = hoyArca();

        // Si otro pedido había reservado este número en un intento que ARCA
        // nunca autorizó (lo confirma `ultimo`), se lo libera.
        await prisma.invoice.updateMany({
          where: {
            cbteTipo: CBTE_TIPO_FACTURA_C,
            puntoVenta,
            cbteNumero: numero,
            arcaStatus: { not: "AUTORIZADO" },
            orderId: { not: orderId },
          },
          data: { cbteNumero: null },
        });
        await prisma.invoice.update({
          where: { orderId },
          data: { cbteTipo: CBTE_TIPO_FACTURA_C, puntoVenta, cbteNumero: numero, cbteFecha: fecha, importe },
        });

        const result = await solicitarCaeFacturaC(auth, { puntoVenta, numero, fecha, importe });
        return result.ok ? { ...result, numero, fecha, importe } : result;
      },
      { maxWait: 30_000, timeout: 60_000 },
    );

    if (!outcome.ok) {
      const message = outcome.errores.join(" · ");
      await prisma.invoice.update({
        where: { orderId },
        // Rechazo definitivo: el número no se usó, se libera.
        data: { arcaStatus: "ERROR", arcaError: message, cbteNumero: null },
      });
      throw new FacturaError(`ARCA rechazó la factura: ${message}`);
    }

    return await prisma.invoice.update({
      where: { orderId },
      data: {
        type: "AFIP",
        arcaStatus: "AUTORIZADO",
        cae: outcome.cae,
        caeVencimiento: outcome.caeVencimiento,
        cbteNumero: outcome.numero,
        cbteFecha: outcome.fecha,
        importe: outcome.importe,
        arcaError: outcome.observaciones.length > 0 ? outcome.observaciones.join(" · ") : null,
      },
    });
  } catch (error) {
    if (error instanceof FacturaError) throw error;
    const detail = error instanceof Error ? error.message : "Error desconocido al facturar.";
    const message =
      error instanceof ArcaConnectionError
        ? `El servicio de ARCA no responde (${detail}). La venta queda pendiente de factura: reintentá en unos minutos.`
        : detail;
    // Se deja cbteNumero como está: si el corte fue después de que ARCA
    // autorizó, el reintento lo recupera.
    await prisma.invoice.update({ where: { orderId }, data: { arcaStatus: "ERROR", arcaError: message } });
    throw new FacturaError(message);
  }
}
