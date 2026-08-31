/**
 * Ojo Server — adaptador HTTP que expone Vforge Live con el contrato del "Ojo".
 *
 * Pensado para correr en un servicio de larga vida (Hetzner), NO en serverless:
 * Playwright + Chromium + grabación de video necesitan un proceso persistente.
 *
 * El Next.js de vforge ya habla con el Ojo así (ver lib/forja/ojo.ts):
 *   - autenticación por header `X-Ojo-Token` == OJO_TOKEN
 *   - GET  /qa            → último QA por dominio
 *   - POST /qa {dominio}  → corre un check y guarda el resultado
 *   - GET  /queue         → cola de dispatch (ensamblaje)
 * Añadimos además:
 *   - POST /gate {url}    → gate de deploy (promover / bloquear)
 *   - GET  /health        → sonda sin auth
 *   - GET  /artifacts/... → sirve reportes/video/screenshots generados
 *
 * El router de nginx monta esto bajo /ojo, así que aceptamos tanto `/qa`
 * como `/ojo/qa` (se normaliza el prefijo).
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { check, deployGate } from "./index.js";
import type { CheckResult, Finding, Scenario, Severity } from "./types.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webm": "video/webm",
  ".zip": "application/zip",
  ".yaml": "text/yaml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

export interface OjoServerOptions {
  /** Puerto. Default 8787 (o PORT). */
  port?: number;
  /** Token requerido en X-Ojo-Token. Default process.env.OJO_TOKEN. */
  token?: string;
  /** Directorio de artefactos servidos. Default ./artifacts. */
  outDir?: string;
  /** Base pública para armar URLs absolutas de reportes (ej. https://metamcp.vforge.site/ojo). */
  publicBase?: string;
}

interface QaRecord {
  domain: string;
  url: string;
  passed: boolean;
  summary: CheckResult["summary"];
  findingsCount: number;
  topFindings: Array<Pick<Finding, "severity" | "category" | "title">>;
  reportPath: string;
  reportUrl?: string;
  at: string;
}

/** Escenario por defecto cuando el caller no envía uno: abrir la home y observar. */
function defaultScenario(): Scenario {
  return {
    name: "QA home",
    description: "Abrir la home, esperar carga y observar consola/red/crashes.",
    steps: [
      { action: "goto", note: "Abrir la app" },
      { action: "wait", ms: 1500, note: "Dejar que hidrate" },
      { action: "screenshot", name: "home", note: "Estado inicial" },
      { action: "scroll", to: "bottom", note: "Recorrer la página" },
      { action: "screenshot", name: "home-bottom", note: "Tras scroll" },
    ],
  };
}

