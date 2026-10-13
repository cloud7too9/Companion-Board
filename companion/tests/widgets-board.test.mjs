// Widget-Dashboard am echten Board: Das Board liefert /dashboard aus, die Widgets zeigen die Karten
// aus den Daten der aktiven Welt (GET /api/widgets/:typ) und laden nach Änderungen live neu. Jede
// Anzeige zeigt ihr Layout vom Server (A6) ohne Bearbeiten und meldet ihre Reihen; ein neues Layout
// kommt live an. Eine gelöschte Quelle zeigt den leeren Zustand. Von außen nur mit Anzeige-Link.
// Die Widgets der Anzeige (Bauplan „Sitzung“, S3: Orte, Beitreten, Spieler, Zuletzt, Kopf) rendern
// aus `zustand`/`teilnehmer` vom /ws; Screenshot w12 für den Haltepunkt H9.
// Vorher: npm --prefix ../widgets run build
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { mkdirSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir, networkInterfaces } from "node:os";
import path from "node:path";
import { CHROMIUM_OPTIONEN, anzeigeLinkQuery } from "./hilfen.mjs";

const HIER = fileURLToPath(new URL(".", import.meta.url));
const DIR = path.join(HIER, "bilder");
mkdirSync(DIR, { recursive: true });
const pruefe = (ok, text) => { console.log((ok ? "OK   " : "FEHL ") + text); if (!ok) process.exitCode = 1; };
const schlafen = (ms) => new Promise((r) => setTimeout(r, ms));
if (!existsSync(path.join(HIER, "../widgets/dist/index.html"))) {
  console.log("FEHL Widgets nicht gebaut: npm --prefix ../widgets install && npm --prefix ../widgets run build");
  process.exit(1);
}

const TMP = mkdtempSync(path.join(tmpdir(), "widgets-board-"));
const PORT = 3186, PIN = "471100", BOARD = `http://127.0.0.1:${PORT}`;
const AUSSEN = Object.values(networkInterfaces()).flat().find((n) => n && n.family === "IPv4" && !n.internal)?.address;
const board = spawn(process.execPath, ["src/server.js"], {
  cwd: path.join(HIER, "../../koordinaten-board/server"),
  env: { ...process.env, PORT: String(PORT), RAUM_PIN: PIN, DATEN_ORDNER: path.join(TMP, "daten"),
         ...(AUSSEN && { OEFFENTLICHE_URL: `http://${AUSSEN}:${PORT}` }) },
  stdio: "ignore",
});

