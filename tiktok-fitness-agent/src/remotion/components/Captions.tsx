import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { WordTiming } from "../../schemas";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]/gu, "");

/** Agrupa palabras en "páginas" de máx. 3 palabras, cortando en signos de puntuación. */
function paginate(words: WordTiming[]) {
  const pages: WordTiming[][] = [];
  let cur: WordTiming[] = [];
  for (const w of words) {
    cur.push(w);
    if (cur.length >= 3 || /[.,!?;:]$/.test(w.word)) {
      pages.push(cur);
      cur = [];
    }
  }
  if (cur.length) pages.push(cur);
  return pages;
}

/** Subtítulos estilo TikTok: palabra activa resaltada con "pop", palabras clave en color de acento. */
export const Captions: React.FC<{ words: WordTiming[]; palette: { primary: string; secondary: string }; emphasis: string[] }> = ({
  words,
  palette,
  emphasis,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const emph = new Set(emphasis.flatMap((e) => e.split(/\s+/)).map(norm));
  const pages = paginate(words);
  const page = pages.find((p, i) => t >= p[0].start - 0.05 && t < (pages[i + 1]?.[0].start ?? p.at(-1)!.end + 0.6));
  if (!page) return null;

  const pageStart = Math.round(page[0].start * fps);
  const enter = spring({ frame: frame - pageStart, fps, config: { damping: 14, stiffness: 220 } });

  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", top: "60%", padding: "0 110px 0 70px" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "0 22px",
          transform: `scale(${0.85 + enter * 0.15}) translateY(${(1 - enter) * 30}px)`,
        }}
      >
        {page.map((w, i) => {
          const active = t >= w.start && t < w.end + 0.05;
          const pop = spring({ frame: frame - Math.round(w.start * fps), fps, config: { damping: 10, stiffness: 300 }, durationInFrames: 8 });
          const isEmph = emph.has(norm(w.word));
          return (
            <span
              key={i}
              style={{
                fontSize: 92,
                fontWeight: 900,
                textTransform: "uppercase",
                lineHeight: 1.15,
                color: active ? "#fff" : isEmph ? palette.primary : "#fff",
                background: active ? palette.primary : "transparent",
                borderRadius: 18,
                padding: "0 14px",
                transform: `scale(${active ? 1 + 0.12 * pop : 1}) rotate(${active ? -2 : 0}deg)`,
                WebkitTextStroke: active ? "0" : "4px #000",
                paintOrder: "stroke fill",
                textShadow: "0 8px 24px rgba(0,0,0,.6)",
              }}
            >
              {w.word.replace(/[.,;:]$/, "")}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
