/**
 * Demo end-to-end de Vforge Live.
 *
 * 1. Sirve una copia de la app "buggy" (con bugs sembrados).
 * 2. Corre el Forge Loop: el ojo IA detecta los defectos, un "fixer" simulado
 *    aplica el arreglo (reemplaza el código por la versión buena) y el loop
 *    re-ejecuta hasta llegar a CERO defectos.
 *
 * Ejecutar:  pnpm demo   (o)   npx tsx examples/run-demo.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { forgeLoop, serveDir, consoleSummary, forgeBundle } from "../src/index.js";
import type { Scenario } from "../src/types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const scenario: Scenario = JSON.parse(
  fs.readFileSync(path.join(root, "scenarios", "demo.json"), "utf8"),
);

async function main() {
  // Directorio de trabajo mutable = la app "en desarrollo".
  const appDir = path.join(root, "artifacts", "_demo-app");
  fs.mkdirSync(appDir, { recursive: true });
  fs.copyFileSync(
    path.join(root, "demo", "buggy", "index.html"),
    path.join(appDir, "index.html"),
  );

  const srv = await serveDir(appDir);
  console.log(`\n▶ App demo servida en ${srv.url} (arranca con bugs sembrados)\n`);

  try {
    const loop = await forgeLoop(
      {
        baseUrl: srv.url,
        scenarios: [scenario],
        outDir: path.join(root, "artifacts", "demo"),
        failOn: "high",
      },
      {
        maxIterations: 3,
        onIteration: (result, i) => {
          console.log(
            `Iteración ${i}: ${result.passed ? "✅ verde" : "⛔ con defectos"} — ` +
              `blocker:${result.summary.blocker} high:${result.summary.high} ` +
              `medium:${result.summary.medium} low:${result.summary.low}`,
          );
        },
        // "Fixer" simulado: representa a la IA aplicando el arreglo.
        // Aquí simplemente reemplaza el código roto por la versión correcta.
        fix: async (findings, iteration) => {
          console.log(`\n🔧 Iteración ${iteration}: aplicando fixes a ${findings.length} hallazgo(s)...`);
          // Guarda el bug-bundle (prompts que se le pasarían a otra IA).
          fs.writeFileSync(path.join(root, "artifacts", "demo", "bug-bundle.md"), forgeBundle(findings));
          fs.copyFileSync(
            path.join(root, "demo", "good", "index.html"),
            path.join(appDir, "index.html"),
          );
          return true; // aplicamos un cambio → justifica otra pasada
        },
      },
    );

    console.log(consoleSummary(loop.final));
    console.log(
      `\n${loop.reachedZero ? "🎉 CERO DEFECTOS alcanzado" : "⚠️ No se llegó a cero"} en ${loop.iterations} iteración(es).`,
    );
    console.log(`Reporte HTML: ${loop.final.reportPath}\n`);
  } finally {
    await srv.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
