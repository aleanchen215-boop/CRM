import type { RenderProps } from "../schemas";

/** Props mínimas para abrir la composición en Remotion Studio (`npm run studio`). */
export const previewProps: RenderProps = {
  scenes: [
    {
      role: "hook",
      voiceover: "Tres errores que arruinan tu sentadilla",
      onScreenText: "3 errores en sentadilla",
      emphasisWords: ["errores"],
      brollQuery: "",
      animation: "zoom_punch",
      graphic: { type: "counter", value: "3", items: [] },
      transitionIn: "cut",
      startSec: 0,
      endSec: 3,
      brollFile: null,
    },
  ],
  words: ["Tres", "errores", "que", "arruinan", "tu", "sentadilla"].map((w, i) => ({ word: w, start: 0.2 + i * 0.4, end: 0.55 + i * 0.4 })),
  audioFile: null,
  musicFile: null,
  durationSec: 3.2,
  palette: { primary: "#FF3B30", secondary: "#7C3AED" },
  emphasisWords: ["errores"],
  handle: "",
};
