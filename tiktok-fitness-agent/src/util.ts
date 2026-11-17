import fs from "node:fs/promises";
import path from "node:path";

export const log = (...a: unknown[]) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

export async function download(url: string, dest: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Descarga falló ${res.status}: ${url.slice(0, 120)}`);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

export const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

/** WebVTT/SRT → texto plano. */
export function subtitlesToText(vtt: string) {
  return vtt
    .split(/\r?\n/)
    .filter((l) => l && !/^WEBVTT|^\d+$|-->/.test(l.trim()))
    .map((l) => l.replace(/<[^>]+>/g, "").trim())
    .filter((l, i, arr) => l && l !== arr[i - 1])
    .join(" ");
}
