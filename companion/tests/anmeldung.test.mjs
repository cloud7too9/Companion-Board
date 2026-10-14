// Anmeldeseite (Bauplan „Anmeldung und Dashboard-Zugang“, L3): unter / vom Board ausgeliefert, wie auf Netlify.
// Registrieren, Willkommenskarte, Freigabe neuer Konten im Board-Sheet, Ablehnen, PIN-Sperre nach über 30 Minuten
// ohne Kontakt (Test-Uhr des Servers), PIN zurücksetzen (andere Geräte fragen nach der neuen PIN), anderes Konto,
// altes Board ohne Anmeldung mit Passwort, Board nicht erreichbar. Screenshots a1–a8 für den Haltepunkt.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { CHROMIUM_OPTIONEN, PASSWORT } from "./hilfen.mjs";

const HIER = fileURLToPath(new URL(".", import.meta.url));
const DIR = path.join(HIER, "bilder");
mkdirSync(DIR, { recursive: true });
const TMP = mkdtempSync(path.join(tmpdir(), "anmeldung-"));
const PORT = 3184, BOARD = `http://127.0.0.1:${PORT}`;
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
async function handy() {
  const k = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await k.newPage();
  p.on("pageerror", (e) => fehler.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) fehler.push(m.text()); });
  return p;
}
const text = (p, sel) => p.$eval(sel, (e) => e.textContent.replace(/\s+/g, " ").trim()).catch(() => "");
const warteAuf = (p, fn, arg, ms = 8000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const ansicht = (p) => text(p, "#buehne");
/** Formular „Registrieren“ ausfüllen und abschicken */
async function registrieren(p, { echt, name, passwort = PASSWORT, pin, pin2 = pin }) {
  await p.click('[data-weiter="anlegen"]');
  for (const [feld, wert] of [["#neuEcht", echt], ["#neuName", name], ["#neuPasswort", passwort], ["#neuPin", pin], ["#neuPin2", pin2]]) await p.fill(feld, wert);
  await p.click('#formAnlegen [type="submit"]');
}
async function pinTippen(p, pin) {
  for (const z of pin) await p.click(`.tastatur [data-ziffer="${z}"]`);
  await p.click('.tastatur [data-pin="ok"]');
}
const inDerCompanion = (p) => warteAuf(p, () => location.pathname === "/app/" && typeof bd !== "undefined" && bd.status === "verbunden", null, 10000);

try {
  for (let i = 0; i < 60 && !(await fetch(`${BOARD}/api/server`).then((r) => r.ok, () => false)); i++) await schlafen(200);

  // ---- Max: alter QR-Code mit ?pin= → Anmeldeseite ----------------------------
  const max = await handy();
  await max.goto(`${BOARD}/app/?pin=471100`);
  pruefe(await warteAuf(max, () => location.pathname === "/" && document.getElementById("anmName")), "Companion ohne Anmeldung (alter QR-Code) → Anmeldeseite");
  pruefe(await max.title() === "Companion · Anmeldung" && (await text(max, "h1")) === "Companion" && (await text(max, "#kopfUnter")) === "Anmeldung",
    "Überschrift „Companion“, darunter „Anmeldung“");
  pruefe((await text(max, "#navigation")) === "Companion-App Dashboard-Login", "Navigation Companion-App | Dashboard-Login");
  await max.screenshot({ path: `${DIR}/a1-anmeldung.png` });
  await max.click('[data-nav="dashboard"]');
  pruefe(await warteAuf(max, () => document.getElementById("dashCode")), "Reiter Dashboard-Login: Feld für den Zugangs-Code (L5, Ablauf in dashboard-login.test.mjs)");
  await max.click('[data-nav="app"]');

  await max.fill("#anmName", "Max"); await max.fill("#anmPasswort", PASSWORT);
  await max.click('#formAnmelden [type="submit"]');
  pruefe(await warteAuf(max, () => document.getElementById("anmMeldung")?.textContent === "Anzeigename oder Passwort stimmt nicht"), "Unbekannter Name: „Anzeigename oder Passwort stimmt nicht“");

  // Registrieren: Fehler in der Seite, dann das erste Konto (gilt sofort)
  await registrieren(max, { echt: "Max Muster", name: "Max", passwort: "kurz", pin: "2468" });
  pruefe((await text(max, "#neuMeldung")) === "Das Passwort braucht mindestens 8 Zeichen", "Zu kurzes Passwort (Regel aus regeln.js)");
  await max.fill("#neuPasswort", PASSWORT); await max.fill("#neuPin2", "2469");
  await max.click('#formAnlegen [type="submit"]');
  pruefe((await text(max, "#neuMeldung")) === "Die beiden PINs sind verschieden", "PINs verschieden");
  await max.fill("#neuPin2", "2468");
  await max.screenshot({ path: `${DIR}/a2-registrierung.png` });
  await max.click('#formAnlegen [type="submit"]');
  pruefe(await warteAuf(max, () => document.querySelector(".willkommen h2")?.textContent === "Willkommen, Max"), "Erstes Konto gilt sofort → Willkommenskarte");
  await max.screenshot({ path: `${DIR}/a3-willkommen.png` });
  await max.click('[data-weiter="companion"]');
  pruefe(await inDerCompanion(max), "„Weiter zur Companion“ → /app/, live verbunden");
  pruefe(await max.evaluate(() => bd.ich?.anzeigename === "Max" && Boolean(JSON.parse(localStorage.getItem("board.pinLokal"))?.hash)),
    "Angemeldet als Max, PIN-Hash für die Sperre ohne Netz abgelegt");
  await max.goto(`${BOARD}/`);
  pruefe(await warteAuf(max, () => location.pathname === "/app/"), "Angemeldet auf / → direkt weiter in die Companion (keine zweite Willkommenskarte)");

  // ---- Lena registriert sich: wartet, bis Max sie freigibt --------------------------
  const lena = await handy();
  await lena.goto(`${BOARD}/`);
  await registrieren(lena, { echt: "Lena Lindner", name: "Lena", pin: "1357" });
  pruefe(await warteAuf(lena, () => document.querySelector("#buehne h2")?.textContent === "Wartet auf Freigabe"), "Lena: „Wartet auf Freigabe“");
  await lena.screenshot({ path: `${DIR}/a4-wartet.png` });
  await lena.goto(`${BOARD}/app/`);
  pruefe(await warteAuf(lena, () => location.pathname === "/" && document.querySelector("#buehne h2")?.textContent === "Wartet auf Freigabe"), "Companion direkt geöffnet → zurück, Konto wartet");

  await max.evaluate(() => boardOeffnen());
  pruefe(await warteAuf(max, () => document.querySelector('[data-aktion="konto-freigeben"]')), "Max: Board-Sheet zeigt Lena unter „Konten“ zum Freigeben");
  pruefe((await text(max, '[data-konto] .card-meta')).includes("Lena Lindner"), "… mit echtem Namen");
  await max.evaluate(() => document.querySelector('[data-aktion="konto-freigeben"]').scrollIntoView({ block: "center" }));
  await max.screenshot({ path: `${DIR}/a5-konten-freigabe.png` });
  await max.click('[data-aktion="konto-freigeben"]');
  pruefe(await warteAuf(max, () => !document.querySelector('[data-aktion="konto-freigeben"]')
    && document.getElementById("orteSheetInhalt").textContent.includes("freigegeben von Max")), "Freigegeben: „freigegeben von Max“");
  pruefe(await warteAuf(lena, () => document.querySelector(".willkommen h2")?.textContent === "Willkommen, Lena", null, 15000), "Lena: Seite merkt die Freigabe von selbst → Willkommenskarte");
  await lena.click('[data-weiter="companion"]');
  pruefe(await inDerCompanion(lena), "Lena in der Companion");

  // ---- Zoe: Max lehnt ab (zweimal tippen), Zoes Seite geht zurück zur Anmeldung -------
  const zoe = await handy();
  await zoe.goto(`${BOARD}/`);
  await registrieren(zoe, { echt: "Zoe Z.", name: "Zoe", pin: "1111" });
  await warteAuf(zoe, () => document.querySelector("#buehne h2")?.textContent === "Wartet auf Freigabe");
  pruefe(await warteAuf(max, () => document.querySelector('[data-aktion="konto-ablehnen"]')), "Max sieht Zoe live unter „Konten“");
  await max.click('[data-aktion="konto-ablehnen"]');
  pruefe((await text(max, '[data-aktion="konto-ablehnen"]')) === "Wirklich?", "Ablehnen fragt nach");
  await max.click('[data-aktion="konto-ablehnen"]');
  pruefe(await warteAuf(max, () => !document.querySelector('[data-aktion="konto-ablehnen"]')), "Zoe abgelehnt");
  pruefe(await warteAuf(zoe, () => document.getElementById("anmName") && document.getElementById("buehne").textContent.includes("nicht mehr angemeldet"), null, 15000),
    "Zoes Seite: wieder die Anmeldung");
  await zoe.context().close();

  // ---- PIN-Sperre: über 30 Minuten ohne Kontakt ---------------------------------------
  await uhr(31);
  await max.reload();
  pruefe(await warteAuf(max, () => location.pathname === "/" && document.querySelector(".tastatur")), "Nach 31 Minuten ohne Kontakt: Companion → Anmeldeseite mit PIN-Sperre");
  pruefe((await text(max, ".grund")) === "Dieses Gerät war 31 Minuten ohne Verbindung. Bitte bestätige mit deiner PIN.", "Grund: 31 Minuten ohne Verbindung");
  await max.screenshot({ path: `${DIR}/a6-pin-sperre.png` });
  await pinTippen(max, "0000");
  pruefe(await warteAuf(max, () => document.getElementById("pinMeldung")?.textContent === "Falsche PIN für Max"), "Falsche PIN gemeldet");
  await pinTippen(max, "2468");
  pruefe(await inDerCompanion(max), "Richtige PIN → zurück in der Companion");

  // ---- PIN zurücksetzen: Max' zweites Gerät fragt danach nach der neuen PIN -----------
  const max2 = await handy();
  await max2.goto(`${BOARD}/`);
  await max2.fill("#anmName", "max"); await max2.fill("#anmPasswort", PASSWORT);
  await max2.click('#formAnmelden [type="submit"]');
  pruefe(await inDerCompanion(max2), "Max auf einem zweiten Gerät (Name ohne Groß-/Kleinschreibung)");
  await uhr(31);
  await max.reload();
  await warteAuf(max, () => document.querySelector(".tastatur"));
  await max.click('[data-weiter="reset"]');
  pruefe((await text(max, "#kopfUnter")) === "PIN zurücksetzen", "„PIN vergessen?“ → PIN zurücksetzen");
  await max.fill("#resPasswort", "falsch-falsch"); await max.fill("#resPin", "1470"); await max.fill("#resPin2", "1470");
  await max.click('#formReset [type="submit"]');
  pruefe(await warteAuf(max, () => document.getElementById("resMeldung")?.textContent === "Das Passwort stimmt nicht"), "Falsches Passwort gemeldet");
  await max.fill("#resPasswort", PASSWORT);
  await max.screenshot({ path: `${DIR}/a7-pin-zuruecksetzen.png` });
  await max.click('#formReset [type="submit"]');
  pruefe(await inDerCompanion(max), "Neue PIN gespeichert → weiter in die Companion");
  await max2.reload();
  pruefe(await warteAuf(max2, () => location.pathname === "/" && document.querySelector(".grund")?.textContent === "Deine PIN wurde geändert. Bitte gib die neue PIN ein."),
    "Zweites Gerät: „Deine PIN wurde geändert“");
  await pinTippen(max2, "2468");
  pruefe(await warteAuf(max2, () => document.getElementById("pinMeldung")?.textContent === "Falsche PIN für Max"), "… die alte PIN gilt nicht mehr");
  await pinTippen(max2, "1470");
  pruefe(await inDerCompanion(max2), "… mit der neuen PIN weiter");

  // ---- Anderes Konto: dieses Gerät meldet sich ab ---------------------------------------
  await uhr(31);
  await max2.reload();
  await warteAuf(max2, () => document.querySelector(".tastatur"));
  await max2.click('[data-weiter="abmelden"]');
  pruefe(await warteAuf(max2, () => document.getElementById("anmName") && !localStorage.getItem("board.verbindung")), "„Anderes Konto“ → Anmeldung, Gerät vergessen");
  pruefe((await ansicht(max2)).includes("Abgemeldet. Dieses Gerät braucht jetzt wieder ein Passwort."), "Hinweis: wieder mit Passwort");
  await max2.context().close();

  // ---- Altes Board (vor dem Pi-Update) und Board nicht erreichbar -----------------------
  const alt = await handy();
  await alt.route(`${BOARD}/api/anmelden`, (r) => r.fulfill({ status: 404, contentType: "application/json", body: '{"fehler":"Nicht gefunden"}' }));
  await alt.goto(`${BOARD}/`);
  await alt.fill("#anmName", "Max"); await alt.fill("#anmPasswort", PASSWORT);
  await alt.click('#formAnmelden [type="submit"]');
  pruefe(await warteAuf(alt, () => document.getElementById("anmMeldung")?.textContent.includes("der Pi braucht ein Update")), "Altes Board ohne /api/anmelden: „der Pi braucht ein Update“");
  await alt.context().close();
  await lena.route(`${BOARD}/api/ich`, (r) => r.abort());
  await lena.goto(`${BOARD}/`);
  pruefe(await warteAuf(lena, () => document.getElementById("buehne").textContent.includes("Das Board ist gerade nicht erreichbar")
    && document.querySelector('[data-weiter="companion"]')), "Angemeldet, Board weg: Hinweis und „Offline weiter zur Companion“");
  await lena.screenshot({ path: `${DIR}/a8-board-weg.png` });
} catch (f) {
  pruefe(false, `Abbruch: ${f.stack || f}`);
} finally {
  pruefe(fehler.length === 0, `keine Fehler in der Seite${fehler.length ? `: ${fehler.join(" | ")}` : ""}`);
  await browser.close();
  board.kill("SIGTERM"); await new Promise((r) => board.once("exit", r));
  rmSync(TMP, { recursive: true, force: true });
}
