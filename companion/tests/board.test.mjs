// Board-Verbindung: startet ein echtes Koordinaten-Board und verbindet die Companion
// per Kamera (Fake-Kamera zeigt den QR-Code), per Foto und von Hand.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import QRCode from "qrcode";
import { anzeigeLinkQuery } from "./hilfen.mjs";

const HIER = fileURLToPath(new URL(".", import.meta.url));
const DIR = path.join(HIER, "bilder");
mkdirSync(DIR, { recursive: true });
const TMP = mkdtempSync(path.join(tmpdir(), "board-test-"));
const BOARD_PORT = 3198, SEITE_PORT = 3196, PIN = "471100";
const BOARD = `http://127.0.0.1:${BOARD_PORT}`;
const QR_TEXT = `${BOARD}/?pin=${PIN}`;
const JSQR = path.join(HIER, "node_modules/jsqr/dist/jsQR.js");
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
    env: { ...process.env, PORT: String(BOARD_PORT), RAUM_PIN: PIN, DATEN_ORDNER: path.join(TMP, "daten"),
           ERLAUBTE_URSPRUENGE: `http://localhost:${SEITE_PORT}` },   // die Seite kommt von einem anderen Ursprung (CORS)
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

// --- Companion über http://localhost ausliefern (sicherer Kontext → Kamera erlaubt) ---
// Ausgeliefert werden die Seite, regeln.js und icons/ – alles andere ist die Seite selbst
const COMPANION = path.join(HIER, "..");
const TYPEN = { ".js": "text/javascript; charset=utf-8", ".png": "image/png" };
const seite = createServer((req, res) => {
  const pfad = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const datei = path.join(COMPANION, pfad);
  if (pfad !== "/" && datei.startsWith(COMPANION + path.sep) && existsSync(datei) && TYPEN[path.extname(datei)]) {
    res.setHeader("content-type", TYPEN[path.extname(datei)]);
    return res.end(readFileSync(datei));
  }
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(readFileSync(path.join(COMPANION, "companion-prototyp.html")));
}).listen(SEITE_PORT);
const URL_SEITE = `http://localhost:${SEITE_PORT}/`;

// --- QR-Code als Foto (PNG) und als Kamerabild (Y4M für Chromiums Fake-Kamera) ---
const QR_PNG = path.join(TMP, "qr.png");
await QRCode.toFile(QR_PNG, QR_TEXT, { margin: 4, scale: 8 });
const Y4M = path.join(TMP, "qr.y4m");
{
  const W = 640, H = 480, qr = QRCode.create(QR_TEXT, { errorCorrectionLevel: "M" }).modules;
  const zelle = Math.floor(300 / (qr.size + 8)), breite = zelle * (qr.size + 8);
  const x0 = (W - breite) / 2 | 0, y0 = (H - breite) / 2 | 0;
  const y = Buffer.alloc(W * H, 90); // graue Umgebung wie ein Zimmer
  for (let py = 0; py < breite; py++) for (let px = 0; px < breite; px++) {
    const r = Math.floor(py / zelle) - 4, c = Math.floor(px / zelle) - 4;
    const dunkel = r >= 0 && c >= 0 && r < qr.size && c < qr.size && qr.get(r, c);
    y[(y0 + py) * W + x0 + px] = dunkel ? 20 : 235;
  }
  const uv = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
  const bild = Buffer.concat([Buffer.from("FRAME\n"), y, uv]);
  writeFileSync(Y4M, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), bild, bild]));
}

