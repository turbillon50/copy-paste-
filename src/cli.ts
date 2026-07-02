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
import { check } from "./index.js";
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
Vforge Live — QA visual con ojo IA y loop cero-defectos.

Uso:
  vforge-live check [opciones]

Opciones:
  --url <url>          URL de la app a probar
  --serve <dir>        Sirve una carpeta estática y prueba contra ella (ignora --url)
  --scenario <file>    Archivo JSON con el/los escenario(s)  (requerido)
  --device <lista>     Dispositivos separados por coma. Default: desktop,iphone
                       Opciones: desktop, iphone, pixel, ipad
  --out <dir>          Directorio de artefactos. Default: ./artifacts
  --fail-on <sev>      Severidad que hace fallar el check: blocker|high|medium|low. Default: high
  --webhook <url>      Envía el veredicto por POST a este webhook
  --bundle             Escribe un bug-bundle.md con los prompts de fix
  --headed             Corre con navegador visible (debug)

Ejemplo:
  vforge-live check --serve ./demo/buggy --scenario ./scenarios/demo.json --device desktop,iphone
`;

async function main(): Promise<void> {
  const { cmd, args } = parseArgs(process.argv.slice(2));

  if (cmd === "help" || cmd === "--help" || args.help) {
    console.log(HELP);
    return;
  }

  if (cmd !== "check") {
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

  try {
    const result = await check({
      baseUrl,
      scenarios,
      devices,
      outDir: args.out ? String(args.out) : undefined,
      failOn: (args["fail-on"] as Severity) || undefined,
      headed: Boolean(args.headed),
    });

    console.log(consoleSummary(result));

    if (args.bundle) {
      const bundlePath = path.join(result.outDir, "bug-bundle.md");
      fs.writeFileSync(bundlePath, forgeBundle(result.findings));
      console.log(`Bug bundle: ${bundlePath}`);
    }

    if (args.webhook) await notifyWebhook(String(args.webhook), result);

    process.exitCode = result.passed ? 0 : 1;
  } finally {
    if (stopServer) await stopServer();
  }
}

main().catch((err) => {
  console.error("vforge-live error:", err);
  process.exit(1);
});
