/**
 * Runner — el ojo que ve y graba.
 *
 * Lanza un dispositivo virtual (Chromium real), abre la app, ejecuta el guión
 * paso a paso y captura TODO: video, trace, screenshots por paso, snapshot de
 * accesibilidad, errores de consola, requests fallidos, crashes y aserciones.
 * Devuelve un RunResult con los hallazgos ya clasificados.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type {
  CheckConfig,
  DeviceProfile,
  Finding,
  RunResult,
  Scenario,
  Step,
  StepFrame,
} from "./types.js";
import { resolveChromiumPath } from "./devices.js";
import { toFinding, dedupeFindings, type RawObservation } from "./classifier.js";

const DEFAULT_STEP_TIMEOUT = 8000;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function stepLabel(step: Step): string {
  const note = "note" in step && step.note ? ` — ${step.note}` : "";
  switch (step.action) {
    case "goto":
      return `Abrir ${step.url ?? "(baseUrl)"}${note}`;
    case "click":
      return `Clic en ${step.selector}${note}`;
    case "fill":
      return `Escribir en ${step.selector}${note}`;
    case "press":
      return `Tecla ${step.key}${note}`;
    case "wait":
      return `Esperar ${step.selector ?? step.ms + "ms"}${note}`;
    case "scroll":
      return `Scroll ${step.to ?? step.selector ?? ""}${note}`;
    case "expectVisible":
      return `Verificar visible ${step.selector}${note}`;
    case "expectText":
      return `Verificar texto "${step.text}"${note}`;
    case "expectNoText":
      return `Verificar ausencia de "${step.text}"${note}`;
    case "screenshot":
      return `Captura ${step.name ?? ""}${note}`;
  }
}

export async function runScenario(
  scenario: Scenario,
  device: DeviceProfile,
  config: CheckConfig,
): Promise<RunResult> {
  const started = Date.now();
  const outDir = config.outDir ?? path.resolve("artifacts");
  const stepTimeout = config.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT;
  const startUrl = scenario.startUrl ?? config.baseUrl;

  const runDir = path.join(outDir, `${slug(scenario.name)}__${device.name}`);
  const shotsDir = path.join(runDir, "screenshots");
  const videoDir = path.join(runDir, "video");
  fs.mkdirSync(shotsDir, { recursive: true });
  fs.mkdirSync(videoDir, { recursive: true });

  const observations: RawObservation[] = [];
  const frames: StepFrame[] = [];

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let videoPath: string | undefined;
  let tracePath: string | undefined;
  let a11yPath: string | undefined;
  let finalScreenshot: string | undefined;

  const obs = (o: Omit<RawObservation, "scenario" | "device">) =>
    observations.push({ ...o, scenario: scenario.name, device: device.name });

  try {
    browser = await chromium.launch({
      headless: !config.headed,
      executablePath: resolveChromiumPath(),
    });
    context = await browser.newContext({
      viewport: device.viewport,
      deviceScaleFactor: device.deviceScaleFactor,
      isMobile: device.isMobile,
      hasTouch: device.hasTouch,
      userAgent: device.userAgent,
      recordVideo: { dir: videoDir, size: device.viewport },
    });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

    const page = await context.newPage();
    wireListeners(page, obs);

    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      const label = stepLabel(step);
      const t0 = Date.now();
      let ok = true;
      try {
        await execStep(page, step, { startUrl, stepTimeout, shotsDir, index: i });
      } catch (err) {
        ok = false;
        recordStepFailure(step, i, label, err, shotsDir, page, obs);
      }
      // Screenshot del estado tras el paso (para el timeline).
      const shot = path.join(shotsDir, `step-${String(i).padStart(2, "0")}.png`);
      try {
        await page.screenshot({ path: shot });
      } catch {
        /* la página pudo cerrarse; ignoramos */
      }
      frames.push({
        index: i,
        action: label,
        note: "note" in step ? step.note : undefined,
        screenshot: fs.existsSync(shot) ? path.relative(runDir, shot) : undefined,
        ok,
        ms: Date.now() - t0,
      });
    }

    // Snapshot de accesibilidad — "visión" estructurada para IAs que no ven.
    // ariaSnapshot() devuelve el árbol ARIA en YAML (roles + nombres accesibles).
    try {
      const snap = await page.locator("body").ariaSnapshot();
      a11yPath = path.join(runDir, "a11y.yaml");
      fs.writeFileSync(a11yPath, snap);
    } catch {
      /* opcional */
    }

    // Screenshot final.
    try {
      finalScreenshot = path.join(runDir, "final.png");
      await page.screenshot({ path: finalScreenshot, fullPage: true });
    } catch {
      finalScreenshot = undefined;
    }

    // Cerrar trace y video.
    tracePath = path.join(runDir, "trace.zip");
    await context.tracing.stop({ path: tracePath });

    const video = page.video();
    await context.close();
    context = undefined;
    if (video) {
      try {
        videoPath = await video.path();
      } catch {
        videoPath = undefined;
      }
    }
  } catch (err) {
    obs({
      category: "crash",
      title: "Fallo al inicializar el dispositivo/navegador",
      detail: err instanceof Error ? err.message : String(err),
      severityHint: "blocker",
    });
  } finally {
    try {
      if (context) await context.close();
    } catch {
      /* noop */
    }
    try {
      if (browser) await browser.close();
    } catch {
      /* noop */
    }
  }

  const findings: Finding[] = dedupeFindings(observations.map(toFinding));

  return {
    scenario: scenario.name,
    device: device.name,
    startUrl,
    runDir,
    findings,
    frames,
    videoPath,
    tracePath,
    a11yPath,
    finalScreenshot,
    durationMs: Date.now() - started,
    passed: findings.length === 0,
  };
}

