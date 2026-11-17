import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import type { SourceVideo } from "./schemas.js";
import { log } from "./util.js";

const STATE_FILE = path.resolve("state/seen.json");
const APIFY_ACTOR = process.env.APIFY_ACTOR ?? "clockworks~tiktok-scraper";

/* eslint-disable @typescript-eslint/no-explicit-any */
function normalize(item: any): SourceVideo | null {
  const id = String(item.id ?? "");
  if (!id) return null;
  const views = Number(item.playCount ?? 0);
  const likes = Number(item.diggCount ?? 0);
  const comments = Number(item.commentCount ?? 0);
  const shares = Number(item.shareCount ?? 0);
  const saves = Number(item.collectCount ?? 0);
  const followers = Number(item.authorMeta?.fans ?? 0);
  const engagementRate = views > 0 ? (likes + comments * 2 + shares * 3 + saves * 3) / views : 0;
  // "Outlier": cuántas veces supera el video al tamaño de la cuenta. Premia ideas que viralizan
  // por el contenido y no por la fama del creador.
  const outlierRatio = followers > 0 ? views / followers : 1;
  const subs: any[] = item.videoMeta?.subtitleLinks ?? [];
  const sub = subs.find((s) => /^es|spa/i.test(s.language ?? "")) ?? subs.find((s) => /^en|eng/i.test(s.language ?? "")) ?? subs[0];

  return {
    id,
    url: item.webVideoUrl ?? `https://www.tiktok.com/@${item.authorMeta?.name}/video/${id}`,
    author: item.authorMeta?.name ?? "desconocido",
    authorFollowers: followers,
    caption: item.text ?? "",
    hashtags: (item.hashtags ?? []).map((h: any) => h.name ?? h).filter(Boolean),
    createdAt: item.createTimeISO ?? new Date((item.createTime ?? 0) * 1000).toISOString(),
    durationSec: Number(item.videoMeta?.duration ?? 0),
    views,
    likes,
    comments,
    shares,
    saves,
    engagementRate,
    outlierRatio,
    score: Math.log10(views + 1) * (1 + engagementRate * 8) * (1 + Math.min(Math.log10(outlierRatio + 1), 2)),
    subtitleUrl: sub?.downloadLink ?? sub?.tiktokLink,
    videoFileUrl: item.mediaUrls?.[0],
  };
}

async function loadSeen(): Promise<Set<string>> {
  try {
    return new Set(JSON.parse(await fs.readFile(STATE_FILE, "utf8")));
  } catch {
    return new Set();
  }
}

export async function markSeen(ids: string[]) {
  const seen = await loadSeen();
  ids.forEach((id) => seen.add(id));
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify([...seen].slice(-5000)));
}

/** Busca videos virales de fitness en TikTok vía Apify y devuelve los mejores que todavía no procesamos. */
export async function discoverViralVideos(): Promise<SourceVideo[]> {
  if (!config.keys.apify) throw new Error("Falta APIFY_TOKEN para buscar en TikTok");

  const input = {
    hashtags: config.hashtags,
    searchQueries: config.searchQueries,
    resultsPerPage: config.resultsPerHashtag,
    shouldDownloadVideos: true,
    shouldDownloadSubtitles: true,
    shouldDownloadCovers: false,
    shouldDownloadSlideshowImages: false,
  };
  log(`Buscando en TikTok: #${config.hashtags.join(" #")}`);
  const res = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${config.keys.apify}&timeout=600`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
  );
  if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const items: any[] = await res.json();

  const seen = await loadSeen();
  const cutoff = Date.now() - config.maxAgeDays * 86_400_000;
  const unique = new Map<string, SourceVideo>();
  for (const raw of items) {
    const v = normalize(raw);
    if (!v || seen.has(v.id) || unique.has(v.id)) continue;
    if (v.views < config.minViews) continue;
    if (new Date(v.createdAt).getTime() < cutoff) continue;
    if (v.durationSec > config.maxDurationSec) continue;
    unique.set(v.id, v);
  }
  const ranked = [...unique.values()].sort((a, b) => b.score - a.score);
  log(`${items.length} resultados → ${ranked.length} candidatos virales nuevos`);
  return ranked.slice(0, config.topVideos);
}
