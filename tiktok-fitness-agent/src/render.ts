import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { config } from "./config.js";
import type { RenderProps } from "./schemas.js";
import { log } from "./util.js";

/** Empaqueta la composición una vez por corrida (publicDir = carpeta con voces, B-roll y música del día). */
export async function makeBundle(publicDir: string) {
  log("Empaquetando composición de Remotion…");
  return bundle({ entryPoint: path.resolve("src/remotion/index.ts"), publicDir });
}

export async function renderVideo(serveUrl: string, props: RenderProps, outFile: string) {
  const inputProps = props as unknown as Record<string, unknown>;
  const composition = await selectComposition({
    serveUrl,
    id: "FitnessShort",
    inputProps,
    browserExecutable: config.browserExecutable,
  });
  let last = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outFile,
    inputProps,
    crf: 20,
    browserExecutable: config.browserExecutable,
    chromiumOptions: { gl: "angle" },
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 10) * 10;
      if (pct !== last) {
        last = pct;
        process.stdout.write(`${pct}% `);
      }
    },
  });
  process.stdout.write("\n");
}
