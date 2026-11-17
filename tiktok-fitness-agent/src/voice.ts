import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { config } from "./config.js";
import type { WordTiming } from "./schemas.js";
import { wordTimestamps } from "./transcribe.js";
import { log } from "./util.js";

export type VoiceResult = { audioFile: string | null; words: WordTiming[]; durationSec: number };

/** Agrupa la alineación por carácter de ElevenLabs en palabras. */
function charsToWords(chars: string[], starts: number[], ends: number[]): WordTiming[] {
  const words: WordTiming[] = [];
  let cur = "";
  let s = 0;
  let e = 0;
  chars.forEach((c, i) => {
    if (/\s/.test(c)) {
      if (cur) words.push({ word: cur, start: s, end: e });
      cur = "";
      return;
    }
    if (!cur) s = starts[i];
    cur += c;
    e = ends[i];
  });
  if (cur) words.push({ word: cur, start: s, end: e });
  return words;
}

async function elevenlabs(text: string, direction: string, outFile: string): Promise<VoiceResult> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${config.elevenVoiceId}/with-timestamps`, {
    method: "POST",
    headers: { "xi-api-key": config.keys.elevenlabs!, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: config.elevenModel,
      voice_settings: { stability: 0.35, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true, speed: 1.08 },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as {
    audio_base64: string;
    alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };
  };
  void direction; // ElevenLabs toma el tono de la voz elegida; la dirección se usa en OpenAI TTS.
  await fs.writeFile(outFile, Buffer.from(data.audio_base64, "base64"));
  const a = data.alignment;
  const words = charsToWords(a.characters, a.character_start_times_seconds, a.character_end_times_seconds);
  return { audioFile: outFile, words, durationSec: (words.at(-1)?.end ?? 0) + 0.3 };
}

async function openaiTts(text: string, direction: string, outFile: string): Promise<VoiceResult> {
  const openai = new OpenAI();
  const speech = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: config.openaiVoice,
    input: text,
    instructions: `Voz en off de TikTok de fitness en ${config.language}. ${direction}`,
    response_format: "mp3",
  });
  await fs.writeFile(outFile, Buffer.from(await speech.arrayBuffer()));
  const words = await wordTimestamps(outFile);
  return { audioFile: outFile, words, durationSec: (words.at(-1)?.end ?? 0) + 0.3 };
}

/** Sin proveedor de voz: timings estimados (≈2.6 palabras/s) para poder previsualizar con subtítulos. */
function estimated(text: string): VoiceResult {
  const words: WordTiming[] = [];
  let t = 0.15;
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const d = 0.22 + w.length * 0.035 + (/[.,!?¿¡:]$/.test(w) ? 0.18 : 0);
    words.push({ word: w, start: t, end: t + d });
    t += d + 0.03;
  }
  return { audioFile: null, words, durationSec: t + 0.4 };
}

export async function synthesize(text: string, direction: string, dir: string): Promise<VoiceResult> {
  const outFile = path.join(dir, "voice.mp3");
  if (config.keys.elevenlabs) {
    try {
      return await elevenlabs(text, direction, outFile);
    } catch (e) {
      log(`  ElevenLabs falló, pruebo OpenAI TTS: ${(e as Error).message}`);
    }
  }
  if (config.keys.openai) {
    try {
      return await openaiTts(text, direction, outFile);
    } catch (e) {
      log(`  OpenAI TTS falló: ${(e as Error).message}`);
    }
  }
  log("  ⚠ Sin TTS configurado: render mudo con tiempos estimados");
  return estimated(text);
}
