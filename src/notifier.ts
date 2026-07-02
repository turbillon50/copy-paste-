/**
 * Notifier — avisa e informa.
 *
 * Imprime un resumen legible en consola y, opcionalmente, hace POST a un webhook
 * (Slack/Discord/servicio propio) con el veredicto. Punto de extensión para
 * push/email en el futuro.
 */
import type { CheckResult } from "./types.js";

export function consoleSummary(result: CheckResult): string {
  const s = result.summary;
  const verdict = result.passed ? "✅ APROBADO" : "⛔ NO APROBADO";
  const lines = [
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🔭 Vforge Live — ${verdict}`,
    `   URL: ${result.baseUrl}`,
    `   Corridas: ${result.runs.length} · Tiempo: ${result.durationMs}ms`,
    `   Defectos → blocker:${s.blocker} high:${s.high} medium:${s.medium} low:${s.low}`,
    result.reportPath ? `   Reporte: ${result.reportPath}` : ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  ].filter(Boolean);
  return lines.join("\n");
}

export async function notifyWebhook(webhookUrl: string, result: CheckResult): Promise<void> {
  const s = result.summary;
  const text =
    `Vforge Live: ${result.passed ? "✅ APROBADO" : "⛔ NO APROBADO"} — ${result.baseUrl}\n` +
    `blocker:${s.blocker} high:${s.high} medium:${s.medium} low:${s.low}`;
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, result: { passed: result.passed, summary: s } }),
    });
  } catch (err) {
    console.warn(`notifier: no se pudo enviar al webhook: ${err instanceof Error ? err.message : err}`);
  }
}
