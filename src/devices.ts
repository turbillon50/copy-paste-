/**
 * Devices — dispositivos virtuales.
 *
 * Perfiles de "celular" y "computadora" reales sobre los que la IA abre,
 * toca y navega la app. Cada perfil define viewport, escala, touch y UA.
 */
import fs from "node:fs";
import path from "node:path";
import type { DeviceProfile } from "./types.js";

/** Computadora de escritorio a 1440p. */
export const DESKTOP: DeviceProfile = {
  name: "desktop",
  label: "Computadora 1440p",
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
  userAgent:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
};

/** Celular tipo iPhone 13 (con notch → prueba de safe-area). */
export const IPHONE: DeviceProfile = {
  name: "iphone",
  label: "iPhone 13",
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
};

/** Celular Android tipo Pixel 7. */
export const PIXEL: DeviceProfile = {
  name: "pixel",
  label: "Pixel 7",
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2.625,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36",
};

/** Tablet tipo iPad. */
export const IPAD: DeviceProfile = {
  name: "ipad",
  label: "iPad",
  viewport: { width: 820, height: 1180 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
};

export const DEVICES: Record<string, DeviceProfile> = {
  desktop: DESKTOP,
  iphone: IPHONE,
  pixel: PIXEL,
  ipad: IPAD,
};

/** Default: una computadora y un celular (los dos "aparatos" que pediste). */
export const DEFAULT_DEVICES: DeviceProfile[] = [DESKTOP, IPHONE];

export function resolveDevices(names?: string[]): DeviceProfile[] {
  if (!names || names.length === 0) return DEFAULT_DEVICES;
  return names.map((n) => {
    const d = DEVICES[n.toLowerCase()];
    if (!d) throw new Error(`Dispositivo desconocido: "${n}". Opciones: ${Object.keys(DEVICES).join(", ")}`);
    return d;
  });
}

/**
 * Encuentra el binario de Chromium instalado en el entorno.
 * Preferimos executablePath explícito para no depender del match exacto
 * entre la versión npm de Playwright y la revisión del navegador.
 */
export function resolveChromiumPath(): string | undefined {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!fs.existsSync(base)) return undefined;
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(base);
  } catch {
    return undefined;
  }
  // Preferir el chromium completo (soporta grabación de video) sobre el headless_shell.
  const full = entries
    .filter((e) => /^chromium-\d+$/.test(e))
    .sort()
    .reverse();
  for (const dir of full) {
    const bin = path.join(base, dir, "chrome-linux", "chrome");
    if (fs.existsSync(bin)) return bin;
  }
  const shell = entries
    .filter((e) => /^chromium_headless_shell-\d+$/.test(e))
    .sort()
    .reverse();
  for (const dir of shell) {
    const bin = path.join(base, dir, "chrome-linux", "headless_shell");
    if (fs.existsSync(bin)) return bin;
  }
  return undefined;
}
