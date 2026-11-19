import { getArcaConfig } from "@/server/integrations/arca/config";
import type { ArcaCredentials } from "@/server/integrations/arca/wsaa";
import { soapFault, soapRequest, xmlTag, xmlTags } from "@/server/integrations/arca/soap";

// WSFEv1: factura electrónica de ARCA (mercado interno). Solo lo necesario
// para factura C de monotributo a consumidor final.

const NS = "http://ar.gov.afip.dif.FEV1/";

export const CBTE_TIPO_FACTURA_C = 11;
const DOC_TIPO_CONSUMIDOR_FINAL = 99;
// Tabla de condiciones frente al IVA del receptor (FEParamGetCondicionIvaReceptor).
const CONDICION_IVA_CONSUMIDOR_FINAL = 5;
// 1 = Productos (lo que vende el local). Con 2/3 (servicios) ARCA exige
// además fechas de servicio y vencimiento de pago.
const CONCEPTO_PRODUCTOS = 1;

function authXml(auth: ArcaCredentials) {
  return `<Auth><Token>${auth.token}</Token><Sign>${auth.sign}</Sign><Cuit>${auth.cuit}</Cuit></Auth>`;
}

async function call(method: string, inner: string): Promise<string> {
  const { endpoints } = getArcaConfig();
  const response = await soapRequest(endpoints.wsfe, `${NS}${method}`, `<${method} xmlns="${NS}">${inner}</${method}>`);
  const fault = soapFault(response);
  if (fault) throw new Error(`ARCA: ${fault}`);
  return response;
}

function parseMessages(xml: string, container: string, item: string): string[] {
  const block = xmlTag(xml, container);
  if (!block) return [];
  return xmlTags(block, item).map((entry) => `${xmlTag(entry, "Code") ?? "?"}: ${xmlTag(entry, "Msg") ?? ""}`);
}

export async function ultimoComprobanteAutorizado(
  auth: ArcaCredentials,
  puntoVenta: number,
  cbteTipo: number,
): Promise<number> {
  const response = await call(
    "FECompUltimoAutorizado",
    `${authXml(auth)}<PtoVta>${puntoVenta}</PtoVta><CbteTipo>${cbteTipo}</CbteTipo>`,
  );
  const errors = parseMessages(response, "Errors", "Err");
  if (errors.length > 0) throw new Error(`ARCA: ${errors.join(" · ")}`);
  return Number(xmlTag(response, "CbteNro") ?? "0");
}

export type ComprobanteConsultado = {
  cae: string;
  caeVencimiento: string;
  fecha: string;
  importe: number;
};

// null si ese número no existe (todavía) en ARCA.
export async function consultarComprobante(
  auth: ArcaCredentials,
  puntoVenta: number,
  cbteTipo: number,
  numero: number,
): Promise<ComprobanteConsultado | null> {
  const response = await call(
    "FECompConsultar",
    `${authXml(auth)}<FeCompConsReq><CbteTipo>${cbteTipo}</CbteTipo><CbteNro>${numero}</CbteNro><PtoVta>${puntoVenta}</PtoVta></FeCompConsReq>`,
  );
  const result = xmlTag(response, "ResultGet");
  const cae = result ? xmlTag(result, "CodAutorizacion") : null;
  if (!result || !cae) return null;
  return {
    cae,
    caeVencimiento: xmlTag(result, "FchVto") ?? "",
    fecha: xmlTag(result, "CbteFch") ?? "",
    importe: Number(xmlTag(result, "ImpTotal") ?? "0"),
  };
}

export type SolicitudCae =
  | { ok: true; cae: string; caeVencimiento: string; observaciones: string[] }
  | { ok: false; errores: string[] };

export async function solicitarCaeFacturaC(
  auth: ArcaCredentials,
  params: { puntoVenta: number; numero: number; fecha: string; importe: number },
): Promise<SolicitudCae> {
  const importe = params.importe.toFixed(2);
  const response = await call(
    "FECAESolicitar",
    `${authXml(auth)}<FeCAEReq>` +
      `<FeCabReq><CantReg>1</CantReg><PtoVta>${params.puntoVenta}</PtoVta><CbteTipo>${CBTE_TIPO_FACTURA_C}</CbteTipo></FeCabReq>` +
      `<FeDetReq><FECAEDetRequest>` +
      `<Concepto>${CONCEPTO_PRODUCTOS}</Concepto>` +
      `<DocTipo>${DOC_TIPO_CONSUMIDOR_FINAL}</DocTipo><DocNro>0</DocNro>` +
      `<CbteDesde>${params.numero}</CbteDesde><CbteHasta>${params.numero}</CbteHasta>` +
      `<CbteFch>${params.fecha}</CbteFch>` +
      // Factura C: todo el importe va como neto, sin IVA discriminado.
      `<ImpTotal>${importe}</ImpTotal><ImpTotConc>0</ImpTotConc><ImpNeto>${importe}</ImpNeto>` +
      `<ImpOpEx>0</ImpOpEx><ImpTrib>0</ImpTrib><ImpIVA>0</ImpIVA>` +
      `<MonId>PES</MonId><MonCotiz>1</MonCotiz>` +
      `<CondicionIVAReceptorId>${CONDICION_IVA_CONSUMIDOR_FINAL}</CondicionIVAReceptorId>` +
      `</FECAEDetRequest></FeDetReq></FeCAEReq>`,
  );

  const detalle = xmlTag(response, "FECAEDetResponse") ?? "";
  const resultado = xmlTag(detalle, "Resultado");
  const cae = xmlTag(detalle, "CAE");
  const observaciones = parseMessages(detalle, "Observaciones", "Obs");

  if (resultado === "A" && cae) {
    return { ok: true, cae, caeVencimiento: xmlTag(detalle, "CAEFchVto") ?? "", observaciones };
  }
  const errores = [...parseMessages(response, "Errors", "Err"), ...observaciones];
  return { ok: false, errores: errores.length > 0 ? errores : ["ARCA rechazó el comprobante sin detalle."] };
}
