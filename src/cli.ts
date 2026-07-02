#!/usr/bin/env node
/**
 * Vforge Live — CLI.
 *
 * Ejemplos:
 *   vforge-live check --url https://mi-app.com --scenario flujo.json
 *   vforge-live check --serve ./dist --scenario flujo.json --device desktop,iphone
 *   vforge-live check --url https://preview.app --scenario flujo.json --fail-on blocker
 */
import fs from "node:fs";
import path from "node:path";
import { check, deployGate, smokeTest } from "./index.js";
import { resolveDevices } from "./devices.js";
import { serveDir } from "./static-server.js";
import { consoleSummary, notifyWebhook } from "./notifier.js";
import { forgeBundle } from "./prompt-forge.js";
import type { Scenario, Severity } from "./types.js";

interface Args {
  [k: string]: string | boolean;
}

function parseArgs(argv: string[]): { cmd: string; args: Args } {
  const cmd = argv[0] ?? "help";
  const args: Args = {};
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return { cmd, args };
}

function loadScenarios(file: string): Scenario[] {
  const raw = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  if (Array.isArray(raw)) return raw as Scenario[];
  if (raw.scenarios) return raw.scenarios as Scenario[];
  return [raw as Scenario];
}

const HELP = `
Vforge Live — QA visual con ojo IA, loop cero-defectos y gate de entrega.

Uso:
  vforge-live check [opciones]     Corre los escenarios y reporta
  vforge-live gate  [opciones]     Gate de deploy: bloquea (exit 1) si no aprueba
  vforge-live smoke [opciones]     Smoke test rápido contra una URL ya desplegada

Opciones (check / gate):
  --url <url>          URL de la app a probar (p.ej. la preview de Vercel)
  --serve <dir>        Sirve una carpeta estática y prueba contra ella (ignora --url)
  --scenario <file>    Archivo JSON con el/los escenario(s)  (requerido)
  --device <lista>     Dispositivos separados por coma. Default: desktop,iphone
                       Opciones: desktop, iphone, pixel, ipad
  --out <dir>          Directorio de artefactos. Default: ./artifacts
  --fail-on <sev>      Severidad que hace fallar: blocker|high|medium|low. Default: high
  --webhook <url>      Envía el veredicto por POST a este webhook
  --bundle             Escribe un bug-bundle.md con los prompts de fix
  --headed             Corre con navegador visible (debug)

Opciones extra de gate:
  --no-http            No correr verificaciones HTTP (status/headers/perf)
  --perf-budget <ms>   Presupuesto de tiempo de respuesta. Default 3000

Opciones de smoke:
  --url <url>          URL de producción (requerido)
  --expect-text <txt>  Texto que debe aparecer (health visible)
  --perf-budget <ms>   Presupuesto de tiempo de respuesta

Ejemplos:
  vforge-live check --serve ./demo/buggy --scenario ./scenarios/demo.json --device desktop,iphone
  vforge-live gate  --url https://mi-app-preview.vercel.app --scenario ./scenarios/demo.json
  vforge-live smoke --url https://mi-app.com --expect-text "Bienvenido"
`;

async function main(): Promise<void> {
  const { cmd, args } = parseArgs(process.argv.slice(2));

  if (cmd === "help" || cmd === "--help" || args.help) {
    console.log(HELP);
    return;
  }

  if (cmd === "smoke") {
    await runSmoke(args);
    return;
  }

  if (cmd !== "check" && cmd !== "gate") {
    console.error(`Comando desconocido: "${cmd}"\n${HELP}`);
    process.exit(2);
  }

  if (!args.scenario) {
    console.error("Falta --scenario <file>\n" + HELP);
    process.exit(2);
  }

  const scenarios = loadScenarios(String(args.scenario));
  const devices = resolveDevices(
    args.device ? String(args.device).split(",").map((s) => s.trim()) : undefined,
  );

  let baseUrl = args.url ? String(args.url) : "";
  let stopServer: (() => Promise<void>) | undefined;
  if (args.serve) {
    const srv = await serveDir(String(args.serve));
    baseUrl = srv.url;
    stopServer = srv.close;
    console.log(`Sirviendo ${args.serve} en ${baseUrl}`);
  }

  if (!baseUrl) {
    console.error("Falta --url <url> (o --serve <dir>)\n" + HELP);
    process.exit(2);
  }

  const common = {
    baseUrl,
    scenarios,
    devices,
    outDir: args.out ? String(args.out) : undefined,
    failOn: (args["fail-on"] as Severity) || undefined,
    headed: Boolean(args.headed),
  };

  try {
    if (cmd === "gate") {
      const decision = await deployGate({
        ...common,
        httpChecks: !args["no-http"],
        http: { perfBudgetMs: args["perf-budget"] ? Number(args["perf-budget"]) : undefined },
      });
      console.log(consoleSummary(decision.result));
      console.log(`\n🚦 GATE: ${decision.promote ? "✅ PROMOVER" : "⛔ BLOQUEAR"} — ${decision.reason}`);
      if (args.bundle) writeBundle(decision.result.outDir, decision.result.findings);
      if (args.webhook) await notifyWebhook(String(args.webhook), decision.result);
      process.exitCode = decision.promote ? 0 : 1;
    } else {
      const result = await check(common);
      console.log(consoleSummary(result));
      if (args.bundle) writeBundle(result.outDir, result.findings);
      if (args.webhook) await notifyWebhook(String(args.webhook), result);
      process.exitCode = result.passed ? 0 : 1;
    }
  } finally {
    if (stopServer) await stopServer();
  }
}

function writeBundle(outDir: string, findings: Parameters<typeof forgeBundle>[0]): void {
  const bundlePath = path.join(outDir, "bug-bundle.md");
  fs.writeFileSync(bundlePath, forgeBundle(findings));
  console.log(`Bug bundle: ${bundlePath}`);
}

async function runSmoke(args: Args): Promise<void> {
  if (!args.url) {
    console.error("smoke requiere --url <url>\n" + HELP);
    process.exit(2);
  }
  const res = await smokeTest(String(args.url), {
    expectText: args["expect-text"] ? String(args["expect-text"]) : undefined,
    outDir: args.out ? String(args.out) : undefined,
    perfBudgetMs: args["perf-budget"] ? Number(args["perf-budget"]) : undefined,
  });
  console.log(`\n💨 SMOKE: ${res.ok ? "✅ OK" : "⛔ FALLÓ"} — ${res.reason}`);
  for (const f of res.findings.slice(0, 10)) {
    console.log(`  [${f.severity}] ${f.title} — ${f.detail}`);
  }
  process.exitCode = res.ok ? 0 : 1;
}

main().catch((err) => {
  console.error("vforge-live error:", err);
  process.exit(1);
});
