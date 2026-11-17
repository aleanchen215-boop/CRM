import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";

type Anim = "pop" | "slide_up" | "typewriter" | "zoom_punch" | "glitch";

/** Texto grande de la escena (zona segura superior) con 5 estilos de animación. */
export const OnScreenText: React.FC<{ text: string; animation: Anim; palette: { primary: string; secondary: string }; isHook: boolean }> = ({
  text,
  animation,
  palette,
  isHook,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!text.trim()) return null;

  const s = spring({ frame, fps, config: { damping: 12, stiffness: 180 } });
  let transform = "";
  let shown = text;
  let opacity = 1;
  let shadow = "0 10px 30px rgba(0,0,0,.5)";

  switch (animation) {
    case "pop":
      transform = `scale(${s})`;
      break;
    case "slide_up":
      transform = `translateY(${(1 - s) * 160}px)`;
      opacity = s;
      break;
    case "typewriter": {
      const chars = Math.floor(interpolate(frame, [0, Math.min(30, text.length * 1.5)], [0, text.length], { extrapolateRight: "clamp" }));
      shown = text.slice(0, chars) + (chars < text.length && frame % 10 < 5 ? "▌" : "");
      break;
    }
    case "zoom_punch": {
      const z = interpolate(frame, [0, 6], [2.4, 1], { extrapolateRight: "clamp" });
      const shake = frame < 10 ? (random(`s${frame}`) - 0.5) * 24 : 0;
      transform = `scale(${z}) translate(${shake}px, ${-shake}px)`;
      break;
    }
    case "glitch": {
      const g = frame < 12 ? (random(`g${frame}`) - 0.5) * 30 : 0;
      transform = `translateX(${g}px) skewX(${g / 3}deg)`;
      shadow = frame < 12 ? `${g}px 0 ${palette.primary}, ${-g}px 0 #00e5ff` : shadow;
      break;
    }
  }

  return (
    <AbsoluteFill style={{ alignItems: "center", top: isHook ? "14%" : "11%", padding: "0 80px" }}>
      <div
        style={{
          transform,
          opacity,
          textAlign: "center",
          fontSize: isHook ? 112 : 84,
          fontWeight: 900,
          lineHeight: 1.05,
          textTransform: "uppercase",
          color: "#fff",
          textShadow: shadow,
          background: isHook ? palette.primary : "rgba(0,0,0,.55)",
          padding: isHook ? "18px 34px" : "14px 28px",
          borderRadius: 26,
          rotate: isHook ? "-2deg" : "0deg",
          maxWidth: 900,
        }}
      >
        {shown}
      </div>
    </AbsoluteFill>
  );
};
