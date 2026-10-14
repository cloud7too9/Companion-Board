// Dashboard-Login (Bauplan „Anmeldung und Dashboard-Zugang“, L5): Max erzeugt in der Companion einen Code, ein TV
// meldet sich auf der Anmeldeseite mit Code und Dashboard-PIN an, wählt ein Layout und zeigt das Dashboard; neu
// laden geht ohne Code. Ein Tablet wählt dasselbe Layout und bekommt eine Kopie mit eigenem Raster (AN4). Nach über
// 15 Minuten ohne Kontakt fragt die Anzeige nach der Dashboard-PIN; Widerrufen meldet beide ab. Screenshots d1–d7.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { CHROMIUM_OPTIONEN, konto, anmelden } from "./hilfen.mjs";

const HIER = fileURLToPath(new URL(".", import.meta.url));
const DIR = path.join(HIER, "bilder");
mkdirSync(DIR, { recursive: true });
const TMP = mkdtempSync(path.join(tmpdir(), "dashboard-login-"));
const PORT = 3188, BOARD = `http://127.0.0.1:${PORT}`;
const pruefe = (ok, text) => { console.log((ok ? "OK   " : "FEHL ") + text); if (!ok) process.exitCode = 1; };
const schlafen = (ms) => new Promise((r) => setTimeout(r, ms));

const board = spawn(process.execPath, ["src/server.js"], {
  cwd: path.join(HIER, "../../koordinaten-board/server"),
  env: { ...process.env, PORT: String(PORT), DATEN_ORDNER: path.join(TMP, "daten"), TEST_UHR: "1" },
  stdio: "ignore",
});
/** Uhr des Servers vorstellen (nur mit TEST_UHR=1) */
const uhr = (minuten) => fetch(`${BOARD}/api/test/uhr`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ minuten }) });

