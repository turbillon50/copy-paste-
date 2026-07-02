/**
 * Defect Classifier — convierte observaciones crudas en hallazgos tipados.
 *
 * Asigna severidad y categoría, y genera una huella estable para deduplicar
 * y detectar regresiones (mismo bug que reaparece build tras build).
 */
import crypto from "node:crypto";
import type { Category, Finding, Severity } from "./types.js";

export interface RawObservation {
  category: Category;
  title: string;
  detail: string;
  scenario: string;
  device: string;
  stepIndex?: number;
  stepNote?: string;
  screenshot?: string;
  /** Pista de severidad; si no se da, se infiere por categoría/estado. */
  severityHint?: Severity;
  /** Para network: el status code, usado para clasificar. */
  status?: number;
}

/** Reglas de severidad por defecto. */
function inferSeverity(o: RawObservation): Severity {
  if (o.severityHint) return o.severityHint;
  switch (o.category) {
    case "crash":
      return "blocker";
    case "functional":
      return "high";
    case "timeout":
      return "high";
    case "network": {
      const s = o.status ?? 0;
      if (s >= 500) return "blocker";
      if (s === 404) return "medium"; // recurso faltante puntual
      if (s >= 400) return "high";
      return "high"; // request fallido (sin respuesta)
    }
    case "asset":
      return "medium";
    case "console":
      return "high"; // console.error; los warnings entran como low vía hint
    case "visual":
      return "medium";
    case "accessibility":
      return "low";
    case "security":
      return "medium";
    case "performance":
      return "medium";
    case "deploy":
      return "blocker"; // si la entrega en sí falla, bloquea
    default:
      return "medium";
  }
}

function fingerprint(o: RawObservation): string {
  // Huella independiente de datos volátiles (timestamps, ids random):
  // categoría + escenario + título normalizado.
  const norm = `${o.category}|${o.scenario}|${o.title}`
    .toLowerCase()
    .replace(/\d{2,}/g, "#") // colapsa números largos
    .replace(/\s+/g, " ")
    .trim();
  return crypto.createHash("sha1").update(norm).digest("hex").slice(0, 12);
}

export function toFinding(o: RawObservation): Finding {
  const fp = fingerprint(o);
  return {
    id: `${fp}-${o.device}-${o.stepIndex ?? "x"}`,
    severity: inferSeverity(o),
    category: o.category,
    title: o.title,
    detail: o.detail,
    scenario: o.scenario,
    device: o.device,
    stepIndex: o.stepIndex,
    stepNote: o.stepNote,
    screenshot: o.screenshot,
    fingerprint: fp,
  };
}

/** Deduplica por fingerprint+device, conservando el de mayor severidad. */
export function dedupeFindings(findings: Finding[]): Finding[] {
  const order: Record<Severity, number> = { blocker: 3, high: 2, medium: 1, low: 0 };
  const map = new Map<string, Finding>();
  for (const f of findings) {
    const key = `${f.fingerprint}|${f.device}`;
    const prev = map.get(key);
    if (!prev || order[f.severity] > order[prev.severity]) map.set(key, f);
  }
  return [...map.values()].sort((a, b) => order[b.severity] - order[a.severity]);
}
