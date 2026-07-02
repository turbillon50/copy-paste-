/**
 * Deploy Gate — entrega confiable (Fase 3).
 *
 * "Lo que pruebo = lo que entrego." El gate corre la verificación completa contra
 * la URL de PREVIEW (el build real, antes de promover). Si hay defectos por encima
 * del umbral, la decisión es NO PROMOVER. Pensado para bloquear en CI/CD.
 *
 *   const decision = await deployGate({ baseUrl: previewUrl, scenarios });
 *   if (!decision.promote) process.exit(1); // bloquea el deploy a prod
 */
import path from "node:path";
import type { CheckConfig, CheckResult, Finding, Severity } from "./types.js";
import { SEVERITY_ORDER } from "./types.js";
import { check } from "./index.js";
import { runHttpChecks, type HttpCheckOptions } from "./http-checks.js";
import { writeReport } from "./report.js";

export interface GateConfig extends CheckConfig {
  /** Verificaciones HTTP (status, headers, performance) sobre baseUrl. Default true. */
  httpChecks?: boolean;
  /** Opciones de las verificaciones HTTP. */
  http?: HttpCheckOptions;
}

export interface GateDecision {
  /** true = seguro promover a producción. */
  promote: boolean;
  /** Explicación legible de la decisión. */
  reason: string;
  /** Resultado completo (incluye findings del ojo + HTTP). */
  result: CheckResult;
}

export async function deployGate(config: GateConfig): Promise<GateDecision> {
  const failOn: Severity = config.failOn ?? "high";
  const result = await check(config);

  // Añade verificaciones HTTP de entrega sobre la misma URL.
  let httpFindings: Finding[] = [];
  if (config.httpChecks !== false) {
    httpFindings = await runHttpChecks(config.baseUrl, {
      scenario: "entrega",
      ...config.http,
    });
  }

  if (httpFindings.length) {
    result.findings = [...result.findings, ...httpFindings].sort(
      (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity],
    );
    for (const f of httpFindings) result.summary[f.severity]++;
    result.passed = !result.findings.some(
      (f) => SEVERITY_ORDER[f.severity] >= SEVERITY_ORDER[failOn],
    );
    // Regenera el reporte incluyendo los hallazgos HTTP.
    result.reportPath = writeReport({ result });
  }

  const blocking = result.findings.filter(
    (f) => SEVERITY_ORDER[f.severity] >= SEVERITY_ORDER[failOn],
  );

  return {
    promote: result.passed,
    reason: result.passed
      ? `Sin defectos ≥ ${failOn}. Seguro promover a producción.`
      : `${blocking.length} defecto(s) ≥ ${failOn} bloquean la promoción (${blocking
          .slice(0, 3)
          .map((f) => f.title)
          .join("; ")}${blocking.length > 3 ? "…" : ""}).`,
    result,
  };
}

export interface SmokeOptions {
  /** Texto que debe aparecer en la página (health visible). */
  expectText?: string;
  outDir?: string;
  perfBudgetMs?: number;
}

export interface SmokeResult {
  ok: boolean;
  findings: Finding[];
  reason: string;
}

/**
 * Smoke test post-deploy: verificación mínima contra la URL YA en producción.
 * Confirma que el deploy quedó vivo (200 + carga + texto esperado). Rápido.
 */
export async function smokeTest(url: string, opts: SmokeOptions = {}): Promise<SmokeResult> {
  const outDir = path.resolve(opts.outDir ?? "artifacts/smoke");
  const result = await check({
    baseUrl: url,
    outDir,
    failOn: "high",
    scenarios: [
      {
        name: "Smoke post-deploy",
        steps: [
          { action: "goto", note: "Abrir la URL de producción" },
          ...(opts.expectText
            ? [{ action: "expectText" as const, text: opts.expectText, note: "Contenido esperado visible" }]
            : []),
          { action: "screenshot", name: "prod", note: "Estado en producción" },
        ],
      },
    ],
  });
  const httpFindings = await runHttpChecks(url, {
    scenario: "Smoke post-deploy",
    perfBudgetMs: opts.perfBudgetMs,
  });
  const findings = [...result.findings, ...httpFindings];
  const ok = !findings.some((f) => SEVERITY_ORDER[f.severity] >= SEVERITY_ORDER.high);
  return {
    ok,
    findings,
    reason: ok
      ? "Deploy vivo y sano en producción."
      : `El deploy en producción tiene ${findings.length} problema(s).`,
  };
}
