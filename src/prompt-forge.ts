/**
 * Prompt Forge — traduce cada hallazgo a un prompt ejecutable copy-paste.
 *
 * La idea: una IA "ve" el bug (via runner) y otra IA lo "arregla". Este módulo
 * produce el puente: un prompt técnico, con contexto y el cambio mínimo pedido,
 * listo para pegar en otra sesión de Claude Code.
 */
import type { Finding } from "./types.js";

const HINTS: Record<string, string> = {
  console:
    "Localiza el origen del log en el código; si es un error real, corrígelo; si es ruido, elimínalo o degrádalo a debug.",
  network:
    "Revisa el endpoint que devuelve el status: URL, método, auth y manejo de error en el cliente. Añade manejo de fallo visible al usuario.",
  crash:
    "Es una excepción no capturada: envuelve el punto de fallo, valida entradas nulas/undefined y añade un ErrorBoundary si es UI.",
  functional:
    "El flujo esperado no ocurrió: revisa el handler del paso, el estado y la condición que impide el resultado esperado.",
  asset:
    "Recurso roto: corrige la ruta del asset, o añade fallback/placeholder y lazy-loading con onError.",
  timeout:
    "Algo no aparece a tiempo (posible spinner infinito): añade timeout + estado de error, y verifica la promesa que nunca resuelve.",
  visual:
    "Diferencia contra el mockup: ajusta tokens de diseño (color, espaciado, tipografía) hasta igualar la referencia.",
  accessibility:
    "Problema de accesibilidad: corrige contraste, labels, roles ARIA o tamaño de área táctil.",
};

export function forgePrompt(f: Finding): string {
  const hint = HINTS[f.category] ?? "Investiga la causa raíz y aplica el cambio mínimo.";
  const where = f.stepNote
    ? `Ocurre en el flujo "${f.scenario}", paso: ${f.stepNote}.`
    : `Ocurre en el flujo "${f.scenario}".`;
  return [
    `[${f.severity.toUpperCase()} · ${f.category}] ${f.title}`,
    `Dispositivo: ${f.device}. ${where}`,
    `Síntoma observado por el ojo IA: ${f.detail}`,
    ``,
    `Tarea: ${hint}`,
    `Restricciones: cambio mínimo y quirúrgico. No refactorices de más. Incluye el path exacto del archivo que tocas.`,
    `Verificación: vuelve a correr el escenario "${f.scenario}" en Vforge Live; el hallazgo (fingerprint ${f.fingerprint}) no debe reaparecer.`,
  ].join("\n");
}

/** Genera un "bug bundle" en Markdown con todos los prompts, ordenados por severidad. */
export function forgeBundle(findings: Finding[]): string {
  if (findings.length === 0) return "# Sin defectos 🎉\n\nLa app pasó a cero defectos.\n";
  const lines: string[] = ["# Bug bundle — prompts de fix\n"];
  findings.forEach((f, i) => {
    lines.push(`## ${i + 1}. ${f.title}\n`);
    lines.push("```");
    lines.push(forgePrompt(f));
    lines.push("```\n");
  });
  return lines.join("\n");
}
