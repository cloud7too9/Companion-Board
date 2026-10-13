// Board-Verbindung (Bauplan „Anmeldung“): angemeldet über die Anmeldeseite, live verbunden, Neuladen,
// Neustart des Boards, Abmelden – und „Aufs Board“ mit der Anzeige (Widget-Dashboard, Bauplan „Sitzung“).
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { mkdirSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { anzeigeLinkQuery, konto, anmelden } from "./hilfen.mjs";

const HIER = fileURLToPath(new URL(".", import.meta.url));
const DIR = path.join(HIER, "bilder");
mkdirSync(DIR, { recursive: true });
const TMP = mkdtempSync(path.join(tmpdir(), "board-test-"));
const BOARD_PORT = 3198;
const BOARD = `http://127.0.0.1:${BOARD_PORT}`;
// Die Anzeige ist das Widget-Dashboard (Bauplan „Sitzung“, S4): es muss gebaut sein
if (!existsSync(path.join(HIER, "../widgets/dist/index.html"))) {
  console.log("FEHL Dashboard nicht gebaut: npm --prefix ../widgets install && npm --prefix ../widgets run build");
  process.exit(1);
}

const pruefe = (ok, text) => { console.log((ok ? "OK   " : "FEHL ") + text); if (!ok) process.exitCode = 1; };
const schlafen = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Koordinaten-Board starten ------------------------------------------------
let board = null;
async function boardStarten() {
  board = spawn(process.execPath, ["src/server.js"], {
    cwd: path.join(HIER, "../../koordinaten-board/server"),
    env: { ...process.env, PORT: String(BOARD_PORT), DATEN_ORDNER: path.join(TMP, "daten") },
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    // Beendet sich sofort, wenn der Port noch belegt ist (z. B. altes Board aus einem abgebrochenen Lauf)
    if (board.exitCode !== null) throw new Error(`Board beendet sich sofort – Port ${BOARD_PORT} belegt?`);
    try { if ((await fetch(`${BOARD}/api/server`)).ok) return; } catch {}
    await schlafen(200);
  }
  throw new Error("Board startet nicht (npm --prefix koordinaten-board/server install?)");
}
async function boardStoppen() {
  if (!board) return;
  const b = board; board = null;
  if (b.exitCode !== null || b.signalCode !== null) return;
  b.kill("SIGTERM");
  await new Promise((r) => b.once("exit", r));
}
/** Teilnehmer aus Sicht der Anzeige (mit dem Anzeige-Link, auch auf dem Board-Gerät selbst) */
async function teilnehmerImRaum() {
  const q = await anzeigeLinkQuery(path.join(TMP, "daten"));
  return new Promise((ok, fehler) => {
    const ws = new WebSocket(`ws://127.0.0.1:${BOARD_PORT}/ws${q}&rolle=anzeige`);
    ws.onmessage = (e) => { const n = JSON.parse(e.data); if (n.art === "teilnehmer") { ws.close(); ok(n.namen); } };
    ws.onerror = () => fehler(new Error("Anzeige-WS"));
  });
}

const browser = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
let boardAus = false;   // absichtlicher Neustart: fehlgeschlagene Wiederverbindungen sind dann erwartet
async function handy() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  p.on("console", (m) => {
    if (m.type() !== "error" || /Failed to load resource/.test(m.text())) return;
    if (boardAus && /WebSocket connection|ERR_CONNECTION_REFUSED/.test(m.text())) return;
    fehler.push(m.text());
  });
  return { p, fehler };
}
const text = (p, sel) => p.$eval(sel, (e) => e.textContent.replace(/\s+/g, " ").trim());
const knopfText = (p) => text(p, "#boardBtn");
/** Wie am Handy: Sidebar auf, dann „Board“ antippen (ein offenes Sheet, z. B. „Welt“ auf dem leeren Board, vorher zu) */
const boardAntippen = async (p) => {
  await p.evaluate(() => alleSchliessen()); await p.waitForTimeout(300);
  await p.click("#burgerBtn"); await p.waitForTimeout(350); await p.click("#boardBtn");
};
const zeilenLesen = (p) => p.$$eval(".board-zeile", (l) => l.map((z) => `${z.children[0].textContent}=${z.children[1].textContent}`).join(" | "));
const warteAuf = async (p, fn, arg, ms = 12000) => { try { await p.waitForFunction(fn, arg, { timeout: ms }); return true; } catch { return false; } };

try {
  await boardStarten();

  // === 1 · Verbindung: anmelden, neu laden, Board-Neustart, abmelden =============
  {
    const { p, fehler } = await handy();
    await konto(BOARD, "Max", "2468");
    pruefe(await anmelden(p, BOARD, "Max"), "Max meldet sich auf der Anmeldeseite an → Companion live verbunden");
    console.log("     Knopf:", await knopfText(p));
    pruefe((await knopfText(p)).includes("Verbunden · 127.0.0.1:3198"), "Sidebar zeigt die Board-Adresse");
    await boardAntippen(p); await p.waitForTimeout(400);
    const zeilen = await zeilenLesen(p);
    console.log("     Sheet:", zeilen);
    pruefe(zeilen.startsWith("Angemeldet als=Max | Im Raum=Max | Orte auf dem Board=0"), "Sheet: angemeldet als Max, im Raum, 0 Orte");
    pruefe((await teilnehmerImRaum()).includes("Max"), "Anzeige des Boards sieht Max im Raum");
    const ls = await p.evaluate(() => JSON.parse(localStorage.getItem("board.verbindung")));
    pruefe(ls?.adresse === BOARD && typeof ls?.token === "string" && ls.name === "Max", "Verbindung auf dem Gerät gemerkt");
    await p.screenshot({ path: `${DIR}/v2-verbunden.png` });

    // Neu laden → verbindet von selbst wieder
    await p.reload(); await p.waitForTimeout(300);
    pruefe(await warteAuf(p, () => document.querySelector("#boardBtn")?.textContent.includes("Verbunden ·")), "Nach Neuladen wieder verbunden");

    // Board neu starten → Companion verbindet neu (Token bleibt gültig)
    boardAus = true;
    await boardStoppen();
    pruefe(await warteAuf(p, () => document.querySelector("#boardBtn")?.textContent.includes("Getrennt")), "Board aus → Getrennt");
    await p.screenshot({ path: `${DIR}/v3-getrennt.png` });
    await boardStarten();
    pruefe(await warteAuf(p, () => document.querySelector("#boardBtn")?.textContent.includes("Verbunden ·"), null, 15000), "Board wieder da → neu verbunden");
    boardAus = false;

    // Abmelden → Anmeldeseite, das Board vergisst das Gerät
    await boardAntippen(p); await p.waitForTimeout(300);
    await p.click('[data-aktion="board-abmelden"]');
    pruefe(await warteAuf(p, () => location.pathname === "/" && document.getElementById("anmName")), "Abmelden → Anmeldeseite");
    pruefe(await p.evaluate(() => localStorage.getItem("board.verbindung")) === null, "Verbindung auf dem Gerät vergessen");
    await p.waitForTimeout(600);
    pruefe(!(await teilnehmerImRaum()).includes("Max"), "Board: Max nicht mehr im Raum");

    // DEMO-Modus (?demo=1): kein Board, das Board-Sheet sagt das
    await p.goto(`${BOARD}/app/?demo=1`);
    await p.waitForTimeout(600);
    pruefe((await knopfText(p)).includes("Nicht verbunden"), "DEMO: Board nicht verbunden");
    await boardAntippen(p); await p.waitForTimeout(300);
    pruefe((await text(p, "#orteSheetInhalt")).includes("Beispieldaten"), "DEMO: Board-Sheet erklärt den Demo-Modus");

    pruefe(fehler.length === 0, "Keine JS-Fehler (Verbindung)" + (fehler.length ? ": " + fehler.join(" | ") : ""));
    await p.context().close();
  }

  // === 2 · Aufs Board ===========================================================
  {
    const { p: lena, fehler } = await handy();
    // Tim ist mit dem Handy am Board und hat schon Orte eingetragen
    const tim = await konto(BOARD, "Tim", "9753");
    const timWs = new WebSocket(`ws://127.0.0.1:${BOARD_PORT}/ws?token=${encodeURIComponent(tim.token)}`);
    const antworten = [];
    timWs.onmessage = (e) => { const n = JSON.parse(e.data); if (n.anfrage) antworten.push(n); };
    await new Promise((r) => { timWs.onopen = r; });
    // Daten gehen über die Companion-API des Boards (gemeinsames Datenmodell)
    const timApi = (methode, pfad, body) => fetch(`${BOARD}/api${pfad}`, { method: methode,
      headers: { "content-type": "application/json", authorization: `Bearer ${tim.token}` }, body: JSON.stringify(body) }).then((r) => r.json());
    const timWelt = (await timApi("POST", "/orte/welten", { seed: "6889192652397090698" })).welt;
    const timOrte = {};
    for (const [kategorie, variante, x, y, z, dim] of [["Eigene Orte", "Hauptbasis", 212, 71, -388, "overworld"], ["Village", null, 1040, 64, 310, "overworld"],
      ["Nether Fortress", null, 180, 70, -95, "nether"], ["End City", null, 1300, 60, -820, "end"], ["Stronghold", null, -1884, 40, -524, "overworld"]]) {   // ohne Variante: neue Varianten entstehen nur aus Screenshots
      timOrte[kategorie] = (await timApi("POST", "/orte/instanzen", { dimensionId: `d_${timWelt.id}_${dim}`, kategorie, variante, x, y, z, quelle: "manuell" })).instanz.id;
    }
    await schlafen(300);
    // Die Anzeige ist das Dashboard (Bauplan „Sitzung“, S4) mit dem Anzeige-Link
    const anzeige = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await anzeige.goto(`${BOARD}/dashboard${await anzeigeLinkQuery(path.join(TMP, "daten"))}`);
    await anzeige.waitForSelector('[data-panel-id="w-orte"] [data-ort-id]');
    pruefe(await anzeige.$('[data-testid="von"]') === null, "Anzeige: noch nichts aufs Board gelegt");
    // Karte eines Sitzungs-Widgets nach Typ und Absender („von …“-Chip)
    const sitzungsKarte = (typ, von) => anzeige.locator(`[data-typ="${typ}"]`, { has: anzeige.locator('[data-testid="von"]', { hasText: von }) }).locator('[data-testid="karte"]');
    const da = (loc, state = "visible") => loc.first().waitFor({ state, timeout: 12000 }).then(() => true, () => false);
    const bis = async (fn, ms = 8000) => { for (const ende = Date.now() + ms; Date.now() < ende; await schlafen(150)) if (await fn().catch(() => false)) return true; return false; };

    // Kennblöcke im Orte-Widget: Strukturen mit Bild zeigen es, alle anderen das Linien-Icon der Kategorie
    await anzeige.waitForFunction(() => [...document.querySelectorAll("img.kennblock")].every((i) => i.complete));
    const anzeigeIcons = await anzeige.$$eval('[data-panel-id="w-orte"] [data-ort-id]', (l) => l.map((z) => {
      const img = z.querySelector("img.kennblock");
      return `${z.querySelector('[data-testid="ort-name"]').textContent.trim()}=${img ? (img.naturalWidth ? img.getAttribute("src").split("/").pop() : "lädt nicht") : "Linie"}`;
    }).sort().join(", "));
    console.log("     Anzeige-Icons:", anzeigeIcons);
    pruefe(anzeigeIcons === "End City=end_city.png, Hauptbasis=Linie, Nether Fortress=fortress.png, Stronghold=stronghold.png, Village=Linie", "Anzeige: Kennblöcke bei Netherfestung, Endsiedlung und Festung, sonst Linien-Icon");
    await anzeige.screenshot({ path: `${DIR}/v7b-anzeige-kennbloecke.png` });

    // Seit Bauplan „Sitzung“ (S2) baut das Board die Karte aus seinen Daten: Lena meldet sich an und sieht Tims Orte
    await konto(BOARD, "Lena", "1357");
    pruefe(await anmelden(lena, BOARD, "Lena"), "Lena meldet sich an");
    pruefe(await warteAuf(lena, () => typeof bd !== "undefined" && bd.status === "verbunden" && st.instanzen?.length >= 5), "Lena live vom Board: Tims Orte geladen");
    await lena.evaluate(() => detailOeffnen(st.instanzen.find((i) => typVon(i).kategorie === "Village").id)); await lena.waitForTimeout(350);
    const ortTitel = await text(lena, ".sheet-kopf h2");
    const ortX = await lena.$eval(".result-coords b", (e) => e.textContent);
    pruefe(await text(lena, ".board-zeigen") === "Aufs Board", `Detail „${ortTitel}“: Knopf „Aufs Board“`);
    await lena.click(".board-zeigen");
    // Bauplan „Sitzung“: Der Inhalt liegt als Widget im Layer „Sitzung“ der Anzeige, mit Absender
    const lenasOrt = sitzungsKarte("karte.einzelkoordinate", "Lena");
    pruefe(await da(lenasOrt.locator("h3")), "Anzeige zeigt die Karte als Sitzungs-Widget „von Lena“");
    pruefe(await warteAuf(anzeige, () => document.querySelector('[data-testid="layer-name"]')?.textContent.trim() === "Sitzung"), "Anzeige: Layer „Sitzung“ ist aktiv");
    pruefe((await lenasOrt.locator("h3").textContent()).trim() === ortTitel, `Anzeige: Titel „${ortTitel}“`);
    const achsen = await lenasOrt.locator(".karte-koord").evaluateAll((l) => l.map((k) => k.textContent.replace(/\s+/g, " ").trim()));
    console.log("     Anzeige:", achsen.join(" | "));
    const ziffern = (t) => t.replace(/[^\d−-]/g, "");
    pruefe(achsen[0].startsWith("X ") && ziffern(achsen[0].split("·")[0]) === ziffern(ortX), "Anzeige: X-Koordinate wie in der Companion");
    pruefe(achsen.length === 2 && /^Im Nether|^In der Oberwelt/.test(achsen[1]), "Anzeige: umgerechnete Koordinaten");
    pruefe(await warteAuf(lena, () => document.querySelector(".board-zeigen")?.classList.contains("aktiv")), "Detail: Knopf zeigt „Liegt auf dem Board“");
    pruefe(await anzeige.$eval(`[data-typ="karte.einzelkoordinate"]`, (w) => { const r = w.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; }),
      "Anzeige: Sitzungs-Widget vollständig sichtbar");
    await anzeige.screenshot({ path: `${DIR}/v8-anzeige-ort.png` });
    await lena.screenshot({ path: `${DIR}/v9-detail-aufs-board.png` });

    // Neu geladene Anzeige bekommt die Sitzung sofort
    await anzeige.reload();
    pruefe(await da(lenasOrt.locator("h3")), "Anzeige nach Neuladen: Sitzungs-Widget wieder da");

    // Tim legt die Netherfestung dazu (direkt über den WebSocket, mit Quelle); eine fertige Karte (alter Weg) lehnt das Board ab
    timWs.send(JSON.stringify({ art: "zeigen", anfrage: 1, quelle: `ort:${timOrte["Nether Fortress"]}` }));
    timWs.send(JSON.stringify({ art: "zeigen", anfrage: 2, quelle: "unsinn" }));
    timWs.send(JSON.stringify({ art: "zeigen", anfrage: 3, karte: { titel: "Alt", bloecke: [{ art: "text", text: "fertige Karte" }] } }));
    await schlafen(500);
    const timsWidget = antworten.find((n) => n.anfrage === 1 && n.art === "ok")?.instanzId;
    pruefe(Boolean(timsWidget), "Tim: Netherfestung angenommen");
    pruefe(antworten.some((n) => n.anfrage === 2 && n.art === "fehler" && /Unbekannte Quelle/.test(n.text)), "Tim: unbekannte Quelle abgelehnt");
    pruefe(antworten.some((n) => n.anfrage === 3 && n.art === "fehler" && n.text === "Die Companion ist veraltet – bitte neu laden"), "Tim: fertige Karte (alter Weg) abgelehnt");
    const timsOrt = sitzungsKarte("karte.einzelkoordinate", "Tim");
    pruefe(await bis(() => timsOrt.evaluate((k) => k.dataset.dimension === "nether" && k.querySelector("img.kennblock")?.naturalWidth > 0)),
      "Anzeige: Tims Netherfestung daneben, im Nether, mit Kennblock");
    pruefe(await anzeige.$$eval('[data-testid="von"]', (l) => l.map((e) => e.textContent.trim()).sort().join()) === "Lena,Tim", "Anzeige: zwei Sitzungs-Widgets, von Lena und von Tim");
    await anzeige.waitForTimeout(400);
    await anzeige.screenshot({ path: `${DIR}/v10-anzeige-zwei.png` });
    pruefe(await lena.$eval(".board-zeigen", (e) => e.classList.contains("aktiv")), "Detail: Lenas Knopf bleibt „Liegt auf dem Board“");
    timWs.send(JSON.stringify({ art: "verbergen", anfrage: 4, instanzId: timsWidget }));
    pruefe(await da(timsOrt, "detached"), "Tim nimmt seine Festung wieder weg");

    // Wegnehmen über das Board-Sheet: die Sitzung listet Lenas Widget
    await lena.click('[data-aktion="schliessen"]'); await lena.waitForTimeout(250);
    await boardAntippen(lena); await lena.waitForTimeout(300);
    const auf = await text(lena, ".board-gezeigt");
    pruefe(auf.includes(ortTitel) && auf.includes("von Lena"), `Board-Sheet: zeigt Lenas Sitzungs-Widget „${ortTitel}“`);
    await lena.screenshot({ path: `${DIR}/v11-sheet-gezeigt.png` });
    await lena.click('[data-aktion="board-wegnehmen"]');
    pruefe(await warteAuf(anzeige, () => !document.querySelector('[data-testid="von"]')), "Wegnehmen → Sitzungs-Widget verschwindet von der Anzeige");
    pruefe(await warteAuf(lena, () => document.getElementById("orteSheetInhalt")?.textContent.includes("Gerade liegt nichts")), "Board-Sheet: wieder leer");

    // Struktur aufs Board → das Widget zeigt den Kennblock neben dem Titel
    await lena.evaluate(() => detailOeffnen(st.instanzen.find((i) => typVon(i).kategorie === "Stronghold").id)); await lena.waitForTimeout(350);
    await lena.click(".board-zeigen");
    const burg = sitzungsKarte("karte.einzelkoordinate", "Lena");
    pruefe(await bis(() => burg.evaluate((k) => k.querySelector("img.kennblock")?.getAttribute("src").endsWith("stronghold.png") && k.querySelector("img.kennblock").naturalWidth > 0)),
      "Anzeige: Stronghold mit Kennblock neben dem Titel");
    pruefe(await burg.locator("img.kennblock").getAttribute("src") === "/icons/struktur_kennbloecke/stronghold.png", "Anzeige: Kennblock stronghold.png");
    pruefe(await burg.evaluate((k) => k.getBoundingClientRect().bottom <= innerHeight), "Anzeige: Karte mit Kennblock vollständig sichtbar");
    await anzeige.waitForTimeout(400);
    await anzeige.screenshot({ path: `${DIR}/v12-anzeige-kennblock.png` });
    await lena.evaluate(() => boardAlleWegnehmen());
    pruefe(await warteAuf(anzeige, () => !document.querySelector('[data-testid="von"]')), "Stronghold wieder vom Board genommen, Sitzung leer");
    timWs.close();
    await anzeige.close();

    // Die übrigen Bereiche laufen weiter
    await lena.click('[data-aktion="schliessen"]');
    await lena.click("#burgerBtn"); await lena.waitForTimeout(300);
    await lena.click('.nav-item[data-module="portale"]'); await lena.waitForTimeout(400);
    pruefe(await text(lena, "#kopfTitel") === "Portal-Verwaltung", "Bereichswechsel weiter ok");

    pruefe(fehler.length === 0, "Keine JS-Fehler (Aufs Board)" + (fehler.length ? ": " + fehler.join(" | ") : ""));
  }
} catch (e) {
  pruefe(false, "Abbruch: " + e.message);
} finally {
  await browser.close();
  await boardStoppen();
  rmSync(TMP, { recursive: true, force: true });
}
