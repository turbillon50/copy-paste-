/**
 * HTTP Checks — verificaciones de entrega a nivel de red.
 *
 * Complementan al ojo (que corre en el navegador) con chequeos del "sobre":
 * ¿responde 200?, ¿trae headers de seguridad?, ¿el cache es sano?, ¿es rápido?
 * Todo esto forma parte de una entrega confiable (Fase 3).
 */
import type { Finding, Severity } from "./types.js";
import { toFinding, type RawObservation } from "./classifier.js";

export interface HttpCheckOptions {
  /** Presupuesto de tiempo de respuesta (ms). Default 3000. */
  perfBudgetMs?: number;
  /** Verificar headers de seguridad. Default true. */
  headers?: boolean;
  /** Etiqueta de escenario para los hallazgos. Default "entrega". */
  scenario?: string;
}

/** Headers de seguridad recomendados y su severidad si faltan. */
const SECURITY_HEADERS: Array<{ name: string; severity: Severity; why: string }> = [
  { name: "x-content-type-options", severity: "low", why: "evita MIME sniffing (nosniff)" },
  { name: "x-frame-options", severity: "medium", why: "evita clickjacking (o usa CSP frame-ancestors)" },
  { name: "strict-transport-security", severity: "medium", why: "fuerza HTTPS (solo aplica en https)" },
  { name: "content-security-policy", severity: "low", why: "mitiga XSS e inyección de contenido" },
];

export async function runHttpChecks(
  url: string,
  opts: HttpCheckOptions = {},
): Promise<Finding[]> {
  const scenario = opts.scenario ?? "entrega";
  const perfBudget = opts.perfBudgetMs ?? 3000;
  const checkHeaders = opts.headers ?? true;
  const raw: RawObservation[] = [];
  const add = (o: Omit<RawObservation, "scenario" | "device">) =>
    raw.push({ ...o, scenario, device: "http" });

  const t0 = Date.now();
  let res: Response | undefined;
  try {
    res = await fetch(url, { method: "GET", redirect: "follow" });
  } catch (err) {
    add({
      category: "deploy",
      title: "La URL no respondió",
      detail: `${err instanceof Error ? err.message : String(err)} — ${url}`,
      severityHint: "blocker",
    });
    return raw.map(toFinding);
  }
  const elapsed = Date.now() - t0;

  if (!res.ok) {
    add({
      category: "deploy",
      title: `La URL respondió HTTP ${res.status}`,
      detail: `Se esperaba 2xx en ${url}, llegó ${res.status} ${res.statusText}.`,
      status: res.status,
      severityHint: res.status >= 500 ? "blocker" : "high",
    });
  }

  if (elapsed > perfBudget) {
    add({
      category: "performance",
      title: `Respuesta lenta (${elapsed}ms)`,
      detail: `Tiempo hasta respuesta ${elapsed}ms > presupuesto ${perfBudget}ms en ${url}.`,
    });
  }

  if (checkHeaders && res.ok) {
    const isHttps = url.startsWith("https://");
    for (const h of SECURITY_HEADERS) {
      if (h.name === "strict-transport-security" && !isHttps) continue;
      if (!res.headers.get(h.name)) {
        add({
          category: "security",
          title: `Falta header de seguridad: ${h.name}`,
          detail: `${h.name} — ${h.why}. No presente en la respuesta de ${url}.`,
          severityHint: h.severity,
        });
      }
    }
  }

  return raw.map(toFinding);
}
