// Anzeige-Link: Im Board-Sheet der Companion stehen die Anzeigen mit Link und QR-Code. Ein anderes Gerät
// (hier: dieselbe Maschine über ihre Netzwerkadresse, also nicht localhost) wird mit dem Link zur Anzeige,
// merkt sich den Schlüssel und fliegt raus, wenn jemand einen neuen Schlüssel erzeugt. Die Anzeige ist das
// Widget-Dashboard (Bauplan „Sitzung“, S4); alte Links auf /anzeige führen dorthin.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { mkdirSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir, networkInterfaces } from "node:os";
import path from "node:path";
import { CHROMIUM_OPTIONEN, anzeigeLinkQuery, konto, anmelden } from "./hilfen.mjs";

const HIER = fileURLToPath(new URL(".", import.meta.url));
const DIR = path.join(HIER, "bilder");
mkdirSync(DIR, { recursive: true });
const pruefe = (ok, text) => { console.log((ok ? "OK   " : "FEHL ") + text); if (!ok) process.exitCode = 1; };
const schlafen = (ms) => new Promise((r) => setTimeout(r, ms));
if (!existsSync(path.join(HIER, "../widgets/dist/index.html"))) {
  console.log("FEHL Dashboard nicht gebaut: npm --prefix ../widgets install && npm --prefix ../widgets run build");
  process.exit(1);
}
const AUSSEN = Object.values(networkInterfaces()).flat().find((n) => n && n.family === "IPv4" && !n.internal)?.address;
if (!AUSSEN) { console.log("OK   übersprungen: keine Netzwerkadresse für den Zugriff „von außen“"); process.exit(0); }

const TMP = mkdtempSync(path.join(tmpdir(), "anzeige-link-"));
const PORT = 3189, BOARD = `http://127.0.0.1:${PORT}`;
const board = spawn(process.execPath, ["src/server.js"], {
  cwd: path.join(HIER, "../../koordinaten-board/server"),
  env: { ...process.env, PORT: String(PORT), DATEN_ORDNER: path.join(TMP, "daten"), OEFFENTLICHE_URL: `http://${AUSSEN}:${PORT}` },
  stdio: ["ignore", "pipe", "ignore"],
});
let konsole = "";
board.stdout.on("data", (d) => { konsole += d; });

