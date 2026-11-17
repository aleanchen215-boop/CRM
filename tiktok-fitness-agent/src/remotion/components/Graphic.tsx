import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Scene } from "../../schemas";

type Palette = { primary: string; secondary: string };

const Ring: React.FC<{ progress: number; color: string; label: string }> = ({ progress, color, label }) => {
  const r = 190;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: 460, height: 460 }}>
      <svg width={460} height={460} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={230} cy={230} r={r} stroke="rgba(255,255,255,.15)" strokeWidth={34} fill="rgba(0,0,0,.35)" />
        <circle cx={230} cy={230} r={r} stroke={color} strokeWidth={34} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 120, fontWeight: 900, color: "#fff" }}>
        {label}
      </div>
    </div>
  );
};

/** Gráficos animados que refuerzan la idea de la escena (contador, checklist, timer, etc.). */
export const Graphic: React.FC<{ graphic: Scene["graphic"]; palette: Palette; sceneFrames: number }> = ({ graphic, palette, sceneFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - 4, fps, config: { damping: 13 } });
  const numeric = parseFloat(graphic.value.replace(/[^\d.]/g, "")) || 0;
  const suffix = graphic.value.replace(/[\d.\s]/g, "");

  let content: React.ReactNode = null;
  switch (graphic.type) {
    case "counter": {
      const v = interpolate(frame, [4, 30], [0, numeric], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      content = (
        <div style={{ fontSize: 300, fontWeight: 900, color: palette.primary, WebkitTextStroke: "8px #fff", textShadow: "0 20px 60px rgba(0,0,0,.6)" }}>
          {Number.isInteger(numeric) ? Math.round(v) : v.toFixed(1)}
          {suffix}
        </div>
      );
      break;
    }
    case "progress_ring": {
      const pct = Math.min(numeric, 100) / 100;
      const p = interpolate(frame, [4, 35], [0, pct], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      content = <Ring progress={p} color={palette.primary} label={`${Math.round(p * 100)}%`} />;
      break;
    }
    case "timer": {
      const total = numeric || 30;
      const p = 1 - Math.min(frame / sceneFrames, 1);
      content = <Ring progress={p} color={palette.primary} label={`${Math.ceil(total * p)}s`} />;
      break;
    }
    case "checklist":
      content = (
        <div style={{ display: "flex", flexDirection: "column", gap: 26, background: "rgba(0,0,0,.55)", padding: 40, borderRadius: 32 }}>
          {graphic.items.slice(0, 5).map((it, i) => {
            const s = spring({ frame: frame - 6 - i * 8, fps, config: { damping: 12 } });
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 24, opacity: s, transform: `translateX(${(1 - s) * -80}px)` }}>
                <div style={{ width: 64, height: 64, borderRadius: 16, background: palette.primary, color: "#fff", fontSize: 46, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${s})` }}>
                  ✓
                </div>
                <div style={{ fontSize: 58, fontWeight: 800, color: "#fff" }}>{it}</div>
              </div>
            );
          })}
        </div>
      );
      break;
    case "versus": {
      const [a = "❌", b = "✅"] = graphic.items;
      const sa = spring({ frame: frame - 4, fps });
      const sb = spring({ frame: frame - 14, fps });
      const box = (txt: string, color: string, s: number, dir: number) => (
        <div style={{ flex: 1, background: color, borderRadius: 30, padding: 30, fontSize: 52, fontWeight: 900, color: "#fff", textAlign: "center", transform: `translateX(${(1 - s) * 400 * dir}px)` }}>{txt}</div>
      );
      content = (
        <div style={{ display: "flex", alignItems: "center", gap: 24, width: 920 }}>
          {box(a, "#3a3a44", sa, -1)}
          <div style={{ fontSize: 70, fontWeight: 900, color: palette.primary }}>VS</div>
          {box(b, palette.primary, sb, 1)}
        </div>
      );
      break;
    }
    case "emoji_burst":
      content = (
        <div style={{ position: "relative", width: 600, height: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {Array.from({ length: 10 }).map((_, i) => {
            const ang = random(`a${i}`) * Math.PI * 2;
            const d = interpolate(frame, [4, 24], [0, 220 + random(`d${i}`) * 80], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
            return (
              <div key={i} style={{ position: "absolute", fontSize: 60, opacity: interpolate(frame, [18, 32], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), transform: `translate(${Math.cos(ang) * d}px, ${Math.sin(ang) * d}px)` }}>
                {graphic.value || "🔥"}
              </div>
            );
          })}
          <div style={{ fontSize: 260, transform: `scale(${enter}) rotate(${Math.sin(frame / 6) * 8}deg)` }}>{graphic.value || "🔥"}</div>
        </div>
      );
      break;
    default:
      return null;
  }

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", top: "-6%" }}>
      <div style={{ transform: `scale(${0.6 + enter * 0.4})`, opacity: enter }}>{content}</div>
    </AbsoluteFill>
  );
};
