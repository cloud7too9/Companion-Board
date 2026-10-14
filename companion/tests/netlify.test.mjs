// Netlify-Stand (Umbau Phase 5): netlify/bauen.sh baut die Anmeldeseite (/), die Companion (/app/) und die Anzeige,
// das Dashboard (/dashboard/), mit der Adresse einer API auf einem anderen Ursprung. Hier liefert ein kleiner Server den
// Build mit den _redirects aus, das Board läuft daneben: Registrieren auf der Anmeldeseite (Bauplan „Anmeldung“), weiter
// in die PWA, QR-Code zeigt auf die Anmeldeseite, alte Anzeige-Links führen aufs Dashboard (Bauplan „Sitzung“, S4),
// Kennblöcke unter /icons/, Service Worker hält die App-Shell offline bereit, ohne Netz fragt die App nach der PIN.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { CHROMIUM_OPTIONEN, anzeigeLinkQuery } from "./hilfen.mjs";

const HIER = fileURLToPath(new URL(".", import.meta.url));
const WURZEL = path.join(HIER, "../..");
const DIR = path.join(HIER, "bilder"); mkdirSync(DIR, { recursive: true });
const TMP = mkdtempSync(path.join(tmpdir(), "netlify-"));
const PORT = 3199, SEITE_PORT = 3197, BOARD = `http://127.0.0.1:${PORT}`, SEITE = `http://127.0.0.1:${SEITE_PORT}`;
const pruefe = (ok, text) => { console.log((ok ? "OK   " : "FEHL ") + text); if (!ok) process.exitCode = 1; };
const schlafen = (ms) => new Promise((r) => setTimeout(r, ms));
const warteAuf = (p, fn, arg, ms = 8000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

// ---- Bauen wie bei Netlify (ohne npm ci: node_modules sind da) ----
const DIST = path.join(TMP, "dist");
execFileSync("bash", ["netlify/bauen.sh"], { cwd: WURZEL, stdio: "ignore", env: { ...process.env, API_URL: BOARD, ZIEL: DIST, OHNE_INSTALL: "1" } });
pruefe(readFileSync(path.join(DIST, "index.html"), "utf8").includes("<title>Companion · Anmeldung</title>") && existsSync(path.join(DIST, "app/index.html")) && existsSync(path.join(DIST, "dashboard/index.html")),
  "Build: Anmeldeseite unter /, Companion unter app/, Dashboard unter dashboard/");
pruefe(readFileSync(path.join(DIST, "app/konfig.js"), "utf8").includes(`apiAdresse: "${BOARD}"`) && existsSync(path.join(DIST, "icons/struktur_kennbloecke/stronghold.png")), "Build: konfig.js nennt die API, Kennblöcke unter /icons/");
pruefe(!readFileSync(path.join(DIST, "app/sw.js"), "utf8").includes("__STAND__"), "Build: Stand im Service Worker eingesetzt");

// ---- Statischer Server mit den _redirects von Netlify ----
const TYPEN = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".gz": "application/gzip", ".woff": "font/woff", ".woff2": "font/woff2" };
const regeln = readFileSync(path.join(DIST, "_redirects"), "utf8").split("\n").map((z) => z.trim()).filter((z) => z && !z.startsWith("#")).map((z) => z.split(/\s+/));
const seite = createServer(async (req, res) => {
  const pfad = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const datei = (p) => { const d = path.join(DIST, p); return !path.relative(DIST, d).startsWith("..") && existsSync(d) && path.extname(d) ? d : null; };
  let ziel = datei(pfad) ?? (pfad.endsWith("/") ? datei(`${pfad}index.html`) : null);
  if (!ziel) {
    const regel = regeln.find(([von]) => von === pfad || (von.endsWith("/*") && pfad.startsWith(von.slice(0, -1))));
    if (regel && regel[2] === "301") { res.writeHead(301, { location: regel[1] + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "") }).end(); return; }
    ziel = regel ? datei(regel[1]) : null;
  }
  if (!ziel) { res.writeHead(404).end("Nicht gefunden"); return; }
  res.writeHead(200, { "content-type": TYPEN[path.extname(ziel)] ?? "application/octet-stream" }).end(await readFile(ziel));
});
await new Promise((ok) => seite.listen(SEITE_PORT, "127.0.0.1", ok));

