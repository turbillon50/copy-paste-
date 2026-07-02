/**
 * Static Server — sirve una carpeta por HTTP para poder probar apps locales.
 *
 * Sin dependencias. Útil para el banco de pruebas (app demo) y para cualquier
 * build estático que Vforge quiera verificar sin desplegarlo.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export interface StaticServer {
  url: string;
  port: number;
  close: () => Promise<void>;
}

export async function serveDir(dir: string): Promise<StaticServer> {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    let filePath = path.join(root, urlPath);
    if (urlPath.endsWith("/")) filePath = path.join(filePath, "index.html");
    // Evita path traversal fuera del root.
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
        return;
      }
      res.writeHead(200, { "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream" });
      fs.createReadStream(filePath).pipe(res);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
