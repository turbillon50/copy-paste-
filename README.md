# 🔭 Vforge Live

**Dispositivos virtuales + ojo IA (graba video) + loop cero-defectos** para QA visual
de apps generadas por IA.

El problema: cuando una IA construye una app, escribe código **a ciegas** — nunca *ve*
el resultado. Unas IAs codean pero no ven; otras ven pero no arreglan. Así se entregan
apps con crashes, layout roto y bugs que solo aparecen cuando un usuario real se queja.

Vforge Live le da a la IA **un teléfono y una computadora digitales** donde **abre la app,
la usa como humano, graba video y detecta defectos**, los clasifica por severidad, genera
un prompt de fix por cada uno, y **repite hasta cero defectos**.

Es **independiente de cualquier app**: recibe una URL (o una carpeta a servir) + un guión
de flujos, y devuelve `{ passed, findings, reportPath }`.

---

## Los 3 pilares

1. **Devices** — navegadores reales (Chromium) con perfiles de dispositivo: `desktop`,
   `iphone`, `pixel`, `ipad`. La IA toca, escribe y navega de verdad.
2. **Vision** — cada corrida graba **video**, `trace.zip` (DOM+red+consola paso a paso),
   screenshots por paso y un **snapshot de accesibilidad** (visión para IAs que no ven).
   Comparador visual (`visual-diff`) mide la fidelidad contra un mockup.
3. **Forge Loop** — corre → clasifica → arregla → re-corre **hasta `defectos == 0`** (con
   presupuesto de iteraciones para no girar infinito).

---

## Instalación

```bash
pnpm install          # instala deps (Chromium ya viene en el entorno)
pnpm build            # compila a dist/
```

## Uso — SDK

```ts
import { check } from "vforge-live";

const result = await check({
  baseUrl: "https://mi-app-preview.vercel.app",
  scenarios: [
    {
      name: "Login y dashboard",
      steps: [
        { action: "goto" },
        { action: "expectVisible", selector: "#login-form" },
        { action: "fill", selector: "#email", value: "demo@vforge.dev" },
        { action: "fill", selector: "#password", value: "secret123" },
        { action: "click", selector: "#login" },
        { action: "expectVisible", selector: "#dashboard" },
        { action: "expectText", text: "Bienvenido" },
      ],
    },
  ],
  devices: undefined, // default: [desktop, iphone]
  failOn: "high",     // gate: falla si hay defectos >= high
});

if (!result.passed) {
  console.log(`${result.findings.length} defectos. Reporte: ${result.reportPath}`);
}
```

### Loop cero-defectos

```ts
import { forgeLoop } from "vforge-live";

const loop = await forgeLoop(
  { baseUrl, scenarios },
  {
    maxIterations: 5,
    fix: async (findings, iteration) => {
      // Aquí conectas a tu IA que aplica los fixes (usa forgePrompt(f) por hallazgo).
      // Devuelve true si aplicaste algún cambio.
      return await miIAArregla(findings);
    },
  },
);
console.log(loop.reachedZero ? "🎉 cero defectos" : "quedaron defectos");
```

## Uso — CLI

```bash
# Contra una URL desplegada:
vforge-live check --url https://mi-app.com --scenario flujo.json

# Sirviendo una carpeta estática (build local, sin desplegar):
vforge-live check --serve ./dist --scenario flujo.json --device desktop,iphone

# Gate estricto para CI (exit code 1 si falla):
vforge-live check --url https://preview.app --scenario flujo.json --fail-on blocker --bundle
```

Opciones: `--url` · `--serve` · `--scenario` (req.) · `--device` · `--out` · `--fail-on`
(`blocker|high|medium|low`) · `--webhook` · `--bundle` · `--headed`.

**Exit code:** `0` si aprueba, `1` si hay defectos ≥ `--fail-on`. Listo para gate de deploy.

---

## Gate de entrega (Fase 3) — "lo que pruebo = lo que entrego"

El gate corre la verificación completa contra la **preview** (el build real) y
**bloquea la promoción a producción** si hay defectos por encima del umbral. Suma
verificaciones HTTP: status 2xx, headers de seguridad, y presupuesto de performance.

