import https from "node:https";

// Los servidores de ARCA todavía negocian TLS con parámetros (claves DH
// chicas) que OpenSSL 3 rechaza por defecto ("dh key too small") — se baja
// el nivel de seguridad SOLO para estas conexiones, no para toda la app.
const agent = new https.Agent({ keepAlive: true, ciphers: "DEFAULT@SECLEVEL=1" });

const TIMEOUT_MS = 20_000;

export class ArcaConnectionError extends Error {}

export async function soapRequest(url: string, soapAction: string, body: string): Promise<string> {
  const envelope =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soapenv:Header/><soapenv:Body>${body}</soapenv:Body></soapenv:Envelope>`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        agent,
        timeout: TIMEOUT_MS,
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: `"${soapAction}"`,
          "Content-Length": Buffer.byteLength(envelope),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          // Los SOAP Fault vuelven con HTTP 500 — se devuelven igual para que
          // quien llama pueda leer el faultstring y mostrar algo útil.
          if (res.statusCode && res.statusCode >= 500 && !text.includes("Fault")) {
            reject(new ArcaConnectionError(`ARCA respondió HTTP ${res.statusCode}.`));
            return;
          }
          resolve(text);
        });
      },
    );
    req.on("timeout", () => req.destroy(new ArcaConnectionError("ARCA no respondió a tiempo.")));
    req.on("error", (error) =>
      reject(error instanceof ArcaConnectionError ? error : new ArcaConnectionError(`No se pudo conectar con ARCA: ${error.message}`)),
    );
    req.end(envelope);
  });
}

// Parser mínimo de XML: las respuestas de ARCA son chicas y de estructura
// fija, alcanza con buscar etiquetas por nombre (ignorando el prefijo de
// namespace) en vez de sumar una dependencia de parsing.
export function xmlTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tag}>`));
  return match ? match[1].trim() : null;
}

export function xmlTags(xml: string, tag: string): string[] {
  const regex = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "g");
  return [...xml.matchAll(regex)].map((match) => match[1].trim());
}

export function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function soapFault(xml: string): string | null {
  const fault = xmlTag(xml, "faultstring");
  return fault ? unescapeXml(fault) : null;
}
