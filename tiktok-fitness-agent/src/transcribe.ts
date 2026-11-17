import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { config } from "./config.js";
import type { SourceVideo, WordTiming } from "./schemas.js";
import { download, log, subtitlesToText } from "./util.js";

/** Obtiene la transcripción del video original: subtítulos de TikTok → Whisper → solo caption. */
export async function getTranscript(video: SourceVideo, workDir: string): Promise<string> {
  if (video.subtitleUrl) {
    try {
      const res = await fetch(video.subtitleUrl);
      if (res.ok) {
        const text = subtitlesToText(await res.text());
        if (text.length > 20) return text;
      }
    } catch (e) {
      log(`  subtítulos no disponibles (${(e as Error).message})`);
    }
  }
  if (video.videoFileUrl && config.keys.openai) {
    try {
      const file = await download(video.videoFileUrl, path.join(workDir, "source.mp4"));
      const openai = new OpenAI();
      const tr = await openai.audio.transcriptions.create({ file: fs.createReadStream(file), model: "whisper-1" });
      return tr.text;
    } catch (e) {
      log(`  Whisper falló (${(e as Error).message})`);
    }
  }
  return "";
}

/** Timestamps por palabra de un audio propio (usado cuando el TTS no los devuelve). */
export async function wordTimestamps(audioFile: string): Promise<WordTiming[]> {
  const openai = new OpenAI();
  const tr = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioFile),
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
  });
  return (tr.words ?? []).map((w) => ({ word: w.word, start: w.start, end: w.end }));
}