```ts
import { deployGate, smokeTest } from "vforge-live";

// Antes de promover a prod:
const decision = await deployGate({ baseUrl: previewUrl, scenarios, failOn: "high" });
if (!decision.promote) throw new Error(decision.reason); // bloquea el deploy

// Después de desplegar, confirma que quedó vivo:
const smoke = await smokeTest("https://mi-app.com", { expectText: "Bienvenido" });
```

CLI (exit code para CI/CD):

```bash
vforge-live gate  --url https://preview.vercel.app --scenario flujo.json   # exit 1 = no promover
vforge-live smoke --url https://mi-app.com --expect-text "Bienvenido"       # exit 1 = deploy roto
```

**CI listo:** `.github/workflows/vforge-live.yml` corre el gate en cada PR (contra la
app demo por defecto; apúntalo a tu preview de Vercel cambiando `--serve` por `--url`)
y sube el reporte —con video— como artifact. Un blocker en el gate = merge bloqueado.

---

## Demo end-to-end

```bash
pnpm demo      # loop cero-defectos (detecta 12 bugs → fix → verde)
pnpm gate      # gate de entrega: BLOQUEAR (buggy) vs PROMOVER (good) + smoke test
```

Sirve una app con **bugs sembrados** (crash de JS, error de consola, 404 de red, imagen
rota, dashboard que no aparece), el ojo IA los detecta (**12 hallazgos**), un "fixer"
simulado aplica el arreglo y el loop re-ejecuta hasta **CERO DEFECTOS**. Abre el reporte:
`artifacts/demo/report.html`.

---

## El scenario-dsl

Guiones declarativos, legibles por humano e IA (`scenarios/demo.json`):

| Acción | Descripción |
|---|---|
| `goto` | Abrir URL (o baseUrl) |
| `click` / `fill` / `press` | Interacción |
| `wait` / `scroll` | Esperar selector/ms · scroll |
| `expectVisible` | Verificar que un elemento se ve |
| `expectText` / `expectNoText` | Verificar (ausencia de) texto |
| `screenshot` | Captura nombrada |

## Qué detecta (y cómo lo clasifica)

| Categoría | Severidad por defecto |
|---|---|
| `crash` (excepción no capturada) | **blocker** |
| `network` 5xx | **blocker** · 4xx → high · 404 → medium |
| `console` error | high · warning → low |
| `functional` (aserción falló) | high |
| `timeout` (spinner infinito / no aparece) | high |
| `asset` (imagen/recurso roto) | medium |
| `visual` (diff vs mockup) | medium |
| `security` (header faltante) | medium / low |
| `performance` (fuera de presupuesto) | medium |
| `deploy` (URL caída / smoke falla) | **blocker** |

Cada hallazgo trae una **huella estable** (fingerprint) para deduplicar y detectar
regresiones, y un **prompt de fix** copy-paste (`forgePrompt` / `--bundle`).

---

## Arquitectura

```
src/
  types.ts         Contrato compartido
  devices.ts       Perfiles de dispositivo + resolución de Chromium
  runner.ts        El ojo: lanza dispositivo, graba video/trace, ejecuta el guión
  classifier.ts    Severidad + categoría + fingerprint + dedupe
  visual-diff.ts   Comparación perceptual contra mockup (pixelmatch)
  prompt-forge.ts  Hallazgo → prompt de fix ejecutable
  report.ts        Reporte HTML con video, timeline y hallazgos
  http-checks.ts   Verificaciones de entrega: status, headers, performance
  gate.ts          deployGate() + smokeTest() — gate de deploy (Fase 3)
  notifier.ts      Resumen en consola + webhook
  static-server.ts Servidor estático sin dependencias
  index.ts         SDK: check() y forgeLoop()
  cli.ts           CLI: check / gate / smoke
.github/workflows/ Gate de QA en cada PR (bloquea merges)
demo/              Apps de prueba (limpia + con bugs sembrados)
scenarios/         Escenarios de ejemplo
examples/          Demo end-to-end del loop
```

Módulo de **Vforge**. MIT.
