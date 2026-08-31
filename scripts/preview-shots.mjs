import { chromium } from "playwright";
import { serveDir } from "../dist/static-server.js";
const srv = await serveDir("/root/copy-paste/site");
const b = await chromium.launch();
const shots = [
  ["landing-desktop", "/", 1440, 900, true],
  ["landing-mobile", "/", 390, 844, true],
  ["gate-admin", "/gate/", 1280, 800, true],
  ["report-buggy", "/gate/buggy/report.html", 1280, 800, false],
];
for (const [name, p, w, h, full] of shots) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("requestfailed", r => errs.push("REQFAIL " + r.url()));
  const res = await page.goto(srv.url + p, { waitUntil: "networkidle" });
  await page.evaluate(() => { document.querySelectorAll('.rv').forEach(e => e.classList.add('in')); document.querySelectorAll('[data-count]').forEach(e => e.textContent = e.getAttribute('data-count')); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `/tmp/shot-${name}.jpg`, fullPage: full, type: "jpeg", quality: 72 });
  console.log(name, res.status(), "errors:", errs.length ? errs.join(" | ") : "none");
  await ctx.close();
}
await b.close(); await srv.close();