let token = "";
const api = async (methode, pfad, body) => {
  const res = await fetch(BOARD + pfad, { method: methode,
    headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return res.json();
};

const browser = await chromium.launch(CHROMIUM_OPTIONEN);
const fehler = [];
try {
  for (let i = 0; i < 60 && !(await fetch(`${BOARD}/api/server`).then((r) => r.ok, () => false)); i++) await schlafen(200);
  ({ token } = await api("POST", "/api/beitreten", { pin: PIN, name: "Max", kontoPin: "2468" }));
  const welt = (await api("POST", "/api/orte/welten", { seed: "6889192652397090698" })).welt;
  const basis = (await api("POST", "/api/orte/instanzen",
    { dimensionId: `d_${welt.id}_overworld`, kategorie: "Eigene Orte", variante: "Hauptbasis", x: 260, y: 80, z: -420, quelle: "manuell" })).instanz;
  await api("PUT", `/api/sammelobjekte/welten/${welt.id}/rib`, { gefunden: true });
  await api("POST", `/api/portale/welten/${welt.id}`, { name: "Eisenfarm", oberwelt: { x: 800, y: 64, z: 80 }, nether: { x: 100, y: 64, z: 10 } });
  const banner = (await api("POST", "/api/banner", { name: "Kreuz", basis: "white", ebenen: [{ muster: "cross", farbe: "red" }] })).banner;

  // ---- Dashboard vom Board (Anzeige „Board“ mit ihrem Anzeige-Link, auch auf dem Board-Gerät) ----
  const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on("pageerror", (e) => fehler.push(e.message));
  await p.goto(`${BOARD}/dashboard${await anzeigeLinkQuery(path.join(TMP, "daten"))}`);
  await p.waitForSelector('[data-panel-id="w-sammelstatus"] [data-testid="karte"]');
  const karteText = (sel) => p.$eval(`${sel} [data-testid="karte"]`, (k) => k.textContent).catch(() => "");
  pruefe(new URL(p.url()).pathname === "/dashboard/" && !(await p.$('[data-testid="beispielkarten"]')), "Board liefert /dashboard aus, Karten vom Board (keine Beispielkarten)");
  pruefe((await karteText('[data-panel-id="w-sammelstatus"]')).includes("1 von 18"), "Sammel-Fortschritt: 1 von 18");
  pruefe((await karteText('[data-panel-id="w-portale"]')).includes("Eisenfarm"), "Portalverbindungen: Eisenfarm");
  pruefe((await karteText('[data-panel-id="w-gesamtkarte"]')).includes("Hauptbasis") === false
    && (await karteText('[data-panel-id="w-gesamtkarte"]')).includes("1 Orte"), "Gesamtkarte: Orte je Dimension");

  // ---- Widgets der Anzeige (Bauplan „Sitzung“, S3) im Standard-Layout ----
  const warteAuf = (fn, arg, ms = 8000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  pruefe(await warteAuf(() => [...document.querySelectorAll('[data-panel-id="w-orte"] [data-dimension="oberwelt"] [data-testid="ort-zeile"]')]
    .some((z) => z.textContent.includes("Hauptbasis") && z.textContent.includes("X 260 · Y 80 · Z −420") && z.textContent.includes("Nether 32 / −53"))),
    "Orte: Hauptbasis in der Oberwelt-Spalte mit Koordinaten und Umrechnung");
  pruefe(await warteAuf(() => document.querySelector('[data-panel-id="w-beitreten"] [data-testid="qr"] svg')
    && document.querySelector('[data-panel-id="w-beitreten"] [data-testid="pin"]')?.textContent === "471100"), "Beitreten: QR-Code vom Board und PIN");
  pruefe(await warteAuf(() => document.querySelector('[data-panel-id="w-spieler"] [data-testid="spieler-leer"]')), "Spieler: niemand mit dem Handy verbunden");
  pruefe(await p.textContent('[data-testid="anzeige-titel"]') === "Unsere Welt"
    && (await p.textContent('[data-testid="anzeige-welt"]')).includes("Seed 68891…0698 · 1 Ort")
    && /^\d\d:\d\d$/.test(await p.textContent('[data-testid="uhr"]'))
    && await warteAuf(() => document.querySelector('[data-testid="verbunden"]')?.dataset.verbunden === "true"),
    "Kopf der Anzeige: Titel, Seed, Anzahl der Orte, Uhr, verbunden");

  // Max verbindet sich mit dem Handy → Spieler-Chip; ein neuer, angehefteter Ort kommt live mit Kennblock
  const handy = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${token}`);
  await new Promise((ok, fehl) => { handy.onopen = ok; handy.onerror = fehl; });
  pruefe(await warteAuf(() => [...document.querySelectorAll('[data-panel-id="w-spieler"] [data-testid="spieler-chip"]')].map((c) => c.textContent).join() === "Max"),
    "Spieler: Max ist mit dem Handy verbunden (live)");
  const burg = (await api("POST", "/api/orte/instanzen",
    { dimensionId: `d_${welt.id}_overworld`, kategorie: "Stronghold", variante: null, x: 1824, y: null, z: -96, quelle: "manuell" })).instanz;
  await api("PUT", `/api/orte/instanzen/${burg.id}/angeheftet`, { angeheftet: true });
  pruefe(await warteAuf(() => {
    const a = document.querySelector('[data-panel-id="w-orte"] [data-testid="angeheftet"]');
    return a?.textContent.includes("Stronghold") && a.querySelector('[data-testid="neu"]')
      && a.querySelector("img.kennblock")?.getAttribute("src").endsWith("stronghold.png") && a.querySelector("img.kennblock").naturalWidth > 0;
  }), "Orte: angehefteter Stronghold live oben, mit Kennblock und „Neu“");
  pruefe(await warteAuf(() => document.querySelector('[data-testid="anzeige-welt"]')?.textContent.includes("2 Orte")), "Kopf: 2 Orte (live)");

  // Alle Blöcke der alten Anzeige nebeneinander (16:9) – Screenshot für H9
  const [anzeigeBoard] = (await api("GET", "/api/anzeigen")).anzeigen;
  const anzeigeLayout = { aktiverLayer: "a1", layer: [{ id: "a1", name: "Anzeige", instanzen: [
    { id: "a-orte", typ: "karte.orte", stufe: "groß", x: 0, y: 0 },
    { id: "a-beitreten", typ: "board.beitreten", stufe: "standard", x: 20, y: 0 },
    { id: "a-spieler", typ: "board.spieler", stufe: "standard", x: 26, y: 0 },
    { id: "a-zuletzt", typ: "board.zuletzt", stufe: "standard", x: 20, y: 6 },
    { id: "a-sammelstatus", typ: "sammelobjekte.status", stufe: "standard", x: 28, y: 4 },
    { id: "a-portale", typ: "portale.verbindungen", stufe: "standard", x: 0, y: 10 },
  ] }] };
  await api("PUT", `/api/anzeigen/${anzeigeBoard.id}/layout`, anzeigeLayout);
  pruefe(await warteAuf(() => [...document.querySelectorAll('[data-panel-id="a-zuletzt"] [data-testid="zuletzt-zeile"]')].map((z) => z.textContent)
    .map((t) => t.replace(/^.*?(Max|Lena|Jemand)/, "$1")).join("|") === "Max → Stronghold|Max → Hauptbasis"),
    "Zuletzt: neueste zuerst, mit Urheber (Max → Stronghold, Max → Hauptbasis)");
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${DIR}/w12-anzeige-widgets.png` });
  handy.close();
  pruefe(await warteAuf(() => document.querySelector('[data-panel-id="a-spieler"] [data-testid="spieler-leer"]')), "Spieler: Handy getrennt → wieder leer");

  // ---- Live: Änderung am Handy → Widget lädt neu ----
  await api("PUT", `/api/sammelobjekte/welten/${welt.id}/eye`, { gefunden: true });
  pruefe(await p.waitForFunction(() => document.querySelector('[data-panel-id="a-sammelstatus"] [data-testid="karte"]')?.textContent.includes("2 von 18"),
    null, { timeout: 8000 }).then(() => true, () => false), "Live: Sammelobjekt abgehakt → 2 von 18 ohne Neuladen");

  // ---- Anzeige (A6): kein Bearbeiten, meldet ihre Reihen ----
  const warteBis = async (fn, ms = 8000) => { for (const ende = Date.now() + ms; Date.now() < ende; await schlafen(150)) if (await fn()) return true; return false; };
  pruefe(await p.textContent('[data-testid="anzeige-name"]') === "Anzeige Board" && await p.getByRole("button", { name: "Bearbeiten" }).count() === 0,
    "Am Board: Anzeige „Board“, kein Bearbeiten (angeordnet wird am Handy)");
  const reihen = await p.$eval('[data-testid="raster-flaeche"]', (f) => Number(f.dataset.grid.split("x")[1]));
  const [board1] = (await api("GET", "/api/anzeigen")).anzeigen;
  pruefe(await warteBis(async () => (await api("GET", "/api/anzeigen")).anzeigen[0].reihen === reihen), `Anzeige meldet ihre Reihen (${reihen})`);

  // ---- Layout am Server (wie es später das Handy speichert) → kommt live an ----
  const quellen = (await api("GET", "/api/widgets/karte.einzelkoordinate/quellen")).quellen;
  pruefe(quellen.map((q) => q.name).sort().join() === "Hauptbasis,Stronghold", "Quellen für die Einzelkoordinate vom Board");
  const festung = (await api("POST", "/api/orte/instanzen",
    { dimensionId: `d_${welt.id}_nether`, kategorie: "Nether Fortress", variante: null, x: -200, y: 70, z: 96, quelle: "manuell" })).instanz;
  const layout = { aktiverLayer: "l1", layer: [{ id: "l1", name: "Start", instanzen: [
    { id: "w-gesamtkarte", typ: "karte.gesamtkarte", stufe: "standard", x: 0, y: 0 },
    { id: "w-portale", typ: "portale.verbindungen", stufe: "standard", x: 12, y: 0 },
    { id: "w-sammelstatus", typ: "sammelobjekte.status", stufe: "standard", x: 22, y: 0 },
    { id: "w-basis", typ: "karte.einzelkoordinate", stufe: "standard", x: 26, y: 0, quelle: basis.id },
    { id: "w-festung", typ: "karte.einzelkoordinate", stufe: "standard", x: 26, y: 4, quelle: festung.id },
    { id: "w-banner", typ: "banner.banner", stufe: "standard", x: 12, y: 6, quelle: banner.id },
    { id: "w-bauplan", typ: "bauplaene.bauplan", stufe: "standard", x: 20, y: 8 },
    { id: "w-sammelobjekte", typ: "sammelobjekte.gesamtauflistung", stufe: "standard", x: 0, y: 8 },
  ] }, { id: "l2", name: "Leer", instanzen: [] }] };
  await api("PUT", `/api/anzeigen/${board1.id}/layout`, layout);
  pruefe(await p.waitForSelector('[data-panel-id="w-bauplan"]', { timeout: 8000 }).then(() => true, () => false)
    && await p.$$eval("[data-panel-id]", (l) => l.length) === 8, "Layout vom Handy kommt live an (8 Widgets)");
  pruefe(await warteBis(async () => (await karteText('[data-panel-id="w-basis"]')).includes("X 260 · Y 80 · Z −420")), "Einzelkoordinate zeigt ihre Quelle");
  pruefe(await warteBis(async () => (await p.$$eval('[data-typ="karte.einzelkoordinate"] [data-testid="gehaeuse"]', (l) => l.map((g) => g.dataset.theme).join())) === "karte-oberwelt,karte-nether"),
    "Karte: Theme nach Dimension (Oberwelt, Nether)");
  pruefe(await p.waitForFunction(() => {
    const img = document.querySelector('[data-panel-id="w-banner"] [data-testid="karte"] img');
    return img && img.complete && img.naturalWidth === 20 && img.naturalHeight === 40 && img.style.imageRendering === "pixelated";
  }, null, { timeout: 8000 }).then(() => true, () => false), "Banner: Vorschau 20×40 vom Server, pixelgenau");
  pruefe(await p.textContent('[data-panel-id="w-bauplan"] [data-testid="widget-leer"]') === "Bereich geplant", "Bauplan ohne Quelle: „Bereich geplant“");
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${DIR}/w7-board-karten.png` });

  // Anderer Layer aktiv → die Anzeige wechselt
  await api("PUT", `/api/anzeigen/${board1.id}/layout`, { ...layout, aktiverLayer: "l2" });
  pruefe(await warteBis(async () => (await p.textContent('[data-testid="layer-name"]')) === "Leer" && (await p.$$eval("[data-panel-id]", (l) => l.length)) === 0),
    "Aktiver Layer „Leer“ → Anzeige zeigt ihn, mit Hinweis");
  await api("PUT", `/api/anzeigen/${board1.id}/layout`, layout);
  await p.waitForSelector('[data-panel-id="w-basis"]');

  // ---- Quelle gelöscht → leerer Zustand (live) ----
  await api("DELETE", `/api/orte/instanzen/${basis.id}`);
  pruefe(await p.waitForFunction(() => document.querySelector('[data-panel-id="w-basis"] [data-testid="widget-leer"]')?.textContent === "Die Quelle gibt es nicht mehr",
    null, { timeout: 8000 }).then(() => true, () => false), "Quelle gelöscht → Widget zeigt „Die Quelle gibt es nicht mehr“");

  // ---- Von außen: ohne Link kein Inhalt, mit Anzeige-Link das Layout genau dieser Anzeige ----
  if (AUSSEN) {
    const tablet = (await api("POST", "/api/anzeigen", { name: "Tablet" })).anzeige;
    const tv = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    tv.on("pageerror", (e) => fehler.push(e.message));
    await tv.goto(`http://${AUSSEN}:${PORT}/dashboard/`);
    pruefe(await tv.waitForFunction(() => document.querySelector('[data-panel-id="w-sammelstatus"] [data-testid="widget-leer"]')?.textContent
      === "Diese Anzeige braucht ihren Anzeige-Link", null, { timeout: 8000 }).then(() => true, () => false), "Anderes Gerät ohne Link: Hinweis auf den Anzeige-Link");
    const link = new URL(tablet.link);
    await tv.goto(`http://${AUSSEN}:${PORT}/dashboard${link.search}`);
    pruefe(await tv.waitForFunction(() => document.querySelector('[data-panel-id="w-sammelstatus"] [data-testid="karte"]')?.textContent.includes("2 von 18")
      && document.querySelector('[data-testid="anzeige-name"]')?.textContent === "Anzeige Tablet" && document.querySelectorAll("[data-panel-id]").length === 6,
      null, { timeout: 8000 }).then(() => true, () => false), "Mit Anzeige-Link: „Tablet“ mit eigenem Layout (noch das Start-Layout) und Karten vom Board");
    const tvReihen = await tv.$eval('[data-testid="raster-flaeche"]', (f) => Number(f.dataset.grid.split("x")[1]));
    pruefe(await warteBis(async () => (await api("GET", "/api/anzeigen")).anzeigen.find((a) => a.id === tablet.id).reihen === tvReihen)
      && (await api("GET", "/api/anzeigen")).anzeigen[0].reihen === reihen, `Jede Anzeige meldet ihre eigenen Reihen (Board ${reihen}, Tablet ${tvReihen})`);
    await tv.goto(`http://${AUSSEN}:${PORT}/dashboard/`);
    pruefe(await tv.waitForFunction(() => document.querySelector('[data-panel-id="w-sammelstatus"] [data-testid="karte"]'),
      null, { timeout: 8000 }).then(() => true, () => false), "Neustart ohne Link: Schlüssel aus dem Browser");
  } else {
    console.log("OK   übersprungen: keine Netzwerkadresse für den Zugriff „von außen“");
  }
} catch (f) {
  pruefe(false, `Abbruch: ${f.stack || f}`);
} finally {
  pruefe(fehler.length === 0, `keine Fehler in der Seite${fehler.length ? `: ${fehler.join(" | ")}` : ""}`);
  await browser.close();
  board.kill("SIGTERM"); await new Promise((r) => board.once("exit", r));
  rmSync(TMP, { recursive: true, force: true });
}
