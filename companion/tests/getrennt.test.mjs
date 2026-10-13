// Getrennte Ursprünge (Umbau Phase 2): Die Companion kommt von einem eigenen Server (wie von Netlify),
// das Board läuft woanders. konfig.js nennt die Adresse des Boards; API und Live-Verbindung gehen dorthin,
// das Board lässt den Ursprung der Seite per CORS zu. Die Anmeldeseite über zwei Ursprünge prüft netlify.test.mjs
// mit dem echten Netlify-Aufbau; hier bringt das Gerät seine Anmeldung schon mit (Token aus der API).
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { companionAusliefern, threeUmleiten, CHROMIUM_OPTIONEN, konto } from "./hilfen.mjs";

const HIER = fileURLToPath(new URL(".", import.meta.url));
const DIR = path.join(HIER, "bilder"); mkdirSync(DIR, { recursive: true });
const TMP = mkdtempSync(path.join(tmpdir(), "getrennt-"));
const PORT = 3190, SEITE_PORT = 3187, BOARD = `http://127.0.0.1:${PORT}`;
const pruefe = (ok, text) => { console.log((ok ? "OK   " : "FEHL ") + text); if (!ok) process.exitCode = 1; };
const schlafen = (ms) => new Promise((r) => setTimeout(r, ms));
const warteAuf = (p, fn, arg, ms = 8000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

const board = spawn(process.execPath, ["src/server.js"], {
  cwd: path.join(HIER, "../../koordinaten-board/server"),
  env: { ...process.env, PORT: String(PORT), DATEN_ORDNER: path.join(TMP, "daten"), ERLAUBTE_URSPRUENGE: `http://127.0.0.1:${SEITE_PORT}` },
  stdio: "ignore",
});
const seite = await companionAusliefern(SEITE_PORT);
const browser = await chromium.launch(CHROMIUM_OPTIONEN);
const fehler = [];
try {
  for (let i = 0; i < 60 && !(await fetch(`${BOARD}/api/server`).then((r) => r.ok, () => false)); i++) await schlafen(200);

  const kontext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await threeUmleiten(kontext);
  // konfig.js wie auf Netlify: nennt das Board als Adresse der API
  await kontext.route("**/konfig.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript",
    body: `window.COMPANION_KONFIG = { apiAdresse: "${BOARD}/" };` }));
  const p = await kontext.newPage();
  p.on("pageerror", (e) => fehler.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) fehler.push(m.text()); });

  // ---- Ohne Konfiguration (Seite allein): kein Board am eigenen Ursprung → DEMO ----
  const demo = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await demo.goto(`${seite.adresse}/companion-prototyp.html`);
  await demo.waitForFunction(() => typeof BOARD_ADRESSE !== "undefined");
  await schlafen(800);   // init(): betriebErkennen() fragt /api/server am eigenen Ursprung (404)
  pruefe(await demo.evaluate(() => DEMO.enabled && BOARD_ADRESSE === location.origin), "Ohne konfig.js-Adresse: Board = eigener Ursprung, dort keins → DEMO");
  await demo.close();

  // ---- Mit konfig.js: Live-Betrieb gegen das Board auf dem anderen Ursprung ----
  // Angemeldet wie nach der Anmeldeseite: Token im localStorage, dazu der letzte Kontakt
  const max = await konto(BOARD, "Max");
  await kontext.addInitScript(([adresse, token]) => {
    if (localStorage.getItem("board.verbindung")) return;
    localStorage.setItem("board.verbindung", JSON.stringify({ adresse, token, name: "Max" }));
    localStorage.setItem("board.kontakt", String(Date.now()));
  }, [BOARD, max.token]);
  await p.goto(`${seite.adresse}/companion-prototyp.html`);
  pruefe(await warteAuf(p, (b) => !DEMO.enabled && BOARD_ADRESSE === b && API_BASIS === `${b}/api`, BOARD), "konfig.js: Live-Betrieb, API_BASIS zeigt aufs Board (ohne Schrägstrich am Ende)");
  pruefe(await warteAuf(p, (b) => bd.ich?.anzeigename === "Max" && bd.verbindung.adresse === b, BOARD), "Angemeldet, Verbindung zeigt aufs Board");
  pruefe(await warteAuf(p, () => bd.status === "verbunden"), "WebSocket zum Board auf dem anderen Ursprung steht");

  // Daten über die API (PUT/POST über CORS), Live-Meldung kommt an
  await warteAuf(p, () => document.querySelector(".sheet-kopf h2")?.textContent === "Welt");
  const welt = await p.evaluate(async () => (await api("/orte/welten", { method: "POST", body: JSON.stringify({ seed: "6889192652397090698" }) })).data?.welt ?? null);
  pruefe(welt?.id, `Welt über die API auf dem anderen Ursprung angelegt (${welt?.id})`);
  const amBoard = await (await fetch(`${BOARD}/api/orte/welten`, { headers: { authorization: `Bearer ${await p.evaluate(() => bd.verbindung.token)}` } })).json();
  pruefe(amBoard.welten?.some((w) => w.id === welt?.id), "Das Board hat die Welt");
  await p.screenshot({ path: `${DIR}/g1-getrennte-urspruenge.png` });

  // Neu laden: Verbindung bleibt, weil die Adresse zu konfig.js passt
  await p.reload();
  pruefe(await warteAuf(p, () => !DEMO.enabled && bd.verbindung?.name === "Max" && bd.status === "verbunden", null, 10000), "Nach dem Neuladen weiter verbunden");
} catch (e) {
  pruefe(false, `Abbruch: ${e.stack || e}`);
} finally {
  pruefe(fehler.length === 0, `keine Fehler in der Seite${fehler.length ? `: ${fehler.join(" | ")}` : ""}`);
  await browser.close();
  await seite.schliessen();
  board.kill("SIGTERM"); await new Promise((r) => board.once("exit", r));
  rmSync(TMP, { recursive: true, force: true });
}
