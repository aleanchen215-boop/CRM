import fs from "node:fs/promises";
import path from "node:path";
import { fetchBroll } from "./broll.js";
import { analyzeViral, writeVariations } from "./claude.js";
import { config } from "./config.js";
import { demoBreakdown, demoVariations, demoVideo } from "./demo-fixture.js";
import { discoverViralVideos, markSeen } from "./discover.js";
import { makeBundle, renderVideo } from "./render.js";
import type { RenderProps, RenderScene, SourceVideo, Variation, ViralBreakdown } from "./schemas.js";
import { getTranscript } from "./transcribe.js";
import { log, slug } from "./util.js";
import { synthesize } from "./voice.js";

const args = new Set(process.argv.slice(2));
const DEMO = args.has("--demo");
const NO_RENDER = args.has("--no-render");

type Job = { source: SourceVideo; breakdown: ViralBreakdown; variation: Variation; index: number; props: RenderProps; outDir: string };

/** Reparte la línea de tiempo de la voz entre escenas según la proporción de palabras de cada una. */
function timeScenes(variation: Variation, words: RenderProps["words"], durationSec: number) {
  const counts = variation.scenes.map((s) => s.voiceover.split(/\s+/).filter(Boolean).length);
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  let cum = 0;
  const starts = counts.map((c, i) => {
    const idx = Math.min(words.length - 1, Math.round((cum / total) * words.length));
    cum += c;
    return i === 0 ? 0 : Math.max(0, (words[idx]?.start ?? 0) - 0.05);
  });
  return starts.map((start, i) => ({ start, end: starts[i + 1] ?? durationSec }));
}

async function pickMusic(publicDir: string): Promise<string | null> {
  try {
    const files = (await fs.readdir(config.musicDir)).filter((f) => /\.(mp3|m4a|wav)$/i.test(f));
    if (!files.length) return null;
    const f = files[Math.floor(Math.random() * files.length)];
    await fs.mkdir(path.join(publicDir, "music"), { recursive: true });
    await fs.copyFile(path.join(config.musicDir, f), path.join(publicDir, "music", f));
    return path.join("music", f);
  } catch {
    return null;
  }
}

async function prepareVariation(source: SourceVideo, breakdown: ViralBreakdown, variation: Variation, index: number, runDir: string, publicDir: string): Promise<Job> {
  const rel = path.join(source.id, `var-${index + 1}`);
  const assetDir = path.join(publicDir, rel);
  const outDir = path.join(runDir, source.id);
  await fs.mkdir(assetDir, { recursive: true });

  const fullText = variation.scenes.map((s) => s.voiceover.trim()).join(" ");
  log(`  ▸ Variación ${index + 1}: ${variation.title} — voz en off`);
  const voice = await synthesize(fullText, variation.voiceDirection, assetDir);
  const timings = timeScenes(variation, voice.words, voice.durationSec);

  log(`    B-roll para ${variation.scenes.length} escenas`);
  const used = new Set<number>();
  const scenes: RenderScene[] = [];
  for (const [i, scene] of variation.scenes.entries()) {
    scenes.push({ ...scene, startSec: timings[i].start, endSec: timings[i].end, brollFile: await fetchBroll(scene.brollQuery, publicDir, used) });
  }

  const props: RenderProps = {
    scenes,
    words: voice.words,
    audioFile: voice.audioFile ? path.join(rel, "voice.mp3") : null,
    musicFile: await pickMusic(publicDir),
    durationSec: voice.durationSec + 0.6,
    palette: variation.palette,
    emphasisWords: variation.scenes.flatMap((s) => s.emphasisWords),
    handle: "",
  };

  await fs.mkdir(outDir, { recursive: true });
  const base = path.join(outDir, `var-${index + 1}-${slug(variation.title)}`);
  await fs.writeFile(`${base}.script.json`, JSON.stringify({ variation, props }, null, 2));
  await fs.writeFile(`${base}.caption.txt`, `${variation.tiktokCaption}\n\n${variation.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}\n`);
  return { source, breakdown, variation, index, props, outDir };
}