function normalizeUrl(input: string): string {
  const raw = input.trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw.replace(/^\/+/, "")}`;
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(payload);
}

function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function toRecord(domain: string, url: string, result: CheckResult, publicBase?: string): QaRecord {
  const reportRel = path.relative(result.outDir, result.reportPath ?? "").split(path.sep).join("/");
  const runName = path.basename(result.outDir);
  const reportUrl = publicBase
    ? `${publicBase.replace(/\/$/, "")}/artifacts/${runName}/${reportRel}`
    : undefined;
  return {
    domain,
    url,
    passed: result.passed,
    summary: result.summary,
    findingsCount: result.findings.length,
    topFindings: result.findings.slice(0, 8).map((f) => ({
      severity: f.severity,
      category: f.category,
      title: f.title,
    })),
    reportPath: result.reportPath ?? "",
    reportUrl,
    at: new Date().toISOString(),
  };
}

export function createOjoServer(opts: OjoServerOptions = {}): http.Server {
  const token = opts.token ?? process.env.OJO_TOKEN ?? "";
  const outDir = path.resolve(opts.outDir ?? process.env.OJO_OUT_DIR ?? "artifacts");
  const publicBase = opts.publicBase ?? process.env.OJO_PUBLIC_BASE;
  const statePath = path.join(outDir, "ojo-state.json");
  fs.mkdirSync(outDir, { recursive: true });

  const loadState = (): Record<string, QaRecord> => {
    try {
      return JSON.parse(fs.readFileSync(statePath, "utf8"));
    } catch {
      return {};
    }
  };
  const saveState = (s: Record<string, QaRecord>) => {
    try {
      fs.writeFileSync(statePath, JSON.stringify(s, null, 2));
    } catch {
      /* noop */
    }
  };

  const authOk = (req: http.IncomingMessage): boolean => {
    if (!token) return true; // sin token configurado = modo abierto (solo dev)
    return req.headers["x-ojo-token"] === token;
  };

  const server = http.createServer(async (req, res) => {
    const method = req.method ?? "GET";
    const rawPath = (req.url ?? "/").split("?")[0];
    // Normaliza el prefijo /ojo montado por nginx.
    const route = rawPath.replace(/^\/ojo(?=\/|$)/, "") || "/";

    // Sonda sin auth.
    if (route === "/health" || route === "/") {
      return send(res, 200, { ok: true, service: "vforge-live-ojo", ts: Date.now() });
    }

    // Servir artefactos (reportes, video, screenshots).
    if (method === "GET" && route.startsWith("/artifacts/")) {
      const rel = decodeURIComponent(route.slice("/artifacts/".length));
      const filePath = path.join(outDir, rel);
      if (!filePath.startsWith(outDir) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.writeHead(404).end("not found");
        return;
      }
      res.writeHead(200, { "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream" });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    if (!authOk(req)) return send(res, 403, { error: "forbidden" });

    // GET /qa → último QA por dominio.
    if (method === "GET" && route === "/qa") {
      return send(res, 200, { ok: true, last: loadState() });
    }

    // POST /qa {dominio} → corre un check y guarda el resultado.
    if (method === "POST" && route === "/qa") {
      const body = await readJson(req);
      const dominio = String(body.dominio ?? body.domain ?? "").trim();
      if (!dominio) return send(res, 400, { error: "dominio_requerido" });
      const url = normalizeUrl(dominio);
      const scenarios = (Array.isArray(body.scenarios) ? body.scenarios : [body.scenario ?? defaultScenario()]) as Scenario[];
      try {
        const result = await check({
          baseUrl: url,
          scenarios,
          outDir: path.join(outDir, `qa-${Date.now()}`),
          failOn: (body.failOn as Severity) ?? "high",
        });
        const record = toRecord(dominio, url, result, publicBase);
        const state = loadState();
        state[dominio] = record;
        saveState(state);
        return send(res, 200, { ok: true, ...record });
      } catch (e) {
        return send(res, 500, { error: "qa_failed", detail: String(e).slice(0, 200) });
      }
    }

    // POST /gate {url} → gate de deploy.
    if (method === "POST" && route === "/gate") {
      const body = await readJson(req);
      const target = String(body.url ?? body.dominio ?? body.domain ?? "").trim();
      if (!target) return send(res, 400, { error: "url_requerida" });
      const url = normalizeUrl(target);
      const scenarios = (Array.isArray(body.scenarios) ? body.scenarios : [body.scenario ?? defaultScenario()]) as Scenario[];
      try {
        const decision = await deployGate({
          baseUrl: url,
          scenarios,
          outDir: path.join(outDir, `gate-${Date.now()}`),
          failOn: (body.failOn as Severity) ?? "high",
        });
        const record = toRecord(url, url, decision.result, publicBase);
        return send(res, 200, { ok: true, promote: decision.promote, reason: decision.reason, ...record });
      } catch (e) {
        return send(res, 500, { error: "gate_failed", detail: String(e).slice(0, 200) });
      }
    }

    // GET /queue → cola de dispatch (stub; el ensamblaje real vive en el Brain).
    if (method === "GET" && route === "/queue") {
      return send(res, 200, { ok: true, queue: [], note: "conecta aquí la dispatch_queue del Brain si aplica" });
    }

    return send(res, 404, { error: "not_found", route });
  });

  const port = opts.port ?? Number(process.env.PORT ?? 8787);
  server.listen(port, () => {
    console.log(`🔭 Ojo server (vforge-live) escuchando en :${port}`);
    if (!token) console.warn("⚠️  OJO_TOKEN no configurado — modo abierto (solo para desarrollo).");
  });
  return server;
}

// Permite `node dist/ojo-server.js` directo.
if (process.argv[1] && /ojo-server\.(ts|js)$/.test(process.argv[1])) {
  createOjoServer();
}
