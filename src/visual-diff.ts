/**
 * Visual Diff — igualar el "vibe".
 *
 * Compara el render real contra un mockup/baseline aprobado y devuelve el
 * porcentaje de diferencia + una imagen de diff con las zonas distintas en rojo.
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

export interface DiffResult {
  scenario: string;
  diffPixels: number;
  totalPixels: number;
  ratio: number; // 0..1
  /** Score de fidelidad 0..100 (100 = idéntico al mockup). */
  fidelity: number;
  withinThreshold: boolean;
  diffImagePath?: string;
}

/** Redimensiona (recorta/rellena) un PNG a un tamaño dado, para poder comparar. */
function fit(src: PNG, width: number, height: number): PNG {
  if (src.width === width && src.height === height) return src;
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) << 2;
      if (x < src.width && y < src.height) {
        const si = (y * src.width + x) << 2;
        out.data[di] = src.data[si];
        out.data[di + 1] = src.data[si + 1];
        out.data[di + 2] = src.data[si + 2];
        out.data[di + 3] = src.data[si + 3];
      } else {
        out.data[di] = out.data[di + 1] = out.data[di + 2] = 0;
        out.data[di + 3] = 255;
      }
    }
  }
  return out;
}

export function compareImages(
  actualPath: string,
  baselinePath: string,
  opts: { scenario: string; threshold?: number; outPath?: string } = { scenario: "screen" },
): DiffResult {
  const threshold = opts.threshold ?? 0.02;
  const actual = PNG.sync.read(fs.readFileSync(actualPath));
  const baseline = PNG.sync.read(fs.readFileSync(baselinePath));

  const width = Math.max(actual.width, baseline.width);
  const height = Math.max(actual.height, baseline.height);
  const a = fit(actual, width, height);
  const b = fit(baseline, width, height);
  const diff = new PNG({ width, height });

  const diffPixels = pixelmatch(a.data, b.data, diff.data, width, height, {
    threshold: 0.1,
    alpha: 0.4,
  });
  const totalPixels = width * height;
  const ratio = diffPixels / totalPixels;

  let diffImagePath: string | undefined;
  if (opts.outPath) {
    fs.mkdirSync(path.dirname(opts.outPath), { recursive: true });
    fs.writeFileSync(opts.outPath, PNG.sync.write(diff));
    diffImagePath = opts.outPath;
  }

  return {
    scenario: opts.scenario,
    diffPixels,
    totalPixels,
    ratio,
    fidelity: Math.round((1 - ratio) * 1000) / 10,
    withinThreshold: ratio <= threshold,
    diffImagePath,
  };
}
