import "dotenv/config";

const list = (v: string | undefined, fallback: string[]) =>
  v ? v.split(",").map((s) => s.trim()).filter(Boolean) : fallback;
const num = (v: string | undefined, fallback: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : fallback);

export const config = {
  // --- Descubrimiento ---
  hashtags: list(process.env.TIKTOK_HASHTAGS, [
    "fitness",
    "gymtok",
    "workout",
    "fitnesstips",
    "gimnasio",
    "rutina",
    "perderpeso",
  ]),
  searchQueries: list(process.env.TIKTOK_SEARCH_QUERIES, []),
  resultsPerHashtag: num(process.env.RESULTS_PER_HASHTAG, 30),
  minViews: num(process.env.MIN_VIEWS, 300_000),
  maxAgeDays: num(process.env.MAX_AGE_DAYS, 10),
  maxDurationSec: num(process.env.MAX_DURATION_SEC, 90),
  topVideos: num(process.env.TOP_VIDEOS, 3),

  // --- Generación ---
  variationsPerVideo: num(process.env.VARIATIONS_PER_VIDEO, 3),
  language: process.env.OUTPUT_LANGUAGE ?? "español neutro latinoamericano",
  niche: process.env.NICHE ?? "fitness, gimnasio y entrenamiento en casa",
  brandCta: process.env.BRAND_CTA ?? "Seguime para más rutinas",
  claudeModel: process.env.CLAUDE_MODEL ?? "claude-opus-5-5",

  // --- Voz ---
  elevenVoiceId: process.env.ELEVENLABS_VOICE_ID ?? "pNInz6obpgDQGcFmaJgB", // "Adam", multilingüe
  elevenModel: process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2",
  openaiVoice: process.env.OPENAI_TTS_VOICE ?? "onyx",

  // --- Render ---
  fps: 30,
  width: 1080,
  height: 1920,
  transitionFrames: 12,
  browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE || null,
  musicDir: process.env.MUSIC_DIR ?? "assets/music",

  // --- Keys (todas opcionales: el agente degrada con fallbacks) ---
  keys: {
    apify: process.env.APIFY_TOKEN,
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    elevenlabs: process.env.ELEVENLABS_API_KEY,
    pexels: process.env.PEXELS_API_KEY,
  },
};
