/**
 * Demo del gate de entrega (Fase 3).
 *
 * Muestra la decisión PROMOVER / BLOQUEAR contra una app buena y una con bugs,
 * y un smoke test post-deploy. Ejecutar: npx tsx examples/run-gate.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deployGate, smokeTest, serveDir, consoleSummary } from "../src/index.js";
import type { Scenario } from "../src/types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const scenario: Scenario = JSON.parse(
  fs.readFileSync(path.join(root, "scenarios", "demo.json"), "utf8"),
);

async function gateAgainst(dir: string, label: string) {
  const srv = await serveDir(path.join(root, dir));
  try {
    const decision = await deployGate({
      baseUrl: srv.url,
      scenarios: [scenario],
      devices: undefined,
      outDir: path.join(root, "artifacts", `gate-${label}`),
      failOn: "high",
    });
    console.log(consoleSummary(decision.result));
    console.log(`🚦 ${label}: ${decision.promote ? "✅ PROMOVER" : "⛔ BLOQUEAR"} — ${decision.reason}\n`);
    return { srv, decision };
  } finally {
    await srv.close();
  }
}

async function main() {
  console.log("\n=== GATE contra app con bugs (debe BLOQUEAR) ===");
  await gateAgainst("demo/buggy", "buggy");

  console.log("=== GATE contra app buena (debe PROMOVER) ===");
  await gateAgainst("demo/good", "good");

  console.log("=== SMOKE test post-deploy (contra app buena) ===");
  const srv = await serveDir(path.join(root, "demo", "good"));
  try {
    const res = await smokeTest(srv.url, {
      expectText: "Iniciar sesión",
      outDir: path.join(root, "artifacts", "smoke"),
    });
    console.log(`💨 SMOKE: ${res.ok ? "✅ OK" : "⛔ FALLÓ"} — ${res.reason}\n`);
  } finally {
    await srv.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
