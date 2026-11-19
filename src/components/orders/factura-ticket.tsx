"use client";

import { type ReactNode, useMemo } from "react";
import QRCode from "qrcode";
import { formatCurrency } from "@/lib/format";
import {
  buildArcaQrUrl,
  formatArcaDate,
  formatCbteNumero,
  formatPuntoVenta,
} from "@/lib/arca";

export type FacturaEmisor = {
  razonSocial: string;
  cuit: string;
  domicilio: string;
  iibb: string;
  inicioActividades: string;
  condicionIva: string;
};

export type FacturaData = {
  puntoVenta: number;
  cbteTipo: number;
  cbteNumero: number;
  cbteFecha: string;
  importe: number;
  cae: string;
  caeVencimiento: string | null;
};

// QR armado a mano en SVG a partir de la matriz (sincrónico, sin canvas ni
// promesas) — así ya está dibujado cuando se dispara window.print() apenas
// carga la página.
function QrSvg({ text, size = 150 }: { text: string; size?: number }) {
  const path = useMemo(() => {
    const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
    let d = "";
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) {
        if (modules.data[row * modules.size + col]) d += `M${col} ${row}h1v1h-1z`;
      }
    }
    return { d, count: modules.size };
  }, [text]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`-2 -2 ${path.count + 4} ${path.count + 4}`}
      shapeRendering="crispEdges"
      aria-label="Código QR de ARCA"
    >
      <rect x={-2} y={-2} width={path.count + 4} height={path.count + 4} fill="#fff" />
      <path d={path.d} fill="#000" />
    </svg>
  );
}

// Factura C para la térmica de 80mm — mismo estilo que la comanda
// (.receipt-print en globals.css). Lleva lo que exige ARCA para un
// comprobante electrónico impreso: datos del emisor, tipo y código de
// comprobante, punto de venta y número, fecha, receptor, importe, CAE con su
// vencimiento y el QR.
export function FacturaTicket({
  emisor,
  factura,
  items,
  discountAmount,
  deliveryFee,
  className,
}: {
  emisor: FacturaEmisor;
  factura: FacturaData;
  items: { id: string; quantity: number; label: string; unitPrice: number; subtotal: number; detail?: ReactNode }[];
  discountAmount: number;
  deliveryFee: number | null;
  className?: string;
}) {
  const qrUrl = buildArcaQrUrl({ ...factura, cuit: emisor.cuit });

  return (
    <div className={className}>
      <div className="flex items-start justify-between border-b border-black pb-1">
        <div>
          <p className="receipt-title font-bold">FACTURA C</p>
          <p>ORIGINAL</p>
        </div>
        <div className="border-2 border-black px-2 text-center">
          <p className="receipt-title font-bold">C</p>
          <p>Cód. {String(factura.cbteTipo).padStart(3, "0")}</p>
        </div>
      </div>
      <p className="mt-1 font-bold">{emisor.razonSocial}</p>
      {emisor.domicilio && <p>{emisor.domicilio}</p>}
      <p>CUIT: {emisor.cuit}</p>
      {emisor.iibb && <p>IIBB: {emisor.iibb}</p>}
      {emisor.inicioActividades && <p>Inicio de act.: {emisor.inicioActividades}</p>}
      <p>{emisor.condicionIva}</p>
      <hr className="my-1 border-dashed border-black" />
      <p>
        Pto. Vta: {formatPuntoVenta(factura.puntoVenta)} Nro: {formatCbteNumero(factura.cbteNumero)}
      </p>
      <p>Fecha: {formatArcaDate(factura.cbteFecha)}</p>
      <hr className="my-1 border-dashed border-black" />
      <p className="font-bold">A CONSUMIDOR FINAL</p>
      <p>Cond. frente al IVA: Consumidor Final</p>
      <hr className="my-1 border-dashed border-black" />
      <p className="flex justify-between font-bold">
        <span>Cant. x P. unit.</span>
        <span>Importe</span>
      </p>
      {items.map((item) => (
        <div key={item.id} className="mb-1">
          <p className="font-bold">{item.label}</p>
          {item.detail}
          <p className="flex justify-between">
            <span>
              {item.quantity} x {formatCurrency(item.unitPrice)}
            </span>
            <span>{formatCurrency(item.subtotal)}</span>
          </p>
        </div>
      ))}
      <hr className="my-1 border-dashed border-black" />
      {deliveryFee != null && deliveryFee > 0 && (
        <p className="flex justify-between">
          <span>Envío</span>
          <span>{formatCurrency(deliveryFee)}</span>
        </p>
      )}
      {discountAmount > 0 && (
        <p className="flex justify-between">
          <span>Bonificación</span>
          <span>−{formatCurrency(discountAmount)}</span>
        </p>
      )}
      <p className="receipt-total flex justify-between font-bold">
        <span>TOTAL</span>
        <span>{formatCurrency(factura.importe)}</span>
      </p>
      <hr className="my-1 border-dashed border-black" />
      <div className="flex justify-center py-1">
        <QrSvg text={qrUrl} />
      </div>
      <p>CAE: {factura.cae}</p>
      <p>Vto. CAE: {formatArcaDate(factura.caeVencimiento)}</p>
      <p className="mt-1 text-center">Comprobante autorizado por ARCA</p>
    </div>
  );
}