const board = spawn(process.execPath, ["src/server.js"], {
  cwd: path.join(WURZEL, "koordinaten-board/server"),
  env: { ...process.env, PORT: String(PORT), DATEN_ORDNER: path.join(TMP, "daten"), ERLAUBTE_URSPRUENGE: SEITE, OEFFENTLICHE_URL: SEITE, TEST_UHR: "1" },
  stdio: "ignore",
});
const browser = await chromium.launch(CHROMIUM_OPTIONEN);
const fehler = [];
try {
  for (let i = 0; i < 60 && !(await fetch(`${BOARD}/api/server`).then((r) => r.ok, () => false)); i++) await schlafen(200);
  const link = await anzeigeLinkQuery(path.join(TMP, "daten"));

  // ---- Redirects und QR-Code ----
  const um = await fetch(`${SEITE}/app?pin=1`, { redirect: "manual" });
  pruefe(um.status === 301 && um.headers.get("location") === "/app/?pin=1", "/app → /app/ (Query bleibt)");
  pruefe((await fetch(`${SEITE}/dashboard/vollbild/w-x`)).headers.get("content-type").startsWith("text/html"), "/dashboard/* → Dashboard-Seite");
  const start = await fetch(`${SEITE}/`, { redirect: "manual" });
  pruefe(start.status === 200 && (await start.text()).includes("<title>Companion · Anmeldung</title>"), "/ ist die Anmeldeseite (kein Umleiten mehr aufs Dashboard)");
  for (const [von, nach] of [[`/anzeige${link}`, `/dashboard/${link}`], ["/anzeige/x", "/dashboard/"]]) {
    const r = await fetch(SEITE + von, { redirect: "manual" });
    pruefe(r.status === 301 && r.headers.get("location") === nach, `${von.split("?")[0]} → /dashboard/${von.includes("?") ? " (Anzeige-Link bleibt)" : ""}`);
  }
  const anzeigeApi = await (await fetch(`${BOARD}/api/anzeige${link}`)).json();
  pruefe(anzeigeApi.beitrittsUrl === `${SEITE}/` && !("pin" in anzeigeApi), `QR-Code zeigt auf die Anmeldeseite, keine Board-PIN (${anzeigeApi.beitrittsUrl})`);

  // ---- Companion als PWA von Netlify, Board auf dem anderen Ursprung ----
  const kontext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await kontext.newPage();
  p.on("pageerror", (e) => fehler.push(e.message));
  let offline = false;
  p.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource") && !(offline && m.text().startsWith("WebSocket connection to"))) fehler.push(m.text()); });
  // QR-Code → Anmeldeseite; registrieren über die API auf dem anderen Ursprung (CORS), das erste Konto gilt sofort
  await p.goto(anzeigeApi.beitrittsUrl);
  await p.waitForSelector("#anmName");
  pruefe(await p.evaluate(() => document.querySelector('link[rel="manifest"]')?.getAttribute("href") === "app/manifest.webmanifest"), "Anmeldeseite hängt das Manifest der Companion ein");
  await p.click('[data-weiter="anlegen"]');
  for (const [feld, wert] of [["#neuEcht", "Max Muster"], ["#neuName", "Max"], ["#neuPasswort", "creeper123"], ["#neuPin", "2468"], ["#neuPin2", "2468"]]) await p.fill(feld, wert);
  await p.click('#formAnlegen [type="submit"]');
  pruefe(await warteAuf(p, () => document.querySelector(".willkommen h2")?.textContent === "Willkommen, Max"), "Registriert über zwei Ursprünge → Willkommenskarte");
  await Promise.all([p.waitForURL(`${SEITE}/app/`), p.click('[data-weiter="companion"]')]);
  pruefe(await p.evaluate((b) => !DEMO.enabled && BOARD_ADRESSE === b, BOARD), "Companion unter /app/ läuft live gegen die API");
  pruefe(await p.evaluate(() => document.querySelector('link[rel="manifest"]')?.getAttribute("href") === "manifest.webmanifest" && document.querySelector('link[rel="apple-touch-icon"]') !== null), "Manifest und Apple-Icon eingehängt");
  const manifest = await (await fetch(`${SEITE}/app/manifest.webmanifest`)).json();
  pruefe(manifest.scope === "../" && manifest.start_url === "./" && manifest.display === "standalone" && (await fetch(`${SEITE}/app/icons/app/icon-512.png`)).ok,
    "Manifest: Start /app/, Bereich ab / (Anmeldeseite bleibt in der App), standalone, Icons da");
  pruefe(await warteAuf(p, () => navigator.serviceWorker?.controller || navigator.serviceWorker?.ready.then(() => true), null, 15000), "Service Worker registriert");
  pruefe(await warteAuf(p, () => bd.verbindung?.name === "Max" && bd.status === "verbunden"), "Angemeldet, Live-Verbindung steht");
  pruefe(await p.evaluate(() => Boolean(JSON.parse(localStorage.getItem("board.pinLokal"))?.hash)), "PIN-Hash für die Sperre ohne Netz liegt auf dem Gerät");
  await warteAuf(p, () => document.querySelector(".sheet-kopf h2")?.textContent === "Welt");
  const token = await p.evaluate(() => bd.verbindung.token);
  const api = (methode, pfad, body) => fetch(BOARD + pfad, { method: methode, headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) }).then((r) => r.json());
  const welt = (await api("POST", "/api/orte/welten", { seed: "6889192652397090698" })).welt;
  await api("PUT", "/api/board/einstellungen", { aktiveWelt: welt.id, titel: "Netlify-Welt" });
  const ort = await api("POST", "/api/orte/instanzen", { dimensionId: `d_${welt.id}_overworld`, kategorie: "Stronghold", variante: "Stairway", x: -1884, y: null, z: -524, quelle: "screenshot" });   // neue Variante: nur aus Screenshots
  pruefe(ort.instanz?.id, `Ort über die API angelegt (${ort.instanz?.id ?? ort.message})`);
  await p.screenshot({ path: `${DIR}/n1-companion-app.png` });

  // ---- Die Anzeige: Dashboard nur mit Zugang (sonst Dashboard-Login); ein alter Link auf die Startseite geht weiter; Kennblock aus /icons/ ----
  const tv = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  tv.on("pageerror", (e) => fehler.push(`Anzeige: ${e.message}`));
  await tv.goto(`${SEITE}/dashboard/`);
  pruefe(await warteAuf(tv, () => location.pathname === "/" && location.search === "?dashboard" && document.getElementById("dashCode")),
    "Dashboard ohne Zugang → Anmeldeseite, Reiter Dashboard-Login");
  await tv.goto(`${SEITE}/${link}`);
  pruefe(await warteAuf(tv, () => location.pathname === "/dashboard/" && document.querySelector('[data-testid="anzeige-titel"]')?.textContent === "Netlify-Welt"
    && document.querySelector('[data-panel-id="w-sammelstatus"] [data-testid="karte"]') && !document.querySelector('[data-testid="beispielkarten"]'), null, 15000),
    "Startseite mit Anzeige-Link: Dashboard mit Titel und Karten vom Board");
  pruefe(await warteAuf(tv, () => [...document.querySelectorAll('[data-panel-id="w-orte"] [data-testid="ort-zeile"]')].some((z) => z.textContent.includes("Stronghold (Stairway)"))
    && [...document.querySelectorAll('[data-panel-id="w-orte"] img.kennblock')].some((i) => i.complete && i.naturalWidth > 0 && i.src.includes("/icons/struktur_kennbloecke/"))),
    "Orte: Stronghold mit Kennblock von /icons/");
  await tv.screenshot({ path: `${DIR}/n2-anzeige-netlify.png` });
  // Alter Anzeige-Link (/anzeige?…) führt aufs Dashboard
  await tv.goto(`${SEITE}/anzeige${link}`);
  pruefe(await warteAuf(tv, () => location.pathname === "/dashboard/" && location.search.includes("schluessel=") && document.querySelector('[data-testid="anzeige-titel"]')?.textContent === "Netlify-Welt"),
    "Alter Anzeige-Link → Dashboard");

  // ---- Neue Version: Knopf „Aktualisieren“ (Max, 05.10.2026) ----
  await warteAuf(p, () => navigator.serviceWorker.controller !== null, null, 10000);
  pruefe(await p.$eval("#aktualisierenBtn", (b) => b.hidden), "Ohne neue Version kein „Aktualisieren“");
  const swDatei = path.join(DIST, "app/sw.js");
  writeFileSync(swDatei, readFileSync(swDatei, "utf8").replace(/const STAND = "[^"]*"/, 'const STAND = "neuer-stand"'));   // wie ein neuer Build
  await p.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  pruefe(await warteAuf(p, () => !document.getElementById("aktualisierenBtn").hidden, null, 15000), "Neuer Service Worker übernommen → Knopf „Aktualisieren“");
  await p.evaluate(() => alleSchliessen()); await schlafen(400);   // das Welt-Sheet liegt über dem Knopf
  await p.screenshot({ path: `${DIR}/n4-aktualisieren.png` });
  await Promise.all([p.waitForNavigation(), p.click("#aktualisierenBtn")]);
  pruefe(await warteAuf(p, () => document.querySelector("header") && document.getElementById("aktualisierenBtn").hidden, null, 10000), "Aktualisieren lädt die Seite neu, Knopf weg");
  pruefe(await warteAuf(p, () => caches.keys().then((k) => k.length === 1 && k[0] === "companion-neuer-stand"), null, 10000), "Alter Cache weggeräumt, nur der neue Stand bleibt");

  // ---- Offline: die App-Shell kommt aus dem Service Worker ----
  await warteAuf(p, () => navigator.serviceWorker.controller !== null, null, 10000);
  offline = true;
  await kontext.setOffline(true);
  // Zuletzt vor 31 Minuten mit dem Board gesprochen: die App fragt ohne Netz nach der PIN (lokaler Hash, Bauplan „Anmeldung“)
  await p.evaluate(() => localStorage.setItem("board.kontakt", String(Date.now() - 31 * 60000)));
  await p.reload().catch(() => {});
  pruefe(await warteAuf(p, () => typeof BOARD_ADRESSE !== "undefined" && document.querySelector("header"), null, 10000), "Offline: Seite kommt aus dem Cache des Service Workers");
  pruefe(await warteAuf(p, () => document.querySelector("#offlineSperre #sperrePin"), null, 10000), "Offline und über 30 Minuten ohne Board: PIN-Sperre");
  await p.fill("#sperrePin", "1111"); await p.click('#offlineSperre [type="submit"]');
  pruefe(await warteAuf(p, () => document.getElementById("sperreMeldung")?.textContent === "Falsche PIN für Max"), "Falsche PIN wird gemeldet");
  await p.screenshot({ path: `${DIR}/n6-offline-pin.png` });
  await p.fill("#sperrePin", "2468"); await p.click('#offlineSperre [type="submit"]');
  pruefe(await warteAuf(p, () => !document.getElementById("offlineSperre")), "Richtige PIN entsperrt die App ohne Netz");
  // Offline B3: live mit dem letzten Stand aus dem Spiegel (IndexedDB) statt Beispieldaten
  pruefe(await warteAuf(p, (id) => !DEMO.enabled && SPIEGEL.aus && st.instanzen.some((i) => i.id === id), ort.instanz.id, 10000), "Offline: Orte aus dem Spiegel, kein Demo");
  const offen = await p.evaluate(() => ({ status: document.getElementById("orteStatusLab").textContent, welt: st.welt?.id,
    toast: document.getElementById("orteToast").textContent.replace(/\s+/g, " "), titel: bd.einstellungen?.titel ?? null }));
  pruefe(offen.status === "Offline" && offen.welt === welt.id && /^Offline · Stand vom \d+\.\d+\., \d\d:\d\d$/.test(offen.toast),
    `Offline: Status „Offline“, Hinweis mit dem Stand (${offen.status} · ${offen.toast})`);
  await p.screenshot({ path: `${DIR}/n5-offline-spiegel.png` });
  // Ändern geht offline noch nicht (B4): klare Meldung statt Absturz
  pruefe((await p.evaluate(() => api("/banner", { method: "POST", body: JSON.stringify({ name: "x", basis: "red", ebenen: [] }) }))).status === 0, "Offline: Schreiben meldet „Keine Verbindung“");
  // Während das Handy offline ist, legt jemand anderes einen Ort an
  const verpasst = await api("POST", "/api/orte/instanzen", { dimensionId: `d_${welt.id}_overworld`, kategorie: "Village", variante: null, x: 640, y: null, z: -1120, quelle: "manuell" });
  // … und das Board sieht dieses Handy 31 Minuten nicht: Wieder online reicht die App die PIN von eben nach
  await fetch(`${BOARD}/api/test/uhr`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ minuten: 31 }) });
  const anfragen = [];
  p.on("request", (r) => { if (r.url().startsWith(BOARD)) anfragen.push(new URL(r.url()).pathname); });
  await kontext.setOffline(false);
  pruefe(await warteAuf(p, (id) => st.instanzen.some((i) => i.id === id) && !SPIEGEL.aus && bd.status === "verbunden"
    && document.getElementById("orteStatusLab").textContent === "Verbunden", verpasst.instanz.id, 25000),
    "Wieder online: verbindet neu und holt den verpassten Ort nach");
  pruefe(anfragen.includes("/api/pin") && new URL(p.url()).pathname === "/app/", "Das Board wollte die PIN: die App reicht sie nach, keine zweite Abfrage");
  pruefe(anfragen.includes("/api/aenderungen") && anfragen.includes(`/api/orte/welten/${welt.id}`) && !anfragen.includes("/api/banner"),
    `Nachladen nur, was sich geändert hat (GET /api/aenderungen, dann die Orte; ${[...new Set(anfragen)].join(", ")})`);
} catch (e) {
  pruefe(false, `Abbruch: ${e.stack || e}`);
} finally {
  pruefe(fehler.length === 0, `keine Fehler in der Seite${fehler.length ? `: ${fehler.join(" | ")}` : ""}`);
  await browser.close();
  await new Promise((ok) => seite.close(ok));
  board.kill("SIGTERM"); await new Promise((r) => board.once("exit", r));
  rmSync(TMP, { recursive: true, force: true });
}
