import { z } from "zod";

/** Video viral tal como lo devuelve el scraper (normalizado). */
export type SourceVideo = {
  id: string;
  url: string;
  author: string;
  authorFollowers: number;
  caption: string;
  hashtags: string[];
  createdAt: string;
  durationSec: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
  outlierRatio: number;
  score: number;
  subtitleUrl?: string;
  videoFileUrl?: string;
  transcript?: string;
};

/** Desarme del video viral: qué lo hace funcionar. */
export const ViralBreakdownSchema = z.object({
  topic: z.string().describe("Tema concreto del video, en una frase"),
  targetAudience: z.string(),
  hook: z.object({
    text: z.string().describe("Lo que se dice/muestra en los primeros 1-3 segundos (parafraseado)"),
    type: z.enum([
      "pregunta",
      "afirmacion_polemica",
      "error_comun",
      "promesa_resultado",
      "curiosidad",
      "lista_numerada",
      "antes_despues",
      "pov",
      "mito_vs_realidad",
      "otro",
    ]),
    whyItWorks: z.string(),
  }),
  body: z.array(
    z.object({
      beat: z.string().describe("Qué pasa en este tramo"),
      purpose: z.string().describe("Función retórica: explicar, demostrar, sorprender, dar prueba..."),
    }),
  ),
  cta: z.string().describe("Llamado a la acción usado (o 'ninguno')"),
  retentionDevices: z.array(z.string()).describe("Loops abiertos, listas, giros, payoff al final, etc."),
  pacing: z.string().describe("Ritmo: cortes por segundo, duración de frases, energía"),
  visualStyle: z.string().describe("Cómo está filmado/editado: texto en pantalla, planos, B-roll"),
  emotionalTriggers: z.array(z.string()),
  viralityReasons: z.array(z.string()).describe("Por qué creés que se viralizó (3-5 razones)"),
  reusableFormula: z.string().describe("Plantilla abstracta reutilizable, sin copiar frases del original"),
});
export type ViralBreakdown = z.infer<typeof ViralBreakdownSchema>;

export const AnimationEnum = z.enum(["pop", "slide_up", "typewriter", "zoom_punch", "glitch"]);
export const TransitionEnum = z.enum(["fade", "slide", "wipe", "flip", "clock_wipe", "cut"]);
export const GraphicEnum = z.enum(["none", "counter", "checklist", "timer", "emoji_burst", "progress_ring", "versus"]);

export const SceneSchema = z.object({
  role: z.enum(["hook", "body", "payoff", "cta"]),
  voiceover: z.string().describe("Texto EXACTO que dice la voz en off en esta escena"),
  onScreenText: z.string().describe("Texto corto y grande en pantalla (máx 6 palabras), puede ser vacío"),
  emphasisWords: z.array(z.string()).describe("1-3 palabras del voiceover a resaltar en los subtítulos"),
  brollQuery: z.string().describe("Búsqueda EN INGLÉS para stock video vertical (ej: 'woman doing squats gym')"),
  animation: AnimationEnum,
  graphic: z.object({
    type: GraphicEnum,
    value: z.string().describe("Número, emoji o etiqueta según el tipo (ej: '3', '🔥', '30s', '80%'). Vacío si none"),
    items: z.array(z.string()).describe("Ítems para checklist/versus; vacío si no aplica"),
  }),
  transitionIn: TransitionEnum,
});
export type Scene = z.infer<typeof SceneSchema>;

export const VariationSchema = z.object({
  angle: z.string().describe("Qué cambia en esta variación respecto del original y de las otras"),
  hookType: z.string(),
  title: z.string().describe("Título interno corto"),
  scenes: z.array(SceneSchema),
  tiktokCaption: z.string().describe("Descripción para publicar, con 1 línea gancho"),
  hashtags: z.array(z.string()),
  voiceDirection: z.string().describe("Indicaciones de tono para la voz: energía, ritmo, emoción"),
  palette: z.object({
    primary: z.string().describe("Color hex de acento, ej #FF3B30"),
    secondary: z.string().describe("Color hex secundario"),
  }),
});
export type Variation = z.infer<typeof VariationSchema>;

export const VariationSetSchema = z.object({ variations: z.array(VariationSchema) });

/** Timings de palabra para subtítulos. */
export type WordTiming = { word: string; start: number; end: number };

/** Props finales que consume la composición de Remotion. */
export type RenderScene = Scene & {
  startSec: number;
  endSec: number;
  brollFile: string | null; // ruta relativa a publicDir
};
export type RenderProps = {
  scenes: RenderScene[];
  words: WordTiming[];
  audioFile: string | null;
  musicFile: string | null;
  durationSec: number;
  palette: { primary: string; secondary: string };
  emphasisWords: string[];
  handle: string;
};
