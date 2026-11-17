import path from "node:path";
import { config } from "./config.js";
import { download, log, slug } from "./util.js";

type PexelsFile = { link: string; width: number; height: number; quality: string; file_type: string };
type PexelsVideo = { id: number; duration: number; video_files: PexelsFile[] };

/**
 * Busca y descarga un clip vertical de stock (Pexels, licencia libre) para una escena.
 * Devuelve la ruta relativa a publicDir, o null (la escena usa fondo animado).
 */
export async function fetchBroll(query: string, publicDir: string, used: Set<number>): Promise<string | null> {
  if (!config.keys.pexels) return null;
  try {
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&size=medium&per_page=15`;
    const res = await fetch(url, { headers: { Authorization: config.keys.pexels } });
    if (!res.ok) throw new Error(`Pexels ${res.status}`);
    const { videos } = (await res.json()) as { videos: PexelsVideo[] };
    const pick = videos.find((v) => !used.has(v.id) && v.duration >= 3) ?? videos[0];
    if (!pick) return null;
    used.add(pick.id);
    const file =
      pick.video_files
        .filter((f) => f.file_type === "video/mp4" && f.height >= f.width && f.width <= 1080)
        .sort((a, b) => b.width - a.width)[0] ?? pick.video_files[0];
    const rel = path.join("broll", `${slug(query)}-${pick.id}.mp4`);
    await download(file.link, path.join(publicDir, rel));
    return rel;
  } catch (e) {
    log(`  B-roll "${query}" no disponible: ${(e as Error).message}`);
    return null;
  }
}
