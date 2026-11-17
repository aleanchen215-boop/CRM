import { AbsoluteFill, interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

/** B-roll con zoom lento (Ken Burns) o, si no hay clip, fondo de motion graphics animado. */
export const Background: React.FC<{ file: string | null; palette: { primary: string; secondary: string }; seed: number }> = ({
  file,
  palette,
  seed,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = frame / Math.max(1, durationInFrames);

  if (file) {
    const zoomIn = seed % 2 === 0;
    const scale = zoomIn ? interpolate(frame, [0, 150], [1.05, 1.2], { extrapolateRight: "clamp" }) : interpolate(frame, [0, 150], [1.2, 1.05], { extrapolateRight: "clamp" });
    const x = interpolate(frame, [0, 150], [0, seed % 3 === 0 ? -30 : 30], { extrapolateRight: "clamp" });
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <OffthreadVideo
          src={staticFile(file)}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale}) translateX(${x}px)` }}
        />
      </AbsoluteFill>
    );
  }

  const a = (seed * 57 + frame * 0.6) % 360;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(${a}deg, #0b0b0f, ${palette.secondary}55 60%, #0b0b0f)` }}>
      {[0, 1, 2].map((i) => {
        const t = frame / 40 + i * 2 + seed;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 700,
              height: 700,
              borderRadius: "50%",
              filter: "blur(120px)",
              opacity: 0.55,
              background: i === 1 ? palette.secondary : palette.primary,
              left: 190 + Math.sin(t) * 300,
              top: 300 + i * 450 + Math.cos(t * 0.8) * 200,
            }}
          />
        );
      })}
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.05) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,.05) 2px, transparent 2px)",
          backgroundSize: "90px 90px",
          backgroundPosition: `0 ${p * 400}px`,
        }}
      />
    </AbsoluteFill>
  );
};
