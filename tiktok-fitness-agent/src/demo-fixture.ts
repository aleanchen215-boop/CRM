import type { SourceVideo, Variation, ViralBreakdown } from "./schemas";

/** Datos de ejemplo para `npm run demo`: prueban el render completo sin llamar a ninguna API. */
export const demoVideo: SourceVideo = {
  id: "demo-0001",
  url: "https://www.tiktok.com/@ejemplo/video/demo-0001",
  author: "ejemplo",
  authorFollowers: 12000,
  caption: "El error que te frena en sentadillas #fitness #gymtok",
  hashtags: ["fitness", "gymtok"],
  createdAt: new Date().toISOString(),
  durationSec: 28,
  views: 2_400_000,
  likes: 310_000,
  comments: 2_100,
  shares: 18_000,
  saves: 41_000,
  engagementRate: 0.2,
  outlierRatio: 200,
  score: 0,
};

export const demoBreakdown: ViralBreakdown = {
  topic: "Error técnico común en la sentadilla",
  targetAudience: "Principiantes de gimnasio",
  hook: { text: "Si hacés esto en la sentadilla, estás perdiendo resultados", type: "error_comun", whyItWorks: "Miedo a estar haciéndolo mal + loop abierto" },
  body: [
    { beat: "Muestra el error", purpose: "identificación" },
    { beat: "Explica por qué pasa", purpose: "autoridad" },
    { beat: "Da 3 correcciones", purpose: "valor práctico" },
  ],
  cta: "Guardalo para tu próximo entrenamiento",
  retentionDevices: ["lista numerada", "payoff al final"],
  pacing: "Cortes cada 2 s, voz rápida",
  visualStyle: "Texto grande arriba, demostración en gimnasio",
  emotionalTriggers: ["miedo a lesionarse", "deseo de progreso"],
  viralityReasons: ["Problema universal", "Solución en <30 s", "Muy guardable"],
  reusableFormula: "Error común → por qué importa → N correcciones rápidas → CTA guardar",
};

export const demoVariations: Variation[] = [
  {
    angle: "Mito vs realidad sobre las rodillas en la sentadilla",
    hookType: "mito_vs_realidad",
    title: "rodillas-sentadilla",
    scenes: [
      { role: "hook", voiceover: "¿Te dijeron que las rodillas nunca pasen la punta del pie?", onScreenText: "¿Rodillas detrás del pie?", emphasisWords: ["nunca"], brollQuery: "squat gym legs", animation: "zoom_punch", graphic: { type: "none", value: "", items: [] }, transitionIn: "cut" },
      { role: "body", voiceover: "Es uno de los mitos más repetidos del gimnasio.", onScreenText: "MITO", emphasisWords: ["mitos"], brollQuery: "gym weights rack", animation: "glitch", graphic: { type: "versus", value: "", items: ["Mito", "Realidad"] }, transitionIn: "wipe" },
      { role: "body", voiceover: "Si tu talón queda apoyado y no hay dolor, que la rodilla avance es normal.", onScreenText: "Talón apoyado", emphasisWords: ["normal"], brollQuery: "barbell squat side view", animation: "slide_up", graphic: { type: "none", value: "", items: [] }, transitionIn: "slide" },
      { role: "body", voiceover: "Revisá estas tres cosas:", onScreenText: "", emphasisWords: ["tres"], brollQuery: "fitness woman training", animation: "pop", graphic: { type: "counter", value: "3", items: [] }, transitionIn: "fade" },
      { role: "payoff", voiceover: "talones firmes, espalda neutra y rodillas en la línea de los pies.", onScreenText: "Checklist", emphasisWords: ["firmes", "neutra"], brollQuery: "squat technique", animation: "typewriter", graphic: { type: "checklist", value: "", items: ["Talones firmes", "Espalda neutra", "Rodillas alineadas"] }, transitionIn: "flip" },
      { role: "cta", voiceover: "Guardalo y seguime para más rutinas.", onScreenText: "Guardalo 📌", emphasisWords: ["Guardalo"], brollQuery: "gym motivation", animation: "pop", graphic: { type: "emoji_burst", value: "💪", items: [] }, transitionIn: "clock_wipe" },
    ],
    tiktokCaption: "Las rodillas PUEDEN pasar la punta del pie 👀",
    hashtags: ["fitness", "sentadilla", "gymtok", "piernas"],
    voiceDirection: "Energética, segura, ritmo rápido",
    palette: { primary: "#FF3B30", secondary: "#7C3AED" },
  },
];
