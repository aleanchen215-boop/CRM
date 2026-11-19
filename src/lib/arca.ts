// Helpers de la factura C que se usan del lado del navegador (impresión del
// ticket) — nada de esto es secreto.

export type FacturaImpresa = {
  cuit: string;
  puntoVenta: number;
  cbteTipo: number;
  cbteNumero: number;
  // yyyymmdd, tal como se informó a ARCA.
  cbteFecha: string;
  importe: number;
  cae: string;
};

// "20260119" -> "19/01/2026"
export function formatArcaDate(yyyymmdd: string | null | undefined): string {
  if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd ?? "";
  return `${yyyymmdd.slice(6, 8)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(0, 4)}`;
}

export function formatPuntoVenta(puntoVenta: number) {
  return String(puntoVenta).padStart(5, "0");
}

export function formatCbteNumero(numero: number) {
  return String(numero).padStart(8, "0");
}

// QR obligatorio en todo comprobante electrónico impreso (RG 4291): URL de
// ARCA con los datos del comprobante en JSON base64. Ver
// https://www.afip.gob.ar/fe/qr/especificaciones.asp
export function buildArcaQrUrl(factura: FacturaImpresa): string {
  const data = {
    ver: 1,
    fecha: `${factura.cbteFecha.slice(0, 4)}-${factura.cbteFecha.slice(4, 6)}-${factura.cbteFecha.slice(6, 8)}`,
    cuit: Number(factura.cuit),
    ptoVta: factura.puntoVenta,
    tipoCmp: factura.cbteTipo,
    nroCmp: factura.cbteNumero,
    importe: Number(factura.importe.toFixed(2)),
    moneda: "PES",
    ctz: 1,
    // Consumidor final sin identificar.
    tipoDocRec: 99,
    nroDocRec: 0,
    tipoCodAut: "E",
    codAut: Number(factura.cae),
  };
  const base64 = btoa(JSON.stringify(data));
  return `https://www.afip.gob.ar/fe/qr/?p=${base64}`;
}
