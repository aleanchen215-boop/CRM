// Configuración de facturación electrónica ARCA (ex AFIP) — todo sale de
// variables de entorno (ver .env.example). El certificado y la clave privada
// NUNCA salen del servidor: este archivo solo se importa desde código server.

export type ArcaEnv = "homologacion" | "produccion";

export type ArcaEmisor = {
  razonSocial: string;
  cuit: string;
  domicilio: string;
  iibb: string;
  inicioActividades: string;
  condicionIva: string;
};

const ENDPOINTS: Record<ArcaEnv, { wsaa: string; wsfe: string }> = {
  homologacion: {
    wsaa: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
    wsfe: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
  },
  produccion: {
    wsaa: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
    wsfe: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
  },
};

// Acepta el PEM pegado tal cual (con saltos de línea reales o como "\n"
// escapados, que es como suele quedar en el panel de Vercel) o el PEM
// entero codificado en base64 en una sola línea.
function readPem(name: string): string | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  if (raw.includes("-----BEGIN")) return raw.replace(/\\n/g, "\n");
  return Buffer.from(raw, "base64").toString("utf8");
}

function slugKey(slug: string) {
  return slug.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

export function isArcaConfigured(): boolean {
  return Boolean(process.env.ARCA_CUIT && process.env.ARCA_CERT && process.env.ARCA_KEY);
}

export function getArcaConfig() {
  const cuit = process.env.ARCA_CUIT?.replace(/\D/g, "");
  const cert = readPem("ARCA_CERT");
  const key = readPem("ARCA_KEY");
  if (!cuit || !cert || !key) {
    throw new Error("Falta configurar ARCA (ARCA_CUIT, ARCA_CERT y ARCA_KEY).");
  }
  const env: ArcaEnv = process.env.ARCA_ENV === "produccion" ? "produccion" : "homologacion";
  return { cuit, cert, key, env, endpoints: ENDPOINTS[env] };
}

// Cada sucursal factura con su propio punto de venta (dado de alta en ARCA
// como "Factura electrónica - Web Services"): ARCA_PUNTO_VENTA_PARACAO,
// ARCA_PUNTO_VENTA_ALMAFUERTE… con ARCA_PUNTO_VENTA como valor por defecto.
export function getPuntoVenta(sucursalSlug: string): number {
  const raw = process.env[`ARCA_PUNTO_VENTA_${slugKey(sucursalSlug)}`] ?? process.env.ARCA_PUNTO_VENTA;
  const value = Number(raw);
  if (!raw || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Falta el punto de venta de ARCA para la sucursal "${sucursalSlug}" (ARCA_PUNTO_VENTA).`);
  }
  return value;
}

// Datos fijos que tienen que figurar impresos en la factura C. No son
// secretos — se mandan al navegador para armar el ticket.
export function getArcaEmisor(sucursalSlug: string): ArcaEmisor {
  return {
    razonSocial: process.env.ARCA_RAZON_SOCIAL ?? "",
    cuit: process.env.ARCA_CUIT?.replace(/\D/g, "") ?? "",
    domicilio: process.env[`ARCA_DOMICILIO_${slugKey(sucursalSlug)}`] ?? process.env.ARCA_DOMICILIO ?? "",
    iibb: process.env.ARCA_IIBB ?? "",
    inicioActividades: process.env.ARCA_INICIO_ACTIVIDADES ?? "",
    condicionIva: "Responsable Monotributo",
  };
}
