import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

/** Barra de progreso fina arriba: aumenta la sensación de "falta poco" y la retención. */
export const ProgressBar: React.FC<{ color: string }> = ({ color }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", top: 0, left: 0, height: 12, width: `${(frame / durationInFrames) * 100}%`, background: color, boxShadow: `0 0 20px ${color}` }} />
    </AbsoluteFill>
  );
};