const browser = await chromium.launch(CHROMIUM_OPTIONEN);
const fehler = [];
async function seite(viewport = { width: 390, height: 844 }) {
  const k = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const p = await k.newPage();
  p.on("pageerror", (e) => fehler.push(e.message));
  return p;
}
const text = (p, sel) => p.$eval(sel, (e) => e.textContent.replace(/\s+/g, " ").trim()).catch(() => "");
const warteAuf = (p, fn, arg, ms = 8000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
// Dashboard als Anzeige: läuft (Anzeige „Board“, verbunden, kein Hinweis auf den Link) oder zeigt einen Hinweis in den Widgets
const laeuft = (p) => warteAuf(p, () => document.querySelector('[data-testid="anzeige-name"]')?.textContent === "Anzeige Board"
  && document.querySelector('[data-testid="verbunden"]')?.dataset.verbunden === "true"
  && ![...document.querySelectorAll('[data-testid="widget-leer"]')].some((e) => e.textContent.includes("Anzeige-Link")));
const hinweis = (p, text, ms) => warteAuf(p, (t) => document.querySelectorAll('[data-testid="widget-leer"]').length > 0
  && [...document.querySelectorAll('[data-panel-id] [data-testid="widget-leer"]')].every((e) => e.textContent === t), text, ms);

try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BOARD}/api/server`)).ok) break; } catch {} await schlafen(200); }
  await schlafen(300);
  pruefe(new RegExp(`Anzeige: http://${AUSSEN.replace(/\./g, "\\.")}:${PORT}/dashboard\\?anzeige=a_\\d+&schluessel=[\\w-]+`).test(konsole),
    "Konsole nennt den Anzeige-Link beim Start");
  pruefe(/anzeige-link\.txt/.test(konsole) && (await anzeigeLinkQuery(path.join(TMP, "daten"))).startsWith("?anzeige=a_"),
    "Server schreibt den Link nach daten/anzeige-link.txt (für die Startskripte)");

  // ---- Max meldet sich an, öffnet das Board-Sheet ----
  const max = await seite();
  await konto(BOARD, "Max");
  await anmelden(max, BOARD, "Max");
  // „Noch keine Welt“ geht erst nach dem Laden der Welten auf – vorher schließen, und es überdeckt später das Board-Sheet
  pruefe(await warteAuf(max, () => document.querySelector(".sheet-kopf h2")?.textContent === "Welt"), "Angemeldet → leeres Board: Welt anlegen");
  await max.evaluate(() => alleSchliessen());
  await max.click("#burgerBtn"); await schlafen(300);   // Board-Knopf unten in der Sidebar
  await max.click("#boardBtn");
  pruefe(await warteAuf(max, () => bd.anzeigen?.length === 1 && document.querySelector(".anzeige-karte")), "Board-Sheet: Abschnitt „Anzeigen“");
  const board1 = await max.evaluate(() => bd.anzeigen[0]);
  pruefe(board1.name === "Board" && board1.link.startsWith(`http://${AUSSEN}:${PORT}/dashboard?anzeige=`), `Anzeige „Board“ mit Link (${board1.link.split("&")[0]}…)`);
  await max.click('.anzeige-karte [data-aktion="anzeige-qr"]');
  pruefe(await warteAuf(max, () => document.querySelector(".anzeige-qr svg")), "QR-Code zum Abscannen");
  await max.evaluate(() => document.querySelector(".anzeige-qr").scrollIntoView({ block: "center" }));
  await max.screenshot({ path: `${DIR}/z1-anzeigen.png` });

  // ---- Anzeige „von außen“: ohne Link gesperrt, mit Link erlaubt, merkt sich den Schlüssel ----
  const tv = await seite({ width: 1280, height: 720 });
  await tv.goto(`http://${AUSSEN}:${PORT}/dashboard/`);
  pruefe(await hinweis(tv, "Diese Anzeige braucht ihren Anzeige-Link"), "Anderes Gerät ohne Link: Hinweis auf den Anzeige-Link");
  await tv.goto(board1.link);
  pruefe(await laeuft(tv), "Mit Anzeige-Link läuft die Anzeige");
  await tv.goto(`http://${AUSSEN}:${PORT}/dashboard/`);
  pruefe(await laeuft(tv), "Neustart ohne Link: Schlüssel aus dem Browser");
  await tv.goto(`http://${AUSSEN}:${PORT}/anzeige`);
  pruefe(new URL(tv.url()).pathname === "/dashboard/" && await laeuft(tv), "Alter Pfad /anzeige führt aufs Dashboard");
  await tv.screenshot({ path: `${DIR}/z2-anzeige-tv.png` });

  // ---- Neue Anzeige, umbenennen ----
  await max.fill("#anzeigeNeu", "Tablet");
  await max.click('[data-aktion="anzeige-anlegen"]');
  pruefe(await warteAuf(max, () => bd.anzeigen.length === 2 && document.querySelectorAll(".anzeige-karte").length === 2), "Neue Anzeige „Tablet“");
  await max.click('.anzeige-karte:nth-child(2) [data-aktion="anzeige-umbenennen"]');
  await max.fill("#anzeigeName", "Wohnzimmer-TV");
  await max.click('[data-aktion="anzeige-name-speichern"]');
  pruefe(await warteAuf(max, () => bd.anzeigen[1].name === "Wohnzimmer-TV" && document.querySelectorAll(".anzeige-karte .card-title")[1]?.textContent === "Wohnzimmer-TV"),
    "Umbenannt in „Wohnzimmer-TV“");

  // ---- Neuer Schlüssel (zweimal tippen): verbundene Anzeige fliegt raus ----
  const knopf = '.anzeige-karte:nth-child(1) [data-aktion="anzeige-schluessel"]';
  await max.click(knopf);
  pruefe((await text(max, knopf)) === "Alte Links ungültig?" && (await max.evaluate((l) => bd.anzeigen[0].link === l, board1.link)), "Erstes Tippen fragt nach");
  await max.click(knopf);
  pruefe(await warteAuf(max, (l) => bd.anzeigen[0].link !== l, board1.link), "Neuer Schlüssel erzeugt");
  pruefe(await hinweis(tv, "Dieser Anzeige-Link gilt nicht mehr", 15000), "Anzeige mit altem Schlüssel: „Dieser Anzeige-Link gilt nicht mehr“");
  await tv.screenshot({ path: `${DIR}/z3-anzeige-ungueltig.png` });
  await tv.goto(await max.evaluate(() => bd.anzeigen[0].link));
  pruefe(await laeuft(tv), "Mit dem neuen Link läuft sie wieder");
  await max.screenshot({ path: `${DIR}/z4-anzeigen-zwei.png` });

  // Auch das Board-Gerät selbst (localhost) braucht den Link (Umbau Phase 1)
  const lokal = await seite({ width: 1280, height: 720 });
  await lokal.goto(`${BOARD}/dashboard/`);
  pruefe(await hinweis(lokal, "Diese Anzeige braucht ihren Anzeige-Link"), "localhost ohne Link: gesperrt");
  await lokal.goto(`${BOARD}/dashboard${await anzeigeLinkQuery(path.join(TMP, "daten"))}`);
  pruefe(await laeuft(lokal), "localhost mit Link: Anzeige läuft");
} catch (f) {
  pruefe(false, `Abbruch: ${f.stack || f}`);
} finally {
  pruefe(fehler.length === 0, `keine Fehler in der Seite${fehler.length ? `: ${fehler.join(" | ")}` : ""}`);
  await browser.close();
  board.kill("SIGTERM"); await new Promise((r) => board.once("exit", r));
  rmSync(TMP, { recursive: true, force: true });
}