function report(date: string, jobs: Job[], rendered: Map<Job, string>) {
  const bySource = new Map<string, Job[]>();
  jobs.forEach((j) => bySource.set(j.source.id, [...(bySource.get(j.source.id) ?? []), j]));
  let md = `# Reporte TikTok Fitness — ${date}\n\n`;
  for (const js of bySource.values()) {
    const { source: s, breakdown: b } = js[0];
    md += `## Viral de referencia: @${s.author}\n${s.url}\n\n`;
    md += `- ${s.views.toLocaleString("es")} vistas · ${(s.engagementRate * 100).toFixed(1)}% engagement · ${s.outlierRatio.toFixed(1)}x sus seguidores\n`;
    md += `- **Tema:** ${b.topic}\n- **Gancho (${b.hook.type}):** ${b.hook.text} — ${b.hook.whyItWorks}\n`;
    md += `- **Cuerpo:** ${b.body.map((x) => x.beat).join(" → ")}\n- **CTA:** ${b.cta}\n`;
    md += `- **Por qué funcionó:** ${b.viralityReasons.join("; ")}\n- **Fórmula:** ${b.reusableFormula}\n\n`;
    for (const j of js) {
      md += `### Variación ${j.index + 1}: ${j.variation.title}\n- Ángulo: ${j.variation.angle}\n- Gancho: "${j.variation.scenes[0]?.voiceover}"\n`;
      md += `- Video: ${rendered.get(j) ? path.basename(rendered.get(j)!) : "(no renderizado)"}\n- Caption: ${j.variation.tiktokCaption}\n\n`;
    }
  }
  return md;
}

async function main() {
  const date = new Date().toISOString().slice(0, 10);
  const runDir = path.resolve("out", DEMO ? `${date}-demo` : date);
  const publicDir = path.join(runDir, "public");
  await fs.mkdir(publicDir, { recursive: true });

  const sources = DEMO ? [demoVideo] : await discoverViralVideos();
  if (!sources.length) {
    log("No hay videos virales nuevos que cumplan los filtros hoy.");
    return;
  }

  const jobs: Job[] = [];
  for (const source of sources) {
    try {
      log(`● @${source.author} — ${source.views.toLocaleString("es")} vistas — ${source.url}`);
      let breakdown: ViralBreakdown;
      let variations: Variation[];
      if (DEMO) {
        breakdown = demoBreakdown;
        variations = demoVariations;
      } else {
        source.transcript = await getTranscript(source, path.join(runDir, "tmp", source.id));
        log("  Analizando estructura con Claude…");
        breakdown = await analyzeViral(source);
        log(`  Gancho: "${breakdown.hook.text}" (${breakdown.hook.type})`);
        log(`  Escribiendo ${config.variationsPerVideo} variaciones…`);
        variations = await writeVariations(source, breakdown, config.variationsPerVideo);
      }
      await fs.mkdir(path.join(runDir, source.id), { recursive: true });
      await fs.writeFile(path.join(runDir, source.id, "breakdown.json"), JSON.stringify({ source, breakdown }, null, 2));
      for (const [i, v] of variations.entries()) {
        try {
          jobs.push(await prepareVariation(source, breakdown, v, i, runDir, publicDir));
        } catch (e) {
          log(`  ✗ Variación ${i + 1} falló: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      log(`✗ Video ${source.id} falló: ${(e as Error).message}`);
    }
  }

  const rendered = new Map<Job, string>();
  if (!NO_RENDER && jobs.length) {
    const serveUrl = await makeBundle(publicDir);
    for (const job of jobs) {
      const out = path.join(job.outDir, `var-${job.index + 1}-${slug(job.variation.title)}.mp4`);
      log(`Renderizando ${path.relative(runDir, out)}`);
      try {
        await renderVideo(serveUrl, job.props, out);
        rendered.set(job, out);
      } catch (e) {
        log(`  ✗ Render falló: ${(e as Error).message}`);
      }
    }
  }

  await fs.writeFile(path.join(runDir, "REPORTE.md"), report(date, jobs, rendered));
  if (!DEMO) await markSeen(sources.map((s) => s.id));
  log(`Listo: ${rendered.size} videos en ${runDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
