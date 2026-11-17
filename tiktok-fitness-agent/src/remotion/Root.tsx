import { Composition } from "remotion";
import type { RenderProps } from "../schemas";
import { FitnessShort } from "./FitnessShort";
import { previewProps } from "./preview-props";

export const FPS = 30;

export const Root: React.FC = () => (
  <Composition
    id="FitnessShort"
    component={FitnessShort}
    fps={FPS}
    width={1080}
    height={1920}
    durationInFrames={FPS * 20}
    defaultProps={previewProps as RenderProps}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.ceil(props.durationSec * FPS) })}
  />
);
