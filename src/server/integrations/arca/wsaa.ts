import forge from "node-forge";
import { prisma } from "@/lib/prisma";
import { getArcaConfig } from "@/server/integrations/arca/config";
import { soapFault, soapRequest, unescapeXml, xmlTag } from "@/server/integrations/arca/soap";

// WSAA: autenticación de ARCA. Se firma un "Ticket de Requerimiento de
// Acceso" (TRA) con el certificado del contribuyente y ARCA devuelve un
// token + sign que valen ~12 hs para el servicio pedido (acá, wsfe).

export type ArcaCredentials = { token: string; sign: string; cuit: string };

// Margen para no usar un ticket que vence en medio de un pedido.
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

function buildTra(service: string): string {
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<loginTicketRequest version="1.0"><header>` +
    `<uniqueId>${Math.floor(now / 1000)}</uniqueId>` +
    `<generationTime>${iso(now - 10 * 60 * 1000)}</generationTime>` +
    `<expirationTime>${iso(now + 10 * 60 * 1000)}</expirationTime>` +
    `</header><service>${service}</service></loginTicketRequest>`
  );
}

// CMS (PKCS#7 SignedData) con el TRA adentro, en base64 — es lo que pide
// el método loginCms.
function signTra(tra: string, certPem: string, keyPem: string): string {
  const cert = forge.pki.certificateFromPem(certPem);
  const key = forge.pki.privateKeyFromPem(keyPem);

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, "utf8");
  p7.addCertificate(cert);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date().toISOString() },
    ],
  });
  p7.sign();

  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

export async function getArcaCredentials(service = "wsfe"): Promise<ArcaCredentials> {
  const config = getArcaConfig();
  const key = `${service}-${config.env}`;

  const cached = await prisma.arcaTicket.findUnique({ where: { key } });
  if (cached && cached.expiresAt.getTime() - EXPIRY_MARGIN_MS > Date.now()) {
    return { token: cached.token, sign: cached.sign, cuit: config.cuit };
  }

  const cms = signTra(buildTra(service), config.cert, config.key);
  const response = await soapRequest(
    config.endpoints.wsaa,
    "",
    `<loginCms xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><in0>${cms}</in0></loginCms>`,
  );

  const fault = soapFault(response);
  if (fault) {
    // Pasa si se perdió el ticket guardado (ej. se borró la tabla) mientras
    // el anterior sigue vigente en ARCA: no queda otra que esperar a que venza.
    if (fault.includes("ya posee un TA valido")) {
      throw new Error(
        "ARCA dice que ya hay un ticket de acceso vigente que no está guardado en el sistema — se libera solo en unas horas (hasta 12 hs).",
      );
    }
    throw new Error(`ARCA rechazó la autenticación: ${fault}`);
  }

  const ticketXml = unescapeXml(xmlTag(response, "loginCmsReturn") ?? "");
  const token = xmlTag(ticketXml, "token");
  const sign = xmlTag(ticketXml, "sign");
  const expiration = xmlTag(ticketXml, "expirationTime");
  if (!token || !sign || !expiration) {
    throw new Error("Respuesta inesperada de ARCA al autenticar.");
  }

  const expiresAt = new Date(expiration);
  await prisma.arcaTicket.upsert({
    where: { key },
    create: { key, token, sign, expiresAt },
    update: { token, sign, expiresAt },
  });

  return { token, sign, cuit: config.cuit };
}
