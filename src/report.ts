/**
 * Report — reporte HTML navegable, autocontenible.
 *
 * Muestra: resumen por severidad, video de cada corrida (el ojo grabado),
 * timeline de pasos con screenshots, hallazgos priorizados con su prompt de
 * fix, y (si hay) el diff visual contra el mockup.
 */
import fs from "node:fs";
import path from "node:path";
import type { CheckResult, Finding, RunResult, Severity } from "./types.js";
import type { DiffResult } from "./visual-diff.js";
import { forgePrompt } from "./prompt-forge.js";

const SEV_COLOR: Record<Severity, string> = {
  blocker: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#6b7280",
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rel(outDir: string, p?: string): string | undefined {
  if (!p) return undefined;
  return path.relative(outDir, p).split(path.sep).join("/");
}

function findingCard(f: Finding, outDir: string): string {
  const shot = rel(outDir, f.screenshot);
  return `
  <div class="finding" style="border-left:4px solid ${SEV_COLOR[f.severity]}">
    <div class="finding-head">
      <span class="badge" style="background:${SEV_COLOR[f.severity]}">${f.severity.toUpperCase()}</span>
      <span class="cat">${esc(f.category)}</span>
      <strong>${esc(f.title)}</strong>
      <span class="meta">· ${esc(f.scenario)} · ${esc(f.device)}</span>
    </div>
    <div class="detail">${esc(f.detail)}</div>
    ${shot ? `<img class="thumb" src="${esc(shot)}" loading="lazy" alt="captura del fallo"/>` : ""}
    <details><summary>Prompt de fix (copy-paste)</summary><pre>${esc(forgePrompt(f))}</pre></details>
  </div>`;
}

function runSection(run: RunResult, outDir: string): string {
  const video = rel(outDir, run.videoPath);
  const frames = run.frames
    .map((fr) => {
      const src = fr.screenshot
        ? rel(outDir, path.join(run.runDir, fr.screenshot)) ?? fr.screenshot
        : undefined;
      return `<div class="frame ${fr.ok ? "ok" : "bad"}">
        ${src ? `<img loading="lazy" src="${esc(src)}" alt="paso ${fr.index}"/>` : ""}
        <div class="frame-cap">#${fr.index} ${fr.ok ? "✅" : "❌"} ${esc(fr.action)}</div>
      </div>`;
    })
    .join("");
  return `
  <section class="run">
    <h3>${esc(run.scenario)} <span class="meta">· ${esc(run.device)} · ${run.durationMs}ms · ${
      run.passed ? '<span class="pass">PASÓ</span>' : `<span class="fail">${run.findings.length} defecto(s)</span>`
    }</span></h3>
    ${
      video
        ? `<video controls preload="metadata" src="${esc(video)}" class="video"></video>`
        : `<div class="novideo">Sin video (la corrida no llegó a grabar)</div>`
    }
    <div class="timeline">${frames}</div>
  </section>`;
}

export interface ReportInput {
  result: CheckResult;
  diffs?: DiffResult[];
}

export function renderReport(input: ReportInput): string {
  const { result, diffs = [] } = input;
  const outDir = result.outDir;
  const s = result.summary;
  const cards = result.findings.map((f) => findingCard(f, outDir)).join("");
  const runs = result.runs.map((r) => runSection(r, outDir)).join("");
  const diffSection = diffs.length
    ? `<section><h2>Fidelidad visual (vs mockup)</h2>${diffs
        .map((d) => {
          const img = rel(outDir, d.diffImagePath);
          return `<div class="diff">
            <strong>${esc(d.scenario)}</strong> — fidelidad ${d.fidelity}%
            (${d.withinThreshold ? '<span class="pass">dentro de umbral</span>' : '<span class="fail">fuera de umbral</span>'})
            ${img ? `<img class="thumb" loading="lazy" src="${esc(img)}" alt="diff visual"/>` : ""}
          </div>`;
        })
        .join("")}</section>`
    : "";

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Vforge Live — Reporte</title>
<style>
  :root{color-scheme:light dark}
  body{font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#0b0f17;color:#e5e7eb}
  header{padding:24px 32px;background:linear-gradient(135deg,#1e293b,#0b0f17);border-bottom:1px solid #1f2937}
  h1{margin:0 0 4px;font-size:22px}
  .sub{color:#94a3b8;font-size:13px}
  main{padding:24px 32px;max-width:1100px;margin:0 auto}
  .cards{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0 28px}
  .stat{flex:1;min-width:120px;background:#111827;border:1px solid #1f2937;border-radius:12px;padding:16px}
  .stat .n{font-size:28px;font-weight:700}
  .stat .l{font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em}
  h2{margin:28px 0 12px;font-size:18px;border-bottom:1px solid #1f2937;padding-bottom:8px}
  .finding{background:#111827;border-radius:10px;padding:14px 16px;margin:10px 0}
  .finding-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .badge{color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px}
  .cat{font-size:12px;color:#93c5fd;background:#1e3a8a33;padding:2px 8px;border-radius:999px}
  .meta{color:#94a3b8;font-size:12px}
  .detail{margin:8px 0;color:#cbd5e1;font-size:14px;word-break:break-word}
  .thumb{max-width:320px;border-radius:8px;border:1px solid #1f2937;margin-top:8px}
  details{margin-top:8px}
  summary{cursor:pointer;color:#93c5fd;font-size:13px}
  pre{background:#0b0f17;border:1px solid #1f2937;border-radius:8px;padding:12px;overflow:auto;font-size:12px;white-space:pre-wrap}
  .run{background:#0d1420;border:1px solid #1f2937;border-radius:12px;padding:16px;margin:16px 0}
  .video{max-width:520px;width:100%;border-radius:10px;border:1px solid #1f2937;background:#000}
  .novideo{color:#94a3b8;font-size:13px;padding:8px 0}
  .timeline{display:flex;gap:8px;overflow-x:auto;padding:12px 0}
  .frame{flex:0 0 160px}
  .frame img{width:160px;border-radius:8px;border:2px solid #1f2937}
  .frame.bad img{border-color:#dc2626}
  .frame.ok img{border-color:#16a34a55}
  .frame-cap{font-size:11px;color:#94a3b8;margin-top:4px}
  .pass{color:#22c55e;font-weight:700}
  .fail{color:#f87171;font-weight:700}
  .verdict{font-size:16px;font-weight:700;padding:12px 16px;border-radius:10px;margin:8px 0 0}
</style></head>
<body>
<header>
  <h1>🔭 Vforge Live — Reporte de entrega</h1>
  <div class="sub">${esc(result.baseUrl)} · ${result.runs.length} corrida(s) · ${result.durationMs}ms</div>
  <div class="verdict" style="background:${result.passed ? "#052e16" : "#450a0a"};color:${
    result.passed ? "#22c55e" : "#f87171"
  }">${result.passed ? "✅ APROBADO — cero defectos que bloqueen la entrega" : "⛔ NO APROBADO — hay defectos por encima del umbral"}</div>
</header>
<main>
  <div class="cards">
    <div class="stat"><div class="n" style="color:${SEV_COLOR.blocker}">${s.blocker}</div><div class="l">Blocker</div></div>
    <div class="stat"><div class="n" style="color:${SEV_COLOR.high}">${s.high}</div><div class="l">High</div></div>
    <div class="stat"><div class="n" style="color:${SEV_COLOR.medium}">${s.medium}</div><div class="l">Medium</div></div>
    <div class="stat"><div class="n" style="color:${SEV_COLOR.low}">${s.low}</div><div class="l">Low</div></div>
  </div>
  ${diffSection}
  <h2>Hallazgos priorizados (${result.findings.length})</h2>
  ${cards || '<p class="pass">Sin hallazgos. 🎉</p>'}
  <h2>Corridas — el ojo grabado</h2>
  ${runs}
</main>
</body></html>`;
}

export function writeReport(input: ReportInput): string {
  const outPath = path.join(input.result.outDir, "report.html");
  fs.mkdirSync(input.result.outDir, { recursive: true });
  fs.writeFileSync(outPath, renderReport(input));
  return outPath;
}
