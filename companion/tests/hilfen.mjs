// Gemeinsame Test-Hilfen: Companion über http ausliefern (für Canvas-Pixel und ES-Module
// braucht der Rüstungs-Baukasten http statt file://) und three.js vom CDN lokal beantworten.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { networkInterfaces } from "node:os";

const HIER = fileURLToPath(new URL(".", import.meta.url));
export const COMPANION = path.join(HIER, "..");
export const THREE_URL = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
const TYPEN = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".gz": "application/gzip", ".wasm": "application/wasm" };

/** Kleiner statischer Server für den Companion-Ordner → { adresse, schliessen() } */
export async function companionAusliefern(port) {
  const server = createServer(async (req, res) => {
    const pfad = path.normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^[/\\]+/, "");
    const datei = path.join(COMPANION, pfad);
    if (path.relative(COMPANION, datei).startsWith("..")) { res.writeHead(403).end(); return; }
    try {
      const inhalt = await readFile(datei);
      res.writeHead(200, { "content-type": TYPEN[path.extname(datei)] ?? "application/octet-stream" }).end(inhalt);
    } catch {
      res.writeHead(404, { "content-type": "application/json" }).end('{"fehler":"Nicht gefunden"}');
    }
  });
  await new Promise((ok) => server.listen(port, "127.0.0.1", ok));
  return { adresse: `http://127.0.0.1:${port}`, schliessen: () => new Promise((ok) => server.close(ok)) };
}

/** three.js-Anfragen ans CDN (hier gesperrt) aus node_modules beantworten */
export async function threeUmleiten(ziel) {
  const code = await readFile(path.join(HIER, "node_modules/three/build/three.min.js"));
  await ziel.route(THREE_URL, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: code,
    headers: { "access-control-allow-origin": "*" } }));
}

/** Anzeige-Link der ersten Anzeige („Board“) als Query „?anzeige=…&schluessel=…“. Seit Umbau Phase 1 braucht jedes
 *  Gerät einen Zugang, auch das Board-Gerät selbst (localhost): diesen Link (bis L6) oder den Anzeige-Token aus dem
 *  Dashboard-Login (L5). Der Server schreibt den Link nach <Datenordner>/anzeige-link.txt. */
export async function anzeigeLinkQuery(datenOrdner) {
  const datei = path.join(datenOrdner, "anzeige-link.txt");
  for (let i = 0; i < 50; i++) {
    try { return new URL((await readFile(datei, "utf8")).trim()).search; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error(`Anzeige-Link fehlt: ${datei}`);
}

// Steht ein Proxy in der Umgebung (https_proxy), schickt Chromium auch ws:// darüber – auch an die Netzwerkadresse
// dieses Rechners, mit der die Tests ein Gerät „von außen“ nachstellen. Diese Adressen gehen direkt (no_proxy).
const EIGENE_ADRESSEN = Object.values(networkInterfaces()).flat().filter((n) => n && !n.internal).map((n) => n.address);
const OHNE_PROXY = [process.env.no_proxy ?? process.env.NO_PROXY, ...EIGENE_ADRESSEN].filter(Boolean).join(",");

/** Chromium mit Software-WebGL (SwiftShader), damit die 3D-Figur auch ohne GPU läuft */
export const CHROMIUM_OPTIONEN = {
  ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  env: { ...process.env, no_proxy: OHNE_PROXY, NO_PROXY: OHNE_PROXY },
};

// ---------- Konten (Bauplan „Anmeldung und Dashboard-Zugang“) ----------
export const PASSWORT = "creeper123";
/** Board-Adresse → Token des ersten Kontos; es gilt sofort und gibt jedes weitere frei */
const ersteKonten = new Map();

/** Konto per API anlegen (und freigeben lassen); gibt es den Namen schon, auf einem neuen Gerät anmelden
 *  → { token, id, name, freigegeben } */
export async function konto(board, name, pin = "2468", { freigeben = true } = {}) {
  const post = (pfad, body, token) => fetch(`${board}/api${pfad}`, { method: "POST",
    headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) }, body: JSON.stringify(body ?? {}) });
  let res = await post("/registrieren", { echterName: `${name} Beispiel`, anzeigename: name, passwort: PASSWORT, pin });
  if (res.status === 409) res = await post("/anmelden", { anzeigename: name, passwort: PASSWORT });
  const d = await res.json();
  if (!res.ok) throw new Error(`Konto ${name}: ${d.fehler ?? res.status}`);
  if (!d.freigegeben && freigeben) {
    const r = await post(`/konten/${d.id}/freigeben`, null, ersteKonten.get(board));
    if (!r.ok) throw new Error(`Konto ${name} freigeben: ${r.status}`);
    d.freigegeben = true;
  }
  if (!ersteKonten.has(board)) ersteKonten.set(board, d.token);
  return d;
}

/** Wie ein Handy: Anmeldeseite (/) öffnen, Anzeigename + Passwort, weiter in die Companion (/app/).
 *  seiten: Ursprung der Seiten (lokal das Board, sonst die Netlify-Vorschau) → true, wenn live verbunden */
export async function anmelden(seite, seiten, name, passwort = PASSWORT) {
  await seite.goto(`${seiten}/`);
  await seite.fill("#anmName", name);
  await seite.fill("#anmPasswort", passwort);
  await seite.click('#formAnmelden [type="submit"]');
  try {
    await seite.waitForURL(`${seiten}/app/`, { timeout: 10000 });
    await seite.waitForFunction(() => typeof bd !== "undefined" && bd.status === "verbunden", null, { timeout: 10000 });
    return true;
  } catch { return false; }
}