async function browserOeffnen(mitKamera) {
  const args = mitKamera
    ? ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${Y4M}`]
    : [];
  const browser = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}), args });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  // jsQR kommt sonst vom CDN – im Test aus node_modules
  await ctx.route("https://cdn.jsdelivr.net/npm/jsqr@*/**", (r) => r.fulfill({ path: JSQR, contentType: "application/javascript" }));
  // Wie auf dem iPhone: kein BarcodeDetector → jsQR-Weg
  await ctx.addInitScript(() => { delete window.BarcodeDetector; });
  const p = await ctx.newPage();
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  // Absichtlich nicht erreichbare Boards erzeugen Netzwerk-Meldungen – die zählen nicht
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_CONNECTION_REFUSED|WebSocket connection|401|Failed to load resource/.test(m.text())) fehler.push(m.text()); });
  return { browser, p, fehler };
}
const text = (p, sel) => p.$eval(sel, (e) => e.textContent.replace(/\s+/g, " ").trim());
const knopfText = (p) => text(p, "#boardBtn");
/** Wie am Handy: Sidebar auf, dann „Board“ antippen */
const boardAntippen = async (p) => { await p.click("#burgerBtn"); await p.waitForTimeout(350); await p.click("#boardBtn"); };
const zeilenLesen = (p) => p.$$eval(".board-zeile", (l) => l.map((z) => `${z.children[0].textContent}=${z.children[1].textContent}`).join(" | "));
const warteAuf = async (p, fn, arg, ms = 12000) => { try { await p.waitForFunction(fn, arg, { timeout: ms }); return true; } catch { return false; } };

try {
  await boardStarten();

  // === 1 · Kamera ================================================================
  {
    const { browser, p, fehler } = await browserOeffnen(true);
    await p.goto(URL_SEITE);
    await p.waitForTimeout(700);
    pruefe((await knopfText(p)).includes("Nicht verbunden"), "Sidebar: Board nicht verbunden");
    await p.click("#burgerBtn"); await p.waitForTimeout(400);
    await p.screenshot({ path: `${DIR}/v1-sidebar.png` });
    await p.click("#boardBtn");
    pruefe(await p.$("#boardScanner") !== null, "Sheet mit Scanner geöffnet");
    pruefe(await p.$eval("#boardName", (e) => e.value) === "Max", "Name im DEMO vorbelegt (Max)");
    await p.fill("#boardKontoPin", "2468");   // eigene PIN (Accounts, B2)
    // Name und PIN gesetzt → nach dem Erkennen tritt die Companion sofort bei. War der QR-Code
    // schneller als die PIN, steht der Fokus im PIN-Feld und Max tippt „Beitreten“.
    let verbunden = await warteAuf(p, () => document.querySelector("#boardBtn")?.textContent.includes("Verbunden ·"), null, 4000);
    if (!verbunden && await warteAuf(p, () => document.getElementById("boardAdresse")?.value === "127.0.0.1:3198", null, 8000)) {
      await p.click('[data-aktion="board-beitreten"]');
      verbunden = await warteAuf(p, () => document.querySelector("#boardBtn")?.textContent.includes("Verbunden ·"));
    }
    pruefe(verbunden, "QR-Code per Kamera erkannt und beigetreten");
    await p.waitForTimeout(500);
    console.log("     Knopf:", await knopfText(p));
    pruefe((await knopfText(p)).includes("127.0.0.1:3198"), "Sidebar zeigt die Board-Adresse");
    const zeilen = await zeilenLesen(p);
    console.log("     Sheet:", zeilen);
    pruefe(zeilen === "Angemeldet als=Max | Im Raum=Max | Orte auf dem Board=0", "Sheet: angemeldet als Max, im Raum, 0 Orte");
    pruefe((await teilnehmerImRaum()).includes("Max"), "Anzeige des Boards sieht Max im Raum");
    const ls = await p.evaluate(() => JSON.parse(localStorage.getItem("board.verbindung")));
    pruefe(ls?.adresse === BOARD && typeof ls?.token === "string", "Verbindung auf dem Gerät gemerkt");
    pruefe(await p.evaluate(() => typeof window.jsQR === "function"), "Erkennung lief über jsQR (wie am iPhone)");
    await p.screenshot({ path: `${DIR}/v2-verbunden.png` });

    // Neu laden → verbindet von selbst wieder
    await p.reload(); await p.waitForTimeout(300);
    pruefe(await warteAuf(p, () => document.querySelector("#boardBtn")?.textContent.includes("Verbunden ·")), "Nach Neuladen wieder verbunden");

    // Board neu starten → Companion verbindet neu (Token bleibt gültig)
    await boardStoppen();
    pruefe(await warteAuf(p, () => document.querySelector("#boardBtn")?.textContent.includes("Getrennt")), "Board aus → Getrennt");
    await p.screenshot({ path: `${DIR}/v3-getrennt.png` });
    await boardStarten();
    pruefe(await warteAuf(p, () => document.querySelector("#boardBtn")?.textContent.includes("Verbunden ·"), null, 15000), "Board wieder da → neu verbunden");

    // Trennen
    await boardAntippen(p); await p.waitForTimeout(300);
    await p.click('[data-aktion="board-trennen"]'); await p.waitForTimeout(400);
    pruefe((await knopfText(p)).includes("Nicht verbunden"), "Trennen → nicht verbunden");
    pruefe(await p.evaluate(() => localStorage.getItem("board.verbindung")) === null, "Verbindung auf dem Gerät vergessen");
    await p.waitForTimeout(600);
    pruefe(!(await teilnehmerImRaum()).includes("Max"), "Board: Max nicht mehr im Raum");

    // Beim Schließen des Sheets geht die Kamera aus
    await boardAntippen(p);
    await warteAuf(p, () => document.getElementById("boardVideo")?.srcObject, null, 5000);
    await p.waitForTimeout(150);
    await p.screenshot({ path: `${DIR}/v7-scanner.png` });
    await p.click('[data-aktion="schliessen"]'); await p.waitForTimeout(200);
    pruefe(await p.evaluate(() => (document.getElementById("boardVideo")?.srcObject?.getTracks() || []).every((t) => t.readyState === "ended")), "Sheet zu → Kamera aus");

    pruefe(fehler.length === 0, "Keine JS-Fehler (Kamera)" + (fehler.length ? ": " + fehler.join(" | ") : ""));
    await browser.close();
  }

  // === 2 · Ohne Kamera: Foto und von Hand =========================================
  {
    const { browser, p, fehler } = await browserOeffnen(false);
    await p.goto(URL_SEITE);
    await p.waitForTimeout(600);
    await boardAntippen(p);
    pruefe(await warteAuf(p, () => document.getElementById("boardScanner")?.classList.contains("aus"), null, 5000), "Ohne Kamera: Scanner zeigt Hinweis");
    console.log("     Hinweis:", await text(p, "#boardScanText"));
    await p.screenshot({ path: `${DIR}/v4-ohne-kamera.png` });

    // Foto – Name leer → Felder füllen, aber noch nicht beitreten
    await p.fill("#boardName", "");
    await p.setInputFiles("#boardFoto", QR_PNG);
    pruefe(await warteAuf(p, () => document.getElementById("boardPin")?.value === "471100"), "Foto: Adresse und PIN erkannt");
    pruefe(await p.$eval("#boardAdresse", (e) => e.value) === "127.0.0.1:3198", "Foto: Adresse eingetragen");
    pruefe((await knopfText(p)).includes("Nicht verbunden"), "Ohne Name noch nicht beigetreten");
    await p.click('[data-aktion="board-beitreten"]'); await p.waitForTimeout(200);
    pruefe((await text(p, "#boardBanner")).includes("Wie heißt du"), "Ohne Name → Hinweis");

    // Ohne eigene PIN → Hinweis; dann falsche Board-PIN
    await p.fill("#boardName", "Lena");
    await p.click('[data-aktion="board-beitreten"]'); await p.waitForTimeout(200);
    pruefe((await text(p, "#boardBanner")).includes("Deine eigene PIN hat 4 bis 8 Ziffern"), "Ohne eigene PIN → Hinweis");
    await p.fill("#boardKontoPin", "1357");
    await p.fill("#boardPin", "111111");   // falsche Board-PIN mit 6 Ziffern, sonst meckert die Seite selbst
    await p.click('[data-aktion="board-beitreten"]');
    pruefe(await warteAuf(p, () => document.getElementById("boardBanner")?.textContent.includes("Falsche PIN")), "Falsche PIN → Fehlermeldung vom Board");

    // Nicht erreichbar
    await p.fill("#boardAdresse", "127.0.0.1:3197");
    await p.fill("#boardPin", PIN);
    await p.click('[data-aktion="board-beitreten"]');
    pruefe(await warteAuf(p, () => document.getElementById("boardBanner")?.textContent.includes("nicht erreichbar")), "Falsche Adresse → nicht erreichbar");
    await p.screenshot({ path: `${DIR}/v5-fehler.png` });

    // Ganze Beitritts-Adresse einfügen → wird aufgeteilt, dann beitreten
    await p.fill("#boardPin", "");
    await p.fill("#boardAdresse", QR_TEXT);
    await p.waitForTimeout(100);
    pruefe(await p.$eval("#boardAdresse", (e) => e.value) === "127.0.0.1:3198" && await p.$eval("#boardPin", (e) => e.value) === PIN, "Eingefügte Adresse mit ?pin= aufgeteilt");
    await p.click('[data-aktion="board-beitreten"]');
    pruefe(await warteAuf(p, () => document.querySelector("#boardBtn")?.textContent.includes("Verbunden ·")), "Von Hand beigetreten");
    await p.waitForTimeout(400);
    pruefe((await zeilenLesen(p)).startsWith("Angemeldet als=Lena"), "Angemeldet als Lena");
    pruefe(await p.evaluate(() => JSON.parse(localStorage.getItem("board.name"))) === "Lena", "Name für nächstes Mal gemerkt");
    await p.screenshot({ path: `${DIR}/v6-von-hand.png` });
    pruefe((await text(p, "#orteSheetInhalt")).includes("Gerade liegt nichts auf dem Board"), "Board-Sheet: nichts auf der Anzeige");

    // === Aufs Board: Ort auf die Anzeige werfen ===================================
    // Tim ist mit dem Handy am Board und hat schon Orte eingetragen
    const tim = await (await fetch(`${BOARD}/api/beitreten`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin: PIN, name: "Tim", kontoPin: "9753" }) })).json();
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

    // Seit Bauplan „Sitzung“ (S2) baut das Board die Karte aus seinen Daten: Lena macht live vom Board aus weiter
    // (die DEMO-Seite oben kennt Tims Orte nicht). Gleicher Account, gleiche eigene PIN.
    const lena = await p.context().newPage();
    await lena.goto(`${BOARD}/?pin=${PIN}`);
    // Das Board kennt Lena schon: Account antippen (die Kontenliste kommt verzögert und zeichnet das Formular neu), dann die eigene PIN
    await lena.waitForSelector('[data-aktion="board-konto"][data-name="Lena"]');
    await lena.click('[data-aktion="board-konto"][data-name="Lena"]');
    await lena.fill("#boardKontoPin", "1357");
    await lena.click('[data-aktion="board-beitreten"]');
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
    await lena.close();

    // Die übrigen Bereiche laufen weiter
    await p.click('[data-aktion="schliessen"]');
    await p.click("#burgerBtn"); await p.waitForTimeout(300);
    await p.click('.nav-item[data-module="portale"]'); await p.waitForTimeout(400);
    pruefe(await text(p, "#kopfTitel") === "Portal-Verwaltung", "Bereichswechsel weiter ok");

    pruefe(fehler.length === 0, "Keine JS-Fehler (ohne Kamera)" + (fehler.length ? ": " + fehler.join(" | ") : ""));
    await browser.close();
  }
} catch (e) {
  pruefe(false, "Abbruch: " + e.message);
} finally {
  await boardStoppen();
  seite.close();
  rmSync(TMP, { recursive: true, force: true });
}