const browser = await chromium.launch(CHROMIUM_OPTIONEN);
const fehler = [];
async function geraet(breite, hoehe) {
  const k = await browser.newContext({ viewport: { width: breite, height: hoehe }, deviceScaleFactor: 1 });
  const p = await k.newPage();
  p.on("pageerror", (e) => fehler.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) fehler.push(m.text()); });
  return p;
}
const text = (p, sel) => p.$eval(sel, (e) => e.textContent.replace(/\s+/g, " ").trim()).catch(() => "");
const warteAuf = (p, fn, arg, ms = 8000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
async function pinTippen(p, pin) {
  for (const z of pin) await p.click(`.tastatur [data-ziffer="${z}"]`);
  await p.click('.tastatur [data-pin="ok"]');
}
const amLogin = (p) => warteAuf(p, () => location.pathname === "/" && document.getElementById("dashCode")
  && document.querySelector('[data-nav="dashboard"]')?.getAttribute("aria-selected") === "true", null, 10000);
const dashboardZeigt = (p, panel) => warteAuf(p, (id) => location.pathname === "/dashboard/" && document.querySelector(`[data-panel-id="${id}"]`), panel, 10000);
/** Code am Anzeige-Gerät: Anmeldeseite, Reiter Dashboard-Login, Code, dann die Dashboard-PIN */
async function codeEingeben(p, code, pin) {
  await p.fill("#dashCode", code);
  await p.click('#formDashboard [type="submit"]');
  await p.waitForSelector(".tastatur");
  if (pin) await pinTippen(p, pin);
}

try {
  for (let i = 0; i < 60 && !(await fetch(`${BOARD}/api/server`).then((r) => r.ok, () => false)); i++) await schlafen(200);
  const max = await konto(BOARD, "Max");
  const api = async (methode, pfad, body) => (await fetch(`${BOARD}${pfad}`, { method: methode,
    headers: { "content-type": "application/json", authorization: `Bearer ${max.token}` }, body: body && JSON.stringify(body) })).json();
  const [boardAnzeige] = (await api("GET", "/api/anzeigen")).anzeigen;
  await api("PUT", `/api/anzeigen/${boardAnzeige.id}/layout`, { aktiverLayer: "l1", layer: [{ id: "l1", name: "Raum", instanzen: [
    { id: "d-beitreten", typ: "board.beitreten", stufe: "standard", x: 0, y: 0 },
    { id: "d-sammel", typ: "sammelobjekte.status", stufe: "standard", x: 8, y: 0 },
  ] }] });

  // ---- Max: Code in der Companion erzeugen (Board-Sheet → „Anzeige-Gerät anmelden“) ----
  const handy = await geraet(390, 844);
  pruefe(await anmelden(handy, BOARD, "Max"), "Max ist in der Companion");
  await handy.evaluate(() => boardOeffnen());
  pruefe(await warteAuf(handy, () => document.getElementById("zugGueltig")), "Board-Sheet: Abschnitt „Anzeige-Gerät anmelden“");
  pruefe((await handy.$$eval("#zugGueltig option", (o) => o.map((x) => x.textContent))).join("|") === "20 Minuten|5 Minuten|1 Stunde|1 Tag|Dauerhaft",
    "Gültigkeit: 20 Minuten (Standard), 5 Minuten, 1 Stunde, 1 Tag, Dauerhaft");
  await handy.fill("#zugPin", "8642"); await handy.fill("#zugPin2", "8643");
  await handy.click('[data-aktion="zugang-erzeugen"]');
  pruefe(await warteAuf(handy, () => document.getElementById("orteToast")?.textContent === "Die beiden PINs sind verschieden"), "Verschiedene PINs: Meldung, kein Code");
  await handy.fill("#zugPin2", "8642");
  await handy.click('[data-aktion="zugang-erzeugen"]');
  pruefe(await warteAuf(handy, () => /^[2-9A-HJ-NP-Za-km-z]{5}$/.test(document.querySelector("[data-neuer-code] .code-gross")?.textContent ?? "")), "Neuer Code groß im Sheet, ohne 0 O 1 l I");
  const code = await text(handy, "[data-neuer-code] .code-gross");
  pruefe((await text(handy, "[data-neuer-code]")).includes("Gültig bis") && (await text(handy, '[data-zugang] .card-meta')).includes("0 Anzeigen · von Max"),
    `Code ${code}: „Gültig bis …“, unter „Erzeugte Codes“ mit 0 Anzeigen, von Max`);
  pruefe(await handy.inputValue("#zugPin") === "", "PIN-Felder danach leer");
  await handy.evaluate(() => { document.getElementById("orteToast").hidden = true; });
  await handy.locator("[data-neuer-code]").scrollIntoViewIfNeeded();
  await handy.screenshot({ path: `${DIR}/d1-code-generieren.png` });

  // ---- TV: /dashboard/ ohne Zugang → Anmeldeseite, Reiter Dashboard-Login ----
  const tv = await geraet(1280, 720);
  await tv.goto(`${BOARD}/dashboard/`);
  pruefe(await amLogin(tv), "TV: Dashboard ohne Zugang → Anmeldeseite, Reiter Dashboard-Login");
  await tv.screenshot({ path: `${DIR}/d2-dashboard-login.png` });
  await tv.fill("#dashCode", code === "zzzzz" ? "yyyyy" : "zzzzz");
  await tv.click('#formDashboard [type="submit"]');
  pruefe(await warteAuf(tv, () => document.getElementById("dashMeldung")?.textContent === "Der Zugangs-Code stimmt nicht. Achte auf Groß- und Kleinschreibung."),
    "Falscher Code: „Achte auf Groß- und Kleinschreibung“");
  await codeEingeben(tv, code, "1111");
  pruefe(await warteAuf(tv, () => document.getElementById("pinMeldung")?.textContent === "Falsche Dashboard-PIN"), "Falsche Dashboard-PIN");
  await tv.screenshot({ path: `${DIR}/d3-dashboard-pin.png` });
  await pinTippen(tv, "8642");
  pruefe(await warteAuf(tv, () => document.getElementById("formLayout") && document.getElementById("kopfUnter")?.textContent === "Anzeige-Layout wählen"), "Richtige PIN → „Anzeige-Layout wählen“");
  pruefe((await text(tv, ".layout-karte b")) === "Board" && (await text(tv, ".layout-text span")) === "Board, Sammelobjekte"
    && (await text(tv, ".layout-meta")) === "2 Widgets" && await tv.isChecked(".layout-karte input"), "Layout „Board“: Bereiche, 2 Widgets, vorausgewählt");
  pruefe(await tv.evaluate((b) => JSON.parse(localStorage.getItem("board.anzeige"))?.adresse === b && !localStorage.getItem("board.verbindung"), BOARD),
    "Anzeige-Token unter „board.anzeige“, kein Konto auf dem TV");
  await tv.screenshot({ path: `${DIR}/d4-layout-waehlen.png` });
  await tv.click('#formLayout [type="submit"]');
  pruefe(await dashboardZeigt(tv, "d-sammel"), "„Anzeige starten“ → /dashboard/ zeigt das Layout „Board“");
  pruefe(await warteAuf(tv, () => document.querySelector('[data-panel-id="d-beitreten"] svg')), "Widget „Beitreten“ mit QR-Code (Anzeige-API mit Token)");
  await tv.waitForTimeout(500);
  await tv.screenshot({ path: `${DIR}/d5-dashboard.png` });
  pruefe(await warteAuf(handy, () => document.querySelector("[data-zugang] .card-meta")?.textContent.includes("1 Anzeige ·")), "Companion: „1 Anzeige“ am Code (live)");

  // Neu laden: ohne Code; die Anmeldeseite springt direkt zu „Layout wählen“
  await tv.reload();
  pruefe(await dashboardZeigt(tv, "d-sammel"), "TV neu geladen: Dashboard ohne neuen Code");
  await tv.goto(`${BOARD}/`);
  pruefe(await warteAuf(tv, () => document.getElementById("formLayout") && document.querySelector(".layout-karte input")?.checked), "Anmeldeseite auf dem TV: direkt „Layout wählen“, „Board“ gewählt");
  await tv.click('#formLayout [type="submit"]');
  pruefe(await dashboardZeigt(tv, "d-sammel"), "… und wieder zurück aufs Dashboard");

  // ---- Tablet: dasselbe Layout → eigene Kopie mit eigenem Raster (AN4) ----
  const tablet = await geraet(820, 1180);
  await tablet.goto(`${BOARD}/?dashboard`);
  pruefe(await amLogin(tablet), "Tablet: Anmeldeseite mit ?dashboard → Reiter Dashboard-Login");
  await codeEingeben(tablet, code, "8642");
  pruefe(await warteAuf(tablet, () => document.querySelector(".layout-karte")?.textContent.includes("läuft schon auf einem anderen Gerät")),
    "„Board“ läuft schon auf dem TV: Hinweis auf die Kopie");
  await tablet.screenshot({ path: `${DIR}/d6-layout-kopie.png` });
  await tablet.click('#formLayout [type="submit"]');
  pruefe(await dashboardZeigt(tablet, "d-sammel"), "Tablet zeigt dasselbe Layout");
  let anzeigen = [];
  for (let i = 0; i < 40; i++) {
    anzeigen = (await api("GET", "/api/anzeigen")).anzeigen;
    if (anzeigen.length === 2 && anzeigen.every((a) => a.reihen)) break;
    await schlafen(200);
  }
  pruefe(anzeigen.map((a) => a.name).join("|") === "Board|Board 2", "Neue Anzeige „Board 2“ für das Tablet");
  pruefe(anzeigen[0].reihen && anzeigen[1].reihen && anzeigen[0].reihen !== anzeigen[1].reihen,
    `Eigenes Raster je Gerät: TV ${anzeigen[0].reihen} Reihen, Tablet ${anzeigen[1].reihen} Reihen`);
  // Die Kopie ändert sich für sich: das TV merkt nichts
  await api("PUT", `/api/anzeigen/${anzeigen[1].id}/layout`, { aktiverLayer: "l1", layer: [{ id: "l1", name: "Raum", instanzen: [
    { id: "d-nur-tablet", typ: "sammelobjekte.status", stufe: "standard", x: 0, y: 0 }] }] });
  pruefe(await dashboardZeigt(tablet, "d-nur-tablet"), "Layout der Kopie geändert: das Tablet zeigt es live");
  pruefe(await tv.$('[data-panel-id="d-nur-tablet"]') === null && await tv.$('[data-panel-id="d-sammel"]') !== null, "… der TV behält sein Layout");

  // ---- 16 Minuten ohne Kontakt → Dashboard-PIN ----
  await uhr(16);
  await tv.reload();
  pruefe(await warteAuf(tv, () => location.pathname === "/" && document.querySelector(".pin-kopf h2")?.textContent === "Dashboard-PIN"
    && document.querySelector(".grund")?.textContent.includes("16 Minuten ohne Verbindung"), null, 10000), "Nach 16 Minuten: Dashboard-PIN („16 Minuten ohne Verbindung“)");
  await tv.screenshot({ path: `${DIR}/d7-dashboard-pin-offline.png` });
  await pinTippen(tv, "8642");
  pruefe(await warteAuf(tv, () => document.getElementById("formLayout")), "Dashboard-PIN richtig → Layout wählen");
  await tv.click('#formLayout [type="submit"]');
  pruefe(await dashboardZeigt(tv, "d-sammel"), "TV läuft wieder");
  pruefe(await warteAuf(tv, () => document.querySelector('[data-panel-id="d-sammel"]') && location.pathname === "/dashboard/"), "… mit seinem Layout, nicht dem des Tablets");

  // ---- Widerrufen (zweimal tippen) → beide Anzeigen abgemeldet ----
  await handy.evaluate(() => boardOeffnen());
  await handy.waitForSelector('[data-aktion="zugang-widerrufen"]');
  await handy.click('[data-aktion="zugang-widerrufen"]');
  pruefe((await text(handy, '[data-aktion="zugang-widerrufen"]')) === "Wirklich?", "Widerrufen: erst „Wirklich?“");
  await handy.click('[data-aktion="zugang-widerrufen"]');
  pruefe(await warteAuf(handy, () => document.getElementById("orteToast")?.textContent === "Code widerrufen – 2 Anzeigen abgemeldet"), "„Code widerrufen – 2 Anzeigen abgemeldet“");
  for (const [p, name] of [[tv, "TV"], [tablet, "Tablet"]]) {
    pruefe(await amLogin(p) && (await text(p, "#buehne")).includes("nicht mehr angemeldet"), `${name}: Live-Verbindung zu (4003) → Dashboard-Login, „nicht mehr angemeldet“`);
    pruefe(await p.evaluate(() => localStorage.getItem("board.anzeige") === null), `${name}: Anzeige-Token vergessen`);
  }
  pruefe(await warteAuf(handy, () => !document.querySelector("[data-zugang]")), "Companion: keine Codes mehr in der Liste");

  // ---- Anzeige abmelden auf dem Gerät (dauerhafter Code) ----
  await handy.selectOption("#zugGueltig", "dauerhaft");
  await handy.fill("#zugPin", "97531"); await handy.fill("#zugPin2", "97531");
  await handy.click('[data-aktion="zugang-erzeugen"]');
  pruefe(await warteAuf(handy, () => document.querySelector("[data-neuer-code]")?.textContent.includes("Dauerhaft gültig")), "Dauerhafter Code: „Dauerhaft gültig“");
  const dauer = await text(handy, "[data-neuer-code] .code-gross");
  await codeEingeben(tablet, dauer, "97531");
  await tablet.waitForSelector("#formLayout");
  pruefe((await tablet.$$eval(".layout-karte b", (b) => b.map((x) => x.textContent))).join("|") === "Board|Board 2", "Layout-Auswahl: „Board“ und „Board 2“");
  await tablet.click('[data-weiter="anzeige-abmelden"]');
  pruefe(await amLogin(tablet) && (await text(tablet, "#buehne")).includes("Anzeige abgemeldet"), "„Anzeige abmelden“ → wieder der Code");
  pruefe(await warteAuf(handy, () => document.querySelector("[data-zugang] .card-meta")?.textContent.includes("0 Anzeigen")), "Der dauerhafte Code bleibt, 0 Anzeigen");
} catch (e) {
  pruefe(false, `Abbruch: ${e.stack || e}`);
} finally {
  pruefe(fehler.length === 0, `keine Fehler in den Seiten${fehler.length ? `: ${fehler.join(" | ")}` : ""}`);
  await browser.close();
  board.kill("SIGTERM"); await new Promise((r) => board.once("exit", r));
  rmSync(TMP, { recursive: true, force: true });
}