/** Suscribe listeners de consola, red y crashes sobre la página. */
function wireListeners(
  page: Page,
  obs: (o: Omit<RawObservation, "scenario" | "device">) => void,
): void {
  page.on("console", (msg) => {
    const type = msg.type();
    const text = msg.text();
    // "Failed to load resource..." es un eco del navegador de un 404/500 que ya
    // capturamos (con filtro de favicon) en el listener de 'response'. Evitamos
    // duplicar y el ruido del favicon.
    const isResourceEcho = /Failed to load resource/i.test(text);
    if (type === "error" && !isResourceEcho) {
      obs({
        category: "console",
        title: "Error de consola",
        detail: text,
        severityHint: "high",
      });
    } else if (type === "warning") {
      obs({
        category: "console",
        title: "Warning de consola",
        detail: msg.text(),
        severityHint: "low",
      });
    }
  });

  page.on("pageerror", (err) => {
    obs({
      category: "crash",
      title: "Excepción no capturada (crash de JS)",
      detail: err.message,
      severityHint: "blocker",
    });
  });

  page.on("response", (res) => {
    const status = res.status();
    if (status < 400) return;
    const url = res.url();
    if (url.includes("favicon.ico")) return; // ruido conocido
    const isImage = res.request().resourceType() === "image";
    obs({
      category: isImage ? "asset" : "network",
      title: isImage ? `Imagen/recurso roto (${status})` : `Respuesta HTTP ${status}`,
      detail: `${status} en ${url}`,
      status,
    });
  });

  page.on("requestfailed", (req) => {
    const url = req.url();
    if (url.includes("favicon.ico")) return;
    obs({
      category: "network",
      title: "Request fallido (sin respuesta)",
      detail: `${req.failure()?.errorText ?? "error"} en ${url}`,
      severityHint: "high",
    });
  });
}

interface ExecCtx {
  startUrl: string;
  stepTimeout: number;
  shotsDir: string;
  index: number;
}

async function execStep(page: Page, step: Step, ctx: ExecCtx): Promise<void> {
  const timeout = ctx.stepTimeout;
  switch (step.action) {
    case "goto":
      await page.goto(step.url ?? ctx.startUrl, { waitUntil: "load", timeout: timeout * 2 });
      return;
    case "click":
      await page.locator(step.selector).first().click({ timeout });
      return;
    case "fill":
      await page.locator(step.selector).first().fill(step.value, { timeout });
      return;
    case "press":
      await page.keyboard.press(step.key);
      return;
    case "wait":
      if (step.selector) {
        await page.locator(step.selector).first().waitFor({ state: "visible", timeout });
      } else {
        await page.waitForTimeout(step.ms ?? 500);
      }
      return;
    case "scroll":
      if (step.selector) {
        await page.locator(step.selector).first().scrollIntoViewIfNeeded({ timeout });
      } else if (step.to === "bottom") {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      } else {
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      return;
    case "expectVisible":
      await page.locator(step.selector).first().waitFor({ state: "visible", timeout });
      return;
    case "expectText": {
      const loc = step.selector ? page.locator(step.selector).first() : page.locator("body");
      await loc.waitFor({ state: "attached", timeout }).catch(() => {});
      const content = (await loc.textContent({ timeout }).catch(() => "")) ?? "";
      if (!content.includes(step.text)) {
        throw new AssertionError(
          `Se esperaba el texto "${step.text}"${step.selector ? ` en ${step.selector}` : ""}, no se encontró.`,
        );
      }
      return;
    }
    case "expectNoText": {
      const content = (await page.locator("body").textContent().catch(() => "")) ?? "";
      if (content.includes(step.text)) {
        throw new AssertionError(`El texto "${step.text}" NO debería estar presente, pero apareció.`);
      }
      return;
    }
    case "screenshot": {
      const name = step.name ? slug(step.name) : `named-${ctx.index}`;
      await page.screenshot({ path: path.join(ctx.shotsDir, `${name}.png`) });
      return;
    }
  }
}

class AssertionError extends Error {}

function recordStepFailure(
  step: Step,
  index: number,
  label: string,
  err: unknown,
  shotsDir: string,
  page: Page,
  obs: (o: Omit<RawObservation, "scenario" | "device">) => void,
): void {
  const message = err instanceof Error ? err.message : String(err);
  const shot = path.join(shotsDir, `fail-step-${String(index).padStart(2, "0")}.png`);
  // Best-effort screenshot del fallo (no await para no romper el flujo síncrono aquí).
  page.screenshot({ path: shot }).catch(() => {});

  const isTimeout = /Timeout|timeout|exceeded/.test(message);
  const isAssertion = err instanceof AssertionError;

  let category: RawObservation["category"];
  let title: string;
  if (isAssertion) {
    category = "functional";
    title = "Aserción del escenario falló";
  } else if (isTimeout && (step.action === "wait" || step.action === "expectVisible")) {
    category = "timeout";
    title = "Elemento nunca apareció (posible spinner infinito / bloqueo)";
  } else if (isTimeout) {
    category = "timeout";
    title = "Timeout ejecutando el paso";
  } else {
    category = "functional";
    title = "El paso no se pudo ejecutar";
  }

  obs({
    category,
    title,
    detail: `Paso #${index} (${label}): ${message.split("\n")[0]}`,
    stepIndex: index,
    stepNote: "note" in step ? step.note : undefined,
    screenshot: shot,
  });
}
