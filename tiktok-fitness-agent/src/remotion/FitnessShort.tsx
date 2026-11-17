import { loadFont } from "@remotion/fonts";
import m700 from "@fontsource/montserrat/files/montserrat-latin-700-normal.woff2";
import m800 from "@fontsource/montserrat/files/montserrat-latin-800-normal.woff2";
import m900 from "@fontsource/montserrat/files/montserrat-latin-900-normal.woff2";
import { linearTiming, TransitionSeries, type TransitionPresentation } from "@remotion/transitions";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import { fade } from "@remotion/transitions/fade";
import { flip } from "@remotion/transitions/flip";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import React from "react";
import { AbsoluteFill, Audio, staticFile, useVideoConfig } from "remotion";
import type { RenderProps, RenderScene } from "../schemas";
import { Background } from "./components/Background";
import { Captions } from "./components/Captions";
import { Graphic } from "./components/Graphic";
import { OnScreenText } from "./components/OnScreenText";
import { ProgressBar } from "./components/ProgressBar";

// Fuente empaquetada localmente (no depende de Google Fonts en el momento del render).
export const fontFamily = "Montserrat";
for (const [url, weight] of [[m700, "700"], [m800, "800"], [m900, "900"]] as const) {
  loadFont({ family: fontFamily, url, weight });
}

export const TRANSITION_FRAMES = 12;

const DIRS = ["from-right", "from-left", "from-bottom", "from-top"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function presentation(scene: RenderScene, i: number, width: number, height: number): TransitionPresentation<any> {
  const dir = DIRS[i % DIRS.length];
  switch (scene.transitionIn) {
    case "slide":
      return slide({ direction: dir });
    case "wipe":
      return wipe({ direction: dir });
    case "flip":
      return flip({ direction: dir });
    case "clock_wipe":
      return clockWipe({ width, height });
    default:
      return fade();
  }
}

const SceneView: React.FC<{ scene: RenderScene; props: RenderProps; index: number }> = ({ scene, props, index }) => (
  <AbsoluteFill>
    <Background file={scene.brollFile} palette={props.palette} seed={index} />
    <AbsoluteFill
      style={{ background: "linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.1) 35%, rgba(0,0,0,.15) 60%, rgba(0,0,0,.7) 100%)" }}
    />
    <Graphic graphic={scene.graphic} palette={props.palette} sceneFrames={Math.round((scene.endSec - scene.startSec) * 30)} />
    <OnScreenText text={scene.onScreenText} animation={scene.animation} palette={props.palette} isHook={scene.role === "hook"} />
  </AbsoluteFill>
);

export const FitnessShort: React.FC<RenderProps> = (props) => {
  const { fps, width, height } = useVideoConfig();
  const T = TRANSITION_FRAMES;

  // Cada escena (salvo la última) se alarga T frames para que, tras el solapamiento de la
  // transición, cada escena arranque exactamente cuando la voz dice su primera palabra.
  const children: React.ReactNode[] = [];
  props.scenes.forEach((scene, i) => {
    const isLast = i === props.scenes.length - 1;
    const base = Math.max(1, Math.round((scene.endSec - scene.startSec) * fps));
    if (i > 0 && scene.transitionIn !== "cut") {
      children.push(
        <TransitionSeries.Transition
          key={`t${i}`}
          presentation={presentation(scene, i, width, height)}
          timing={linearTiming({ durationInFrames: T })}
        />,
      );
    }
    const next = props.scenes[i + 1];
    const extra = !isLast && next && next.transitionIn !== "cut" ? T : 0;
    children.push(
      <TransitionSeries.Sequence key={`s${i}`} durationInFrames={base + extra}>
        <SceneView scene={scene} props={props} index={i} />
      </TransitionSeries.Sequence>,
    );
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0b0f", fontFamily }}>
      <TransitionSeries>{children}</TransitionSeries>
      <Captions words={props.words} palette={props.palette} emphasis={props.emphasisWords} />
      <ProgressBar color={props.palette.primary} />
      {props.audioFile ? <Audio src={staticFile(props.audioFile)} /> : null}
      {props.musicFile ? <Audio src={staticFile(props.musicFile)} volume={0.1} loop /> : null}
    </AbsoluteFill>
  );
};
