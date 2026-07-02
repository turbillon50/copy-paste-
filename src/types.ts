/**
 * Vforge Live — tipos compartidos.
 *
 * Estos tipos son el contrato entre todos los submódulos:
 * Devices → Vision → Forge Loop. No dependen de ninguna app concreta.
 */

/** Severidad de un hallazgo, alineada con el flujo de QA (blocker primero). */
export type Severity = "blocker" | "high" | "medium" | "low";

/** Categoría del hallazgo, para agrupar y enrutar el fix. */
export type Category =
  | "console" // errores/warnings de consola
  | "network" // 4xx/5xx, requests fallidos
  | "crash" // excepción no capturada (pageerror)
  | "functional" // una aserción del escenario falló
  | "asset" // imagen/recurso roto
  | "timeout" // spinner infinito / elemento que nunca aparece
  | "visual" // diferencia contra el mockup/baseline
  | "accessibility"; // contraste, labels, etc.

/** Perfil de dispositivo virtual (celular / computadora). */
export interface DeviceProfile {
  name: string;
  /** Etiqueta legible: "iPhone 13", "Desktop 1440p". */
  label: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  userAgent?: string;
}

/** Un paso del guión de flujo (scenario-dsl). Declarativo, legible por humano e IA. */
export type Step =
  | { action: "goto"; url?: string; note?: string }
  | { action: "click"; selector: string; note?: string }
  | { action: "fill"; selector: string; value: string; note?: string }
  | { action: "press"; key: string; note?: string }
  | { action: "wait"; ms?: number; selector?: string; note?: string }
  | { action: "scroll"; to?: "top" | "bottom"; selector?: string; note?: string }
  | { action: "expectVisible"; selector: string; note?: string }
  | { action: "expectText"; text: string; selector?: string; note?: string }
  | { action: "expectNoText"; text: string; note?: string }
  | { action: "screenshot"; name?: string; note?: string };

/** Un escenario = un flujo de usuario nombrado. */
export interface Scenario {
  name: string;
  description?: string;
  /** Si se define, sobreescribe la baseUrl del check para este escenario. */
  startUrl?: string;
  steps: Step[];
}

/** Un hallazgo (defecto) detectado durante una corrida. */
export interface Finding {
  id: string;
  severity: Severity;
  category: Category;
  /** Resumen corto y accionable. */
  title: string;
  /** Detalle técnico (mensaje de error, URL, status, etc.). */
  detail: string;
  scenario: string;
  device: string;
  /** Índice del paso donde ocurrió (si aplica). */
  stepIndex?: number;
  /** Descripción del paso, para contexto humano. */
  stepNote?: string;
  /** Ruta a un screenshot del momento del fallo, si se capturó. */
  screenshot?: string;
  /** Huella estable para deduplicar y detectar regresiones. */
  fingerprint: string;
}

/** Un frame capturado paso a paso (para el timeline del reporte). */
export interface StepFrame {
  index: number;
  action: string;
  note?: string;
  screenshot?: string;
  ok: boolean;
  ms: number;
}

/** Resultado de correr UN escenario en UN dispositivo. */
export interface RunResult {
  scenario: string;
  device: string;
  startUrl: string;
  /** Directorio raíz de artefactos de esta corrida. */
  runDir: string;
  findings: Finding[];
  frames: StepFrame[];
  /** Ruta al video MP4 (el "ojo" grabado). */
  videoPath?: string;
  /** Ruta al trace.zip de Playwright (DOM + red + consola paso a paso). */
  tracePath?: string;
  /** Snapshot del árbol de accesibilidad (JSON), "visión para IAs ciegas". */
  a11yPath?: string;
  /** Screenshot final de la corrida. */
  finalScreenshot?: string;
  durationMs: number;
  passed: boolean;
}

/** Opciones de un baseline visual para el visual-diff. */
export interface VisualBaseline {
  /** Nombre del escenario o pantalla al que aplica. */
  scenario: string;
  /** Ruta al PNG de referencia (mockup aprobado). */
  baselinePath: string;
  /** Umbral 0..1 de diferencia tolerada. Default 0.02 (2%). */
  threshold?: number;
}

/** Configuración de una verificación completa. */
export interface CheckConfig {
  /** URL base de la app a probar (cualquier app generada por Vforge). */
  baseUrl: string;
  /** Escenarios a correr. */
  scenarios: Scenario[];
  /** Dispositivos donde correr. Default: [desktop, iphone]. */
  devices?: DeviceProfile[];
  /** Directorio de artefactos (video, trace, screenshots, reporte). */
  outDir?: string;
  /** Baselines visuales opcionales para comparar contra mockup. */
  baselines?: VisualBaseline[];
  /** Nivel mínimo de severidad que hace fallar el check (gate). Default "high". */
  failOn?: Severity;
  /** Timeout por paso, en ms. Default 8000. */
  stepTimeoutMs?: number;
  /** Correr con navegador visible (debug). Default false (headless). */
  headed?: boolean;
}

/** Resultado agregado de un check. */
export interface CheckResult {
  baseUrl: string;
  runs: RunResult[];
  findings: Finding[];
  /** Conteo por severidad. */
  summary: Record<Severity, number>;
  /** true si NO hay hallazgos con severidad >= failOn. */
  passed: boolean;
  /** Ruta al reporte HTML navegable. */
  reportPath?: string;
  outDir: string;
  durationMs: number;
}

export const SEVERITY_ORDER: Record<Severity, number> = {
  blocker: 3,
  high: 2,
  medium: 1,
  low: 0,
};
