/**
 * Construye el sitio público de Vforge Live (site/) con EVIDENCIA REAL:
 *
 * 1. Corre el gate de entrega contra la app con bugs (debe BLOQUEAR) y contra
 *    la app buena (debe PROMOVER), más el smoke test post-deploy.
 * 2. Copia los reportes (con video y screenshots) a site/gate/.
 * 3. Renderiza site/index.html (landing) y site/gate/index.html (sala de gate)
 *    desde site-src/ con los números de la corrida.
 *
 * Ejecutar:  pnpm site        (o)  npx tsx examples/build-site.ts
 * Deploy:    site/ es la raíz del proyecto Vercel "vforge-live" (estático).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deployGate, smokeTest, serveDir, forgeBundle } from "../src/index.js";
import type { CheckResult, Finding, Scenario, Severity } from "../src/types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const siteDir = path.join(root, "site");
const srcDir = path.join(root, "site-src");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const scenario: Scenario = JSON.parse(
  fs.readFileSync(path.join(root, "scenarios", "demo.json"), "utf8"),
);

type Label = "buggy" | "good";

interface GateSummary {
  label: Label;
  promote: boolean;
  reason: string;
  summary: Record<Severity, number>;
  total: number;
  durationMs: number;
  devices: string[];
  report: string;
  video: string | null;
  finalShot: string | null;
  findings: Array<Pick<Finding, "severity" | "category" | "title" | "detail" | "device">>;
}

const SKIP = new Set(["trace.zip", "a11y.json"]);

function copyTree(from: string, to: string) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

function rel(base: string, p: string | undefined): string | null {
  if (!p) return null;
  return path.relative(base, p).split(path.sep).join("/");
}

async function gateAgainst(dir: string, label: Label): Promise<GateSummary> {
  const srv = await serveDir(path.join(root, dir));
  const outDir = path.join(root, "artifacts", `gate-${label}`);
  fs.rmSync(outDir, { recursive: true, force: true });
  try {
    const decision = await deployGate({
      baseUrl: srv.url,
      scenarios: [scenario],
      outDir,
      failOn: "high",
    });
    const r: CheckResult = decision.result;
    console.log(`🚦 ${label}: ${decision.promote ? "PROMOVER" : "BLOQUEAR"} — ${decision.reason}`);
    if (!decision.promote) {
      fs.writeFileSync(path.join(outDir, "bug-bundle.md"), forgeBundle(r.findings));
    }
    const desktop = r.runs.find((run) => run.device === "desktop") ?? r.runs[0];
    return {
      label,
      promote: decision.promote,
      reason: decision.reason,
      summary: r.summary,
      total: r.findings.length,
      durationMs: r.durationMs,
      devices: r.runs.map((run) => run.device),
      report: `${label}/report.html`,
      video: desktop?.videoPath ? `${label}/${rel(outDir, desktop.videoPath)}` : null,
      finalShot: desktop?.finalScreenshot ? `${label}/${rel(outDir, desktop.finalScreenshot)}` : null,
      findings: r.findings.map((f) => ({
        severity: f.severity,
        category: f.category,
        title: f.title,
        detail: f.detail,
        device: f.device,
      })),
    };
  } finally {
    await srv.close();
  }
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function findingRows(findings: GateSummary["findings"], limit = 12): string {
  return findings
    .slice(0, limit)
    .map(
      (f) => `<li class="finding" data-sev="${f.severity}">
  <span class="sev">${f.severity}</span>
  <span class="cat">${esc(f.category)}</span>
  <span class="title">${esc(f.title)}</span>
  <span class="dev">${esc(f.device)}</span>
</li>`,
    )
    .join("\n");
}

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : `{{${k}}}`));
}

async function runAll() {
  console.log("\n=== GATE contra app con bugs (debe BLOQUEAR) ===");
  const buggy = await gateAgainst("demo/buggy", "buggy");
  console.log("=== GATE contra app buena (debe PROMOVER) ===");
  const good = await gateAgainst("demo/good", "good");

  console.log("=== SMOKE post-deploy (contra app buena) ===");
  const smokeOut = path.join(root, "artifacts", "smoke");
  fs.rmSync(smokeOut, { recursive: true, force: true });
  const srv = await serveDir(path.join(root, "demo", "good"));
  let smoke: { ok: boolean; reason: string; total: number };
  try {
    const res = await smokeTest(srv.url, { expectText: "Iniciar sesión", outDir: smokeOut });
    smoke = { ok: res.ok, reason: res.reason, total: res.findings.length };
    console.log(`💨 SMOKE: ${res.ok ? "OK" : "FALLÓ"} — ${res.reason}`);
  } finally {
    await srv.close();
  }

  // El demo está bien solo si el gate se comporta: bloquea lo malo y promueve lo bueno.
  if (buggy.promote || !good.promote || !smoke.ok) {
    throw new Error(
      `El gate no se comportó como se esperaba (buggy.promote=${buggy.promote}, good.promote=${good.promote}, smoke=${smoke.ok}). No se publica.`,
    );
  }
  return { buggy, good, smoke, generatedAt: new Date() };
}

async function main() {
  // --render-only: re-renderiza el sitio con la última corrida (site/gate/summary.json) sin volver a correr el gate.
  const renderOnly = process.argv.includes("--render-only");
  const prevSummary = path.join(siteDir, "gate", "summary.json");
  let data: { buggy: GateSummary; good: GateSummary; smoke: { ok: boolean; reason: string; total: number }; generatedAt: Date };
  if (renderOnly && fs.existsSync(prevSummary)) {
    const prev = JSON.parse(fs.readFileSync(prevSummary, "utf8"));
    data = { buggy: prev.buggy, good: prev.good, smoke: prev.smoke, generatedAt: new Date(prev.generatedAt) };
    console.log(`↻ render-only: reutilizando la corrida del ${data.generatedAt.toISOString()}`);
  } else {
    data = await runAll();
  }
  const { buggy, good, smoke, generatedAt } = data;

  // --- Ensamblar site/ ---
  fs.rmSync(siteDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(siteDir, "gate"), { recursive: true });
  copyTree(path.join(root, "artifacts", "gate-buggy"), path.join(siteDir, "gate", "buggy"));
  copyTree(path.join(root, "artifacts", "gate-good"), path.join(siteDir, "gate", "good"));
  copyTree(path.join(root, "artifacts", "smoke"), path.join(siteDir, "gate", "smoke"));
  copyTree(path.join(root, "demo", "buggy"), path.join(siteDir, "demo", "buggy"));
  copyTree(path.join(root, "demo", "good"), path.join(siteDir, "demo", "good"));
  for (const asset of fs.readdirSync(path.join(srcDir, "assets"))) {
    fs.mkdirSync(path.join(siteDir, "assets"), { recursive: true });
    fs.copyFileSync(path.join(srcDir, "assets", asset), path.join(siteDir, "assets", asset));
  }

  const fecha = generatedAt.toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const summaryJson = {
    generatedAt: generatedAt.toISOString(),
    version: pkg.version,
    host: "Hetzner v-forge",
    buggy,
    good,
    smoke,
  };
  fs.writeFileSync(path.join(siteDir, "gate", "summary.json"), JSON.stringify(summaryJson, null, 2));

  const vars: Record<string, string> = {
    VERSION: pkg.version,
    FECHA: fecha,
    BUGGY_TOTAL: String(buggy.total),
    BUGGY_BLOCKER: String(buggy.summary.blocker),
    BUGGY_HIGH: String(buggy.summary.high),
    BUGGY_MEDIUM: String(buggy.summary.medium),
    BUGGY_LOW: String(buggy.summary.low),
    BUGGY_REASON: esc(buggy.reason),
    BUGGY_SECONDS: (buggy.durationMs / 1000).toFixed(1),
    BUGGY_VIDEO: buggy.video ? `gate/${buggy.video}` : "",
    BUGGY_VIDEO_GATE: buggy.video ?? "",
    BUGGY_SHOT: buggy.finalShot ? `gate/${buggy.finalShot}` : "",
    BUGGY_ROWS: findingRows(buggy.findings),
    BUGGY_ROWS_ALL: findingRows(buggy.findings, 100),
    GOOD_TOTAL: String(good.total),
    GOOD_BLOCKING: String(good.summary.blocker + good.summary.high),
    BUGGY_BLOCKING: String(buggy.summary.blocker + buggy.summary.high),
    GOOD_REASON: esc(good.reason),
    GOOD_SECONDS: (good.durationMs / 1000).toFixed(1),
    GOOD_VIDEO_GATE: good.video ?? "",
    GOOD_SHOT: good.finalShot ? `gate/${good.finalShot}` : "",
    GOOD_SHOT_GATE: good.finalShot ?? "",
    SMOKE_OK: smoke.ok ? "OK" : "FALLÓ",
    SMOKE_REASON: esc(smoke.reason),
    DEVICES: String(buggy.devices.length),
    DEVICE_LIST: buggy.devices.join(" · "),
    STEPS: String(scenario.steps.length),
    SCENARIO_NAME: esc(scenario.name),
  };

  fs.writeFileSync(
    path.join(siteDir, "index.html"),
    render(fs.readFileSync(path.join(srcDir, "index.html"), "utf8"), vars),
  );
  fs.writeFileSync(
    path.join(siteDir, "gate", "index.html"),
    render(fs.readFileSync(path.join(srcDir, "gate.html"), "utf8"), vars),
  );

  const bytes = (dir: string): number =>
    fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => {
      const p = path.join(dir, e.name);
      return n + (e.isDirectory() ? bytes(p) : fs.statSync(p).size);
    }, 0);
  console.log(
    `\n✅ site/ listo — ${(bytes(siteDir) / 1024 / 1024).toFixed(1)} MB. buggy=${buggy.total} defectos (BLOQUEAR), good=${good.total} (PROMOVER), smoke=${smoke.ok ? "OK" : "FALLÓ"}.\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
