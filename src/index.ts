/**
 * Vforge Live — SDK.
 *
 * Punto de entrada que Vforge invoca tras generar una app:
 *
 *   import { check } from "vforge-live";
 *   const result = await check({ baseUrl, scenarios });
 *   if (!result.passed) { ...usar result.findings / result.reportPath }
 *
 * `check()`  → una pasada de QA visual (ver + grabar + clasificar + reportar).
 * `forgeLoop()` → repite check→fix→check hasta cero defectos.
 */
import path from "node:path";
import type {
  CheckConfig,
  CheckResult,
  Finding,
  RunResult,
  Scenario,
  Severity,
} from "./types.js";
import { SEVERITY_ORDER } from "./types.js";
import { resolveDevices } from "./devices.js";
import { runScenario } from "./runner.js";
import { compareImages, type DiffResult } from "./visual-diff.js";
import { writeReport } from "./report.js";
import { consoleSummary } from "./notifier.js";

export * from "./types.js";
export { DEVICES, DEFAULT_DEVICES, DESKTOP, IPHONE, PIXEL, IPAD } from "./devices.js";
export { serveDir, type StaticServer } from "./static-server.js";
export { forgePrompt, forgeBundle } from "./prompt-forge.js";
export { compareImages, type DiffResult } from "./visual-diff.js";
export { consoleSummary, notifyWebhook } from "./notifier.js";
export { writeReport, renderReport } from "./report.js";
export {
  deployGate,
  smokeTest,
  type GateConfig,
  type GateDecision,
  type SmokeOptions,
  type SmokeResult,
} from "./gate.js";
export { runHttpChecks, type HttpCheckOptions } from "./http-checks.js";

function emptySummary(): Record<Severity, number> {
  return { blocker: 0, high: 0, medium: 0, low: 0 };
}

function summarize(findings: Finding[]): Record<Severity, number> {
  const s = emptySummary();
  for (const f of findings) s[f.severity]++;
  return s;
}

/** Corre todos los escenarios en todos los dispositivos y produce un reporte. */
export async function check(config: CheckConfig): Promise<CheckResult> {
  const started = Date.now();
  const devices = resolveDevices(config.devices?.map((d) => d.name));
  // Si el caller pasó DeviceProfile completos, respétalos; si no, resuelve por nombre.
  const deviceProfiles = config.devices && config.devices.length ? config.devices : devices;
  const outDir = path.resolve(config.outDir ?? "artifacts");
  const failOn: Severity = config.failOn ?? "high";

  const runs: RunResult[] = [];
  for (const scenario of config.scenarios) {
    for (const device of deviceProfiles) {
      const run = await runScenario(scenario, device, { ...config, outDir });
      runs.push(run);
    }
  }

  const findings = runs.flatMap((r) => r.findings);

  // Diff visual opcional contra mockups.
  const diffs: DiffResult[] = [];
  if (config.baselines?.length) {
    for (const base of config.baselines) {
      const run = runs.find((r) => r.scenario === base.scenario && r.finalScreenshot);
      if (!run?.finalScreenshot) continue;
      const outPath = path.join(run.runDir, "visual-diff.png");
      try {
        const d = compareImages(run.finalScreenshot, base.baselinePath, {
          scenario: base.scenario,
          threshold: base.threshold,
          outPath,
        });
        diffs.push(d);
        if (!d.withinThreshold) {
          findings.push({
            id: `visual-${base.scenario}`,
            severity: "medium",
            category: "visual",
            title: `Diferencia visual vs mockup (fidelidad ${d.fidelity}%)`,
            detail: `${d.diffPixels} px distintos (${(d.ratio * 100).toFixed(1)}%). Umbral: ${(
              (base.threshold ?? 0.02) * 100
            ).toFixed(1)}%.`,
            scenario: base.scenario,
            device: run.device,
            screenshot: outPath,
            fingerprint: `visual-${base.scenario}`,
          });
        }
      } catch (err) {
        console.warn(`visual-diff falló para "${base.scenario}": ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  const summary = summarize(findings);
  const passed = !findings.some((f) => SEVERITY_ORDER[f.severity] >= SEVERITY_ORDER[failOn]);

  const result: CheckResult = {
    baseUrl: config.baseUrl,
    runs,
    findings: findings.sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]),
    summary,
    passed,
    outDir,
    durationMs: Date.now() - started,
  };
  result.reportPath = writeReport({ result, diffs });
  return result;
}

export interface ForgeLoopOptions {
  /** Máximo de iteraciones del loop. Default 5. */
  maxIterations?: number;
  /**
   * Función que aplica fixes a los hallazgos. Debe devolver true si aplicó algún
   * cambio (para justificar otra pasada) o false si ya no puede avanzar.
   * Si se omite, el loop corre UNA vez y devuelve el reporte (modo "solo detectar").
   */
  fix?: (findings: Finding[], iteration: number) => Promise<boolean>;
  /** Callback de progreso entre iteraciones. */
  onIteration?: (result: CheckResult, iteration: number) => void;
}

export interface ForgeLoopResult {
  iterations: number;
  history: CheckResult[];
  final: CheckResult;
  reachedZero: boolean;
}

/**
 * Forge Loop — corre check → fix → check hasta cero defectos (o agotar iteraciones).
 * El estado terminal es explícito: no gira infinito.
 */
export async function forgeLoop(
  config: CheckConfig,
  options: ForgeLoopOptions = {},
): Promise<ForgeLoopResult> {
  const maxIterations = options.maxIterations ?? 5;
  const history: CheckResult[] = [];
  let iteration = 0;
  let result = await check(config);
  history.push(result);
  options.onIteration?.(result, iteration);

  while (!result.passed && options.fix && iteration < maxIterations) {
    iteration++;
    const applied = await options.fix(result.findings, iteration);
    if (!applied) break; // el fixer ya no puede avanzar → salir
    result = await check(config);
    history.push(result);
    options.onIteration?.(result, iteration);
  }

  return {
    iterations: iteration,
    history,
    final: result,
    reachedZero: result.findings.length === 0,
  };
}

// Re-export util de consola para conveniencia.
export { consoleSummary as summary };

/**
 * Helpers de autoría tipada (identidad en runtime, autocompletado en el editor).
 * Pensados para que Vforge defina escenarios/config con validación de tipos:
 *
 *   import { defineScenario, check } from "vforge-live";
 *   const login = defineScenario({ name: "Login", steps: [{ action: "goto" }] });
 */
export function defineScenario(scenario: Scenario): Scenario {
  return scenario;
}

export function defineScenarios(scenarios: Scenario[]): Scenario[] {
  return scenarios;
}

export function defineConfig(config: CheckConfig): CheckConfig {
  return config;
}
