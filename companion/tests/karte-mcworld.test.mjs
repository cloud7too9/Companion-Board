// Welt-Import (Biome aus dem Weltordner, .zip oder .mcworld) in der Karte: Ordner wählen oder hineinziehen
// (nur die gebrauchten Dateien), mehrere Welten zur Auswahl, Anleitung, Aufbauprüfung, Bestätigung mit
// Weltname und Seed, Lesen im Worker, Prüfliste, Übernehmen, Biom-Ebene, Löschen – im DEMO über http,
// als Datei und live gegen ein echtes Board. Die Welten baut welt-bauen.mjs (synthetisch); eine echte
// Welt von Max (tests/daten/fixture-seed.mcworld) gibt es noch nicht.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { companionAusliefern, CHROMIUM_OPTIONEN } from "./hilfen.mjs";
import { testweltBauen, fundeweltBauen, zipBauen, levelDatBauen, SEED } from "./welt-bauen.mjs";

const HIER = fileURLToPath(new URL(".", import.meta.url));
const DIR = path.join(HIER, "bilder");
mkdirSync(DIR, { recursive: true });
const pruefe = (ok, text) => { console.log((ok ? "OK   " : "FEHL ") + text); if (!ok) process.exitCode = 1; };
const schlafen = (ms) => new Promise((r) => setTimeout(r, ms));
/** Welt-Import öffnen wie am Handy: Sidebar → Welt → „Welt-Import …“ (seit 05.10.2026 nicht mehr in der Bottom-Bar) */
const importOeffnen = async (seite) => {
  await seite.click("#burgerBtn"); await schlafen(150);
  await seite.click("#weltKnopf"); await schlafen(200);
  await seite.click('#orteSheetInhalt [data-aktion="welt-import"]'); await schlafen(200);
};

// Test-ZIPs je Fall (planung/PLAN.md, Strang C): korrekt, mit Unterordner, ohne db/, keine ZIP
const ZIP = { mimeType: "application/zip" };
const DATEIEN = {
  korrekt: { name: "Archiv.zip", ...ZIP, buffer: Buffer.from(testweltBauen({ levelname: "Unsere Welt" }).zip) },
  unterordner: { name: "Archiv.zip", ...ZIP, buffer: Buffer.from(testweltBauen({ levelname: "Unsere Welt", ordner: "Unsere Welt/" }).zip) },
  ohneDb: { name: "Archiv.zip", ...ZIP, buffer: Buffer.from(testweltBauen({ ohne: ["db/"] }).zip) },
  keinZip: { name: "Notizen.txt", mimeType: "text/plain", buffer: Buffer.from("Das ist keine Welt") },
  mcworld: { name: "Realm.mcworld", mimeType: "application/octet-stream", buffer: Buffer.from(testweltBauen({ levelname: "Realm" }).zip) },
  andererSeed: { name: "Archiv.zip", ...ZIP, buffer: Buffer.from(testweltBauen({ levelname: "Kreativ", seed: "-123456789" }).zip) },
  leer: { name: "Archiv.zip", ...ZIP, buffer: Buffer.from(zipBauen([["level.dat", levelDatBauen({ seed: SEED })],
    ["db/CURRENT", new TextEncoder().encode("MANIFEST-000001\n")]])) },
  // Bauplan „Welt-Funde“: Strukturen, Portale, Spieler, Vorlagen, Rüstung, Banner (welt-bauen.mjs)
  funde: { name: "Funde.zip", ...ZIP, buffer: Buffer.from(fundeweltBauen().zip) },
};

// Weltordner wie in der Dateien-App am iPhone (mit Paketen, world_icon.jpeg, level.dat_old, LOCK, LOG)
const ORDNER = mkdtempSync(path.join(tmpdir(), "weltordner-"));
const ordnerSchreiben = (ziel, dateien) => { for (const [p, b] of dateien) { mkdirSync(path.dirname(path.join(ziel, p)), { recursive: true }); writeFileSync(path.join(ziel, p), b); } };
const EINE_WELT = path.join(ORDNER, "z2l2cn0rmkA=");
ordnerSchreiben(EINE_WELT, testweltBauen({ levelname: "Unsere Welt", beiwerk: true }).dateien);
const ALLE_WELTEN = path.join(ORDNER, "minecraftWorlds");
ordnerSchreiben(path.join(ALLE_WELTEN, "AAAA="), testweltBauen({ levelname: "Unsere Welt", beiwerk: true }).dateien);
ordnerSchreiben(path.join(ALLE_WELTEN, "BBBB="), testweltBauen({ levelname: "Kreativ", seed: "-123456789" }).dateien);
const KEINE_WELT = path.join(ORDNER, "db");
ordnerSchreiben(KEINE_WELT, testweltBauen().dateien.filter(([p]) => p.startsWith("db/")).map(([p, b]) => [p.slice(3), b]));

const browser = await chromium.launch(CHROMIUM_OPTIONEN);
const fehler = [];
async function handy() {
  const kontext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await kontext.newPage();
  p.on("pageerror", (e) => fehler.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) fehler.push(m.text()); });
  return p;
}
const text = (p, sel) => p.$eval(sel, (e) => e.textContent.replace(/\s+/g, " ").trim()).catch(() => "");
const warteAuf = (p, fn, arg, ms = 8000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const sheet = (p) => text(p, "#orteSheetInhalt");
/** Datei wählen wie am Handy (die versteckte Eingabe hinter „ZIP oder .mcworld wählen“) */
const hochladen = (p, datei) => p.setInputFiles("#weltDatei", datei);
/** Bildschirmposition einer Blockkoordinate auf der Karte */
const anStelle = (p, x, z) => p.evaluate(([x, z]) => {
  const c = document.getElementById("ortKarte").getBoundingClientRect();
  karte.zentrieren(x, z);
  return [c.left + c.width / 2, c.top + c.height / 2 - (c.height * 0.22)];
}, [x, z]);

let server = null, board = null, tmp = null;
try {
  // ======================================================================================
  // DEMO über http: Worker und Dekoder laufen als ES-Module
  // ======================================================================================
  server = await companionAusliefern(3191);
  const p = await handy();
  await p.goto(`${server.adresse}/companion-prototyp.html?demo=1&modul=karte`);
  await warteAuf(p, () => st.welt && bm.weltId === st.weltId && bm.import);
  await p.evaluate(() => dimWechseln("overworld"));
  await schlafen(400);

  // ---- Demo-Biome auf der Karte ----
  const demo = await p.evaluate(() => ({ kacheln: bm.kacheln.size, chunks: bm.import.chunks,
    hinweis: document.getElementById("karteHinweis").textContent.replace(/\s+/g, " "), legende: document.getElementById("karteLegende").textContent,
    knopf: !document.getElementById("karteBiome").hidden }));
  pruefe(demo.kacheln > 4 && demo.chunks.overworld > 1000 && demo.chunks.nether > 0, `Demo-Welt hat Biome: ${demo.kacheln} Kacheln, ${JSON.stringify(demo.chunks)}`);
  pruefe(/^\d+ Blöcke · Biome 28\.9\. · [\d ]+ Chunks$/.test(demo.hinweis), `Hinweis: ${demo.hinweis}`);   // Rasterweite hängt von der Kartengröße ab
  pruefe(/Ebene|Wald|Ozean/.test(demo.legende) && demo.knopf, `Legende mit Biomen, Knopf sichtbar: ${demo.legende}`);
  // Kacheln werden wirklich gezeichnet (32 × 32-Bilder)
  const gezeichnet = () => p.evaluate(() => {
    let n = 0; const orig = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (b, ...r) { if (b instanceof HTMLCanvasElement && b.width === 32) n++; return orig.call(this, b, ...r); };
    karte.zeichnen(); CanvasRenderingContext2D.prototype.drawImage = orig; return n;
  });
  pruefe((await gezeichnet()) > 0, "Biom-Kacheln werden gezeichnet");
  await p.screenshot({ path: `${DIR}/m1-karte-demo.png` });

  // Antippen: Biom an der Stelle, außerhalb „unerkundet“
  const zahlLesen = (t) => Number(t.replace(/\s/g, "").replace("−", "-"));
  let [px, py] = await anStelle(p, 8, 8);
  await p.mouse.click(px, py); await schlafen(250);
  const tippSpawn = await text(p, ".karte-legende .tipp");
  const [, tx, tz, tname] = tippSpawn.match(/^X ([−\d ]+) · Z ([−\d ]+) · (.+)$/) || [];
  const sollSpawn = tx && await p.evaluate(([x, z]) => biomName(biomAnStelle("overworld", x, z)?.name), [zahlLesen(tx), zahlLesen(tz)]);
  pruefe(Boolean(sollSpawn) && tname === sollSpawn && Math.abs(zahlLesen(tx) - 8) <= 2 && Math.abs(zahlLesen(tz) - 8) <= 2,
    `Tippen am Spawn: „${tippSpawn}“`);
  await p.screenshot({ path: `${DIR}/m2-karte-tippen.png` });
  [px, py] = await anStelle(p, 20000, 20000);
  await p.mouse.click(px, py); await schlafen(250);
  const tippAussen = await text(p, ".karte-legende .tipp");
  pruefe(/^X (19 9|20 0)\d\d · Z (19 9|20 0)\d\d · unerkundet$/.test(tippAussen), `Tippen außerhalb: „${tippAussen}“`);
  // Ebene aus- und wieder einblenden (am Spawn, dort liegen Kacheln)
  await p.evaluate(() => karte.zentrieren(0, 0)); await schlafen(200);
  await p.click("#karteBiome"); await schlafen(200);
  pruefe((await p.getAttribute("#karteBiome", "aria-pressed")) === "false" && (await gezeichnet()) === 0
    && (await p.evaluate(() => lsLesen("orte.biome"))) === false, "Biome ausgeblendet (merkt sich das Gerät)");
  await p.click("#karteBiome"); await schlafen(200);
  pruefe((await gezeichnet()) > 0, "Biome wieder eingeblendet");
  // Nether: eigene Kacheln
  await p.evaluate(() => dimWechseln("nether")); await schlafen(300);
  pruefe(/Netherödnis|Seelensandtal|Karmesinwald|Wirrwald|Basaltdeltas/.test(await text(p, "#karteLegende")), "Nether zeigt Nether-Biome (deutsch)");
  await p.screenshot({ path: `${DIR}/m3-karte-nether.png` });
  await p.evaluate(() => dimWechseln("overworld")); await schlafen(200);

  // ---- Import-Sheet: Anleitung, Stand ----
  await importOeffnen(p);
  let s = await sheet(p);
  pruefe(s.includes("Weltordner aus der Dateien-App hochladen") && s.includes("iPhone") && s.includes("minecraftWorlds")
    && (await p.$$eval(".wi-anleitung li", (l) => l.length)) === 3, "Anleitung: drei Schritte, nur iPhone");
  pruefe(s.includes("Weltordner hierher ziehen") && s.includes("Weltordner wählen") && s.includes("ZIP oder .mcworld wählen")
    && await p.$eval("#weltOrdner", (i) => i.webkitdirectory), "Ablage-Fläche, „Weltordner wählen“ (webkitdirectory) und ZIP als Rückweg");
  pruefe(s.includes("Stand28.9.2026") && s.includes("Import löschen") && s.includes("nur in Gebieten, die schon jemand besucht hat"),
    "Stand des Imports, Löschen, Hinweis auf besuchte Gebiete");
  await p.screenshot({ path: `${DIR}/m4-import-start.png` });

  // ---- Weltordner wählen: nur die gebrauchten Dateien, dann bestätigen ----
  await p.setInputFiles("#weltOrdner", EINE_WELT);
  pruefe(await warteAuf(p, () => wi.schritt === "bestaetigen"), "Weltordner gewählt → Bestätigung");
  s = await sheet(p);
  pruefe(s.includes("Unsere Welt") && s.includes(`${SEED} ✔`) && s.includes("Ordnerz2l2cn0rmkA=/")
    && (await text(p, '[data-testid="wi-dateien"]')).startsWith("Gebraucht8 von 17 Dateien ·")
    && await p.evaluate(() => wi.quelle.map((e) => e.pfad).sort().join()) === "db/000008.ldb,db/000011.ldb,db/000013.ldb,db/000014.log,db/CURRENT,db/MANIFEST-000015,level.dat,levelname.txt",
    `Nur die gebrauchten Dateien gehen an den Worker: ${await text(p, '[data-testid="wi-dateien"]')}`);
  await p.screenshot({ path: `${DIR}/m6b-weltordner.png` });
  await p.click('[data-aktion="wi-neu"]');
  pruefe(await warteAuf(p, () => wi.schritt === "start" && wi.quelle === null), "„Andere Welt“ → zurück zum Start");

  // ---- minecraftWorlds gewählt: zwei Welten zur Auswahl ----
  await p.setInputFiles("#weltOrdner", ALLE_WELTEN);
  pruefe(await warteAuf(p, () => wi.schritt === "waehlen"), "minecraftWorlds → Auswahl der Welt");
  pruefe((await p.$$eval('[data-aktion="wi-welt-waehlen"] .card-title', (l) => l.map((e) => e.textContent))).join() === "Kreativ,Unsere Welt",
    "Beide Welten mit ihrem Namen aus levelname.txt");
  await p.screenshot({ path: `${DIR}/m6c-welt-waehlen.png` });
  await p.click('[data-aktion="wi-welt-waehlen"][data-nr="1"]');
  pruefe(await warteAuf(p, () => wi.schritt === "bestaetigen" && wi.dateiname === "AAAA=/"), "Gewählte Welt wird geprüft");
  await p.click('[data-aktion="wi-neu"]');
  await p.setInputFiles("#weltOrdner", KEINE_WELT);
  pruefe(await warteAuf(p, () => document.querySelector("#orteSheetInhalt .banner.bad")?.textContent.startsWith("Darin ist keine Welt.")),
    "Nur db/ gewählt → „Darin ist keine Welt …“");

  // ---- Hineinziehen: eine ZIP auf die Fläche ----
  await p.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "Archiv.zip", { type: "application/zip" }));
    const ziel = document.querySelector(".wi-ablage");
    ziel.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
    ziel.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, DATEIEN.korrekt.buffer.toString("base64"));
  pruefe(await warteAuf(p, () => wi.schritt === "bestaetigen" && wi.dateiname === "Archiv.zip"), "ZIP auf die Fläche gezogen → Bestätigung");
  await p.click('[data-aktion="wi-neu"]');

  // ---- Aufbauprüfung ----
  await hochladen(p, DATEIEN.keinZip);
  pruefe(await warteAuf(p, () => document.querySelector("#orteSheetInhalt .banner.bad")?.textContent === "Das ist keine ZIP. Bitte den Weltordner wählen oder eine .zip/.mcworld-Datei."),
    "Keine ZIP → „Das ist keine ZIP …“");
  await hochladen(p, DATEIEN.ohneDb);
  pruefe(await warteAuf(p, () => document.querySelector("#orteSheetInhalt .banner.bad")?.textContent === "Das sieht nicht nach einem Minecraft-Weltordner aus."),
    "Ohne db/ → „Das sieht nicht nach einem Minecraft-Weltordner aus.“");
  await p.screenshot({ path: `${DIR}/m5-import-fehler.png` });

  // ---- Bestätigung: Weltname aus levelname.txt, Seed – mit Unterordner ohne Hinweis ----
  await hochladen(p, DATEIEN.unterordner);
  pruefe(await warteAuf(p, () => wi.schritt === "bestaetigen"), "Mit Unterordner angenommen");
  s = await sheet(p);
  pruefe(s.includes("Unsere Welt") && s.includes(`${SEED} ✔`) && s.includes("1.26.50") && !s.includes("Ordner")
    && !(await p.$("#orteSheetInhalt .banner")), `Bestätigung ohne Hinweis: ${s.slice(0, 140)}`);
  await p.screenshot({ path: `${DIR}/m6-bestaetigen.png` });

  // ---- Lesen im Worker → Prüfliste ----
  await p.click('[data-aktion="wi-lesen"]');
  pruefe(await warteAuf(p, () => wi.schritt === "pruefliste"), "Worker liest die Welt");
  pruefe(await p.evaluate(() => wi.ergebnis.funde?.info?.schwierigkeit === "normal" && Array.isArray(wi.ergebnis.funde.orte)),
    "Worker liefert die Funde mit (nbt.js, welt-funde.js)");
  s = await sheet(p);
  pruefe(s.includes("1 305 Chunks") && s.includes("Oberwelt1 279 Chunks") && s.includes("Nether24 Chunks") && s.includes("End2 Chunks"),
    "Prüfliste: Chunks je Dimension");
  pruefe(s.includes("Unbekannte Biom-IDs") && s.includes("250 · 3 Chunks, z. B. Oberwelt X 488 Z 8"), "Unbekannte ID mit Beispielkoordinate");
  pruefe(s.includes("Ersetzt den Import vom 28.9.2026"), "Hinweis: ersetzt den alten Import");
  const vorschau = await p.$eval(".wi-vorschau", (i) => [i.naturalWidth, i.naturalHeight]);
  pruefe(vorschau[0] === 80 && vorschau[1] === 16, `Vorschau 1 Pixel je erkundetem Chunk (${vorschau.join(" × ")}: cx −40…39, cz −8…7)`);
  pruefe(/Wald\d+ %/.test(s) && /Wüste\d+ %/.test(s), "Häufigste Biome mit Anteil (deutsch)");
  await p.screenshot({ path: `${DIR}/m7-pruefliste.png`, fullPage: true });
  await p.click('[data-wi-dim="nether"]'); await schlafen(200);
  pruefe((await text(p, ".wi-biome")).startsWith("Netherödnis100 %"), "Prüfliste Nether: Netherödnis (feste Höhe 64)");

  // ---- Übernehmen ----
  await p.click('[data-aktion="wi-uebernehmen"]');
  pruefe(await warteAuf(p, () => st.sheet === null && bm.import?.dateiname === "Archiv.zip"), "Übernommen, Sheet zu");
  const nachher = await p.evaluate(() => ({ toast: document.getElementById("orteToast").textContent.replace(/\s+/g, " "),
    pilz: biomAnStelle("overworld", 24, 24)?.name, fluss: biomAnStelle("overworld", 40, 40)?.name, alt: biomAnStelle("overworld", 2000, 2000),
    unbekannt: biomAnStelle("overworld", 488, 8), weltname: bm.import.weltname, von: bm.import.von, mock: MOCK.biome.w_1.kacheln.length }));
  pruefe(nachher.toast === "Biome übernommen · 1 305 Chunks", `Toast: ${nachher.toast}`);
  pruefe(nachher.pilz === "Mushroom Fields" && nachher.fluss === "River" && nachher.alt === null && nachher.unbekannt?.unbekannt === 250,
    "Neue Biome auf der Karte, alte ersetzt, unbekannte ID bleibt unbekannt");
  pruefe(nachher.weltname === "Unsere Welt" && nachher.von === "Max" && nachher.mock === 13, `Import im Mock gespeichert (${nachher.mock} Kacheln: 8 Oberwelt, 4 Nether, 1 End)`);
  await p.evaluate(() => karte.zentrieren(0, 0)); await schlafen(200);
  await p.screenshot({ path: `${DIR}/m8-karte-import.png` });

  // ---- Seed passt nicht: andere Welt gewählt ----
  await p.evaluate(() => weltLaden("w_2")); await schlafen(400);
  await importOeffnen(p);
  pruefe(!(await sheet(p)).includes("Import löschen"), "Welt 2 hat keinen Import");
  await hochladen(p, DATEIEN.korrekt);
  await warteAuf(p, () => wi.schritt === "bestaetigen");
  s = await sheet(p);
  pruefe(s.includes(`${SEED} ✘`) && s.includes("anderen Seed") && await p.$eval('[data-aktion="wi-lesen"]', (b) => b.disabled),
    "Anderer Seed: ✘, „Biome lesen“ gesperrt");
  pruefe(s.includes("Zur Welt mit diesem Seed wechseln"), "Angebot: zur Welt mit diesem Seed wechseln");
  await p.screenshot({ path: `${DIR}/m9-seed-falsch.png` });
  await p.click('[data-aktion="wi-welt-wechseln"]');
  pruefe(await warteAuf(p, () => st.weltId === "w_1" && document.querySelector("#orteSheetInhalt")?.textContent.includes("✔")), "Gewechselt, Seed ✔");
  // Seed, den es noch nicht gibt → neue Welt anlegen und hinein importieren
  await hochladen(p, DATEIEN.andererSeed);
  await warteAuf(p, () => wi.schritt === "bestaetigen");
  pruefe((await sheet(p)).includes("Neue Welt mit diesem Seed anlegen"), "Angebot: neue Welt mit diesem Seed");
  await p.click('[data-aktion="wi-welt-anlegen"]');
  pruefe(await warteAuf(p, () => st.welt?.seed === "-123456789" && !document.querySelector('[data-aktion="wi-lesen"]').disabled), "Neue Welt angelegt, Lesen frei");
  await p.click('[data-aktion="wi-lesen"]');
  await warteAuf(p, () => wi.schritt === "pruefliste");
  await p.click('[data-aktion="wi-uebernehmen"]');
  pruefe(await warteAuf(p, () => bm.weltId === st.weltId && bm.import?.weltname === "Kreativ"), "Import in die neue Welt");

  // ---- .mcworld geht genauso, Verwerfen, leere Welt ----
  await p.evaluate(() => weltLaden("w_1")); await schlafen(300);
  await importOeffnen(p);
  await hochladen(p, DATEIEN.mcworld);
  pruefe(await warteAuf(p, () => wi.schritt === "bestaetigen" && wi.welt.weltname === "Realm"), ".mcworld wird angenommen");
  await p.click('[data-aktion="wi-lesen"]'); await warteAuf(p, () => wi.schritt === "pruefliste");
  await p.click('[data-aktion="wi-verwerfen"]'); await schlafen(200);
  pruefe((await p.evaluate(() => [wi.schritt, bm.import.weltname])).join() === "start,Unsere Welt", "Verwerfen lässt den alten Import stehen");
  await hochladen(p, DATEIEN.leer);
  await warteAuf(p, () => wi.schritt === "bestaetigen"); await p.click('[data-aktion="wi-lesen"]');
  await warteAuf(p, () => wi.schritt === "pruefliste");
  pruefe((await sheet(p)).includes("noch nichts erkundet") && await p.$eval('[data-aktion="wi-uebernehmen"]', (b) => b.disabled),
    "Leere Welt: nichts zu übernehmen");
  await p.click('[data-aktion="wi-verwerfen"]'); await schlafen(200);

  // ---- Funde aus der Welt (Bauplan „Welt-Funde“, W2): je Art ein Schalter, automatisch übernehmen ----
  await hochladen(p, DATEIEN.funde);
  await warteAuf(p, () => wi.schritt === "bestaetigen"); await p.click('[data-aktion="wi-lesen"]');
  pruefe(await warteAuf(p, () => wi.schritt === "pruefliste" && wi.funde?.gruppen), "Funde eingeordnet");
  const fundZeilen = async (q) => q.$$eval(".wi-fund", (z) => z.map((e) =>
    `${e.querySelector(".card-title").textContent}: ${e.querySelector(".card-meta").textContent}${e.querySelector(".switch") ? (e.querySelector(".switch").getAttribute("aria-checked") === "true" ? " [an]" : " [aus]") : ""}`));
  const STRUKTUREN_NEU = ["Dorf", "Endsiedlung", "Mine", "Netherfestung", "Prüfungskammern", "Schiffswrack", "Wüstenbrunnen", "Wüstentempel", "Zerstörtes Portal"];
  pruefe(JSON.stringify(await fundZeilen(p)) === JSON.stringify([...STRUKTUREN_NEU.map((n) => `${n}: 1 neu [an]`), "Portal-Verbindung: 1 neu [an]",
    "Schmiedevorlage: 3 neu · 1 schon bekannt [an]", "Rüstungs-Set: 3 neu [an]", "Banner: 2 neu [an]"]),
    `Je Art eine Zeile mit Anzahl, alle an (Strukturen nach Name, Portal-Paar, Wächterzier ist im Mock schon gefunden): ${(await fundZeilen(p)).join(" | ")}`);
  pruefe((await text(p, '[data-testid="wi-spiel"]')) === "SpielKreativ · Schwer · 10 Tage · Cheats an", "Welt-Info aus level.dat in der Prüfliste");
  await p.$eval('[data-testid="wi-funde"]', (k) => k.scrollIntoView({ block: "start" })); await schlafen(150);
  await p.screenshot({ path: `${DIR}/m12-funde.png` });
  await p.click('[data-gruppe="banner"] .switch'); await schlafen(150);
  pruefe((await fundZeilen(p)).at(-1) === "Banner: 2 neu [aus]", "Schalter: Banner aus");
  const vorher = await p.evaluate(() => ({ orte: MOCK.instanzen.length, banner: MOCK.banner.length, sets: MOCK.ruestung.length }));
  await p.click('[data-aktion="wi-uebernehmen"]');
  pruefe(await warteAuf(p, () => st.sheet === null && bm.import?.dateiname === "Funde.zip"), "Funde: übernommen, Sheet zu");
  const funde = await p.evaluate((v) => ({ toast: document.getElementById("orteToast").textContent.replace(/\s+/g, " "),
    orte: MOCK.instanzen.filter((i) => i.quelle === "welt").length, neu: MOCK.instanzen.length - v.orte,
    karte: st.instanzen.filter((i) => i.quelle === "welt").map((i) => `${typVon(i).kategorie} ${i.x} ${i.z}`).sort(),
    portal: MOCK.portale.w_1.find((x) => x.name === "Portal bei X 100 · Z 200"), portale: pt.liste.length === MOCK.portale.w_1.length,
    sammel: ["sentry", "spire", "wild", "netherite"].map((id) => MOCK.sammel.w_1[id]?.von), sentry: MOCK.sammel.w_1.sentry.am,
    banner: MOCK.banner.length - v.banner, sets: MOCK.ruestung.length - v.sets,
    leder: MOCK.ruestung.find((x) => x.name === "Getragene Rüstung (29.9.)")?.teile.helmet, info: bm.import.info }), vorher);
  pruefe(funde.toast === "Biome übernommen · 1 305 Chunks · 16 Funde", `Toast: ${funde.toast}`);
  pruefe(funde.orte === 9 && funde.neu === 9 && funde.karte.length === 9 && funde.karte.includes("Desert Temple 165 170"),
    `9 Orte mit Herkunft Welt-Import, gleich auf der Karte (${funde.karte.join(", ")})`);
  pruefe(funde.portal?.oberwelt.x === 100 && funde.portal.nether.x === 12 && funde.portale, "Portal-Paar als Verbindung");
  pruefe(funde.sammel.join() === "Lena,Max,Max,Max" && funde.sentry === "2026-09-20", `Vorlagen gefunden, die schon gefundene bleibt bei Lena (${funde.sammel.join()}, ${funde.sentry})`);
  pruefe(funde.banner === 0 && funde.sets === 3 && funde.leder?.ruestung === "leather" && funde.leder.farbe === "red",
    "Banner abgeschaltet, 3 Rüstungs-Sets, gefärbtes Leder → Rot");
  pruefe(funde.info?.spielmodus === "creative" && funde.info.tage === 10, "Welt-Info im Import gespeichert");
  // Ort-Detail sagt, woher der Ort kommt
  await p.evaluate(() => detailOeffnen(st.instanzen.find((i) => i.quelle === "welt").id)); await schlafen(200);
  pruefe((await sheet(p)).includes("Herkunftaus dem Welt-Import"), "Ort-Detail: aus dem Welt-Import");
  await p.evaluate(() => alleSchliessen()); await schlafen(200);
  // Zweiter Import derselben Welt: alles schon bekannt, nur die abgeschalteten Banner sind noch neu
  await importOeffnen(p);
  pruefe((await sheet(p)).includes("SpielKreativ · Schwer · 10 Tage · Cheats an"), "Welt-Info beim gespeicherten Import");
  await hochladen(p, DATEIEN.funde);
  await warteAuf(p, () => wi.schritt === "bestaetigen"); await p.click('[data-aktion="wi-lesen"]');
  await warteAuf(p, () => wi.schritt === "pruefliste" && wi.funde?.gruppen);
  const zweiter = await fundZeilen(p);
  pruefe(zweiter.slice(0, 9).every((z) => z.endsWith(": nichts Neues · 1 schon bekannt")) && zweiter.slice(9).join(" | ")
    === "Portal-Verbindung: nichts Neues · 1 schon bekannt | Schmiedevorlage: nichts Neues · 4 schon bekannt | Rüstungs-Set: nichts Neues · 3 schon bekannt | Banner: 2 neu [an]",
    `Zweiter Import legt nichts doppelt an: ${zweiter.slice(9).join(" | ")}`);
  await p.click('[data-aktion="wi-verwerfen"]'); await schlafen(200);
  // Portale ohne Gegenstück werden „Eigene Orte · Netherportal“ (Frage 4, Max 13.10.2026); was eine Regel ablehnt, passt nicht
  const einzeln = await p.evaluate(() => wiFundeEinordnen({ orte: [], ruestung: [],
    portale: [{ dim: "overworld", x: 5000, y: 70, z: 5000, naehe: 8 }, { dim: "nether", x: -900, y: 40, z: -900, naehe: 8 }],
    sammelobjekte: [{ id: "gibtsnicht" }], banner: [{ name: "Banner bei X 1 · Z 1", basis: null, ebenen: [] }] },
  { verbindungen: [], sammel: {}, banner: [], ruestung: [] }).map((g) =>
    `${g.id}: ${g.eintraege.map((e) => `${e.kategorie}/${e.variante}/${e.dimensionId.split("_").pop()}`).join(", ")} · passt nicht ${g.passtNicht}`));
  pruefe(einzeln.join(" | ") === "netherportal: Eigene Orte/Netherportal/overworld, Eigene Orte/Netherportal/nether · passt nicht 0 | sammelobjekte:  · passt nicht 1 | banner:  · passt nicht 1",
    `Portale ohne Gegenstück als Eigene Orte, Unpassendes gezählt: ${einzeln.join(" | ")}`);

  // ---- Import löschen (zweimal tippen) ----
  await p.click('[data-aktion="wi-loeschen"]');
  pruefe((await text(p, '[data-aktion="wi-loeschen"]')) === "Wirklich löschen?" && (await p.evaluate(() => Boolean(bm.import))), "Erstes Tippen fragt nach");
  await p.click('[data-aktion="wi-loeschen"]');
  pruefe(await warteAuf(p, () => bm.import === null && bm.kacheln.size === 0 && !MOCK.biome.w_1), "Import gelöscht");
  await p.click('[data-aktion="schliessen"]'); await schlafen(200);
  pruefe((await text(p, "#karteHinweis")).includes("keine Biome – Welt-Import") && await p.$eval("#karteBiome", (b) => b.hidden),
    "Karte: keine Biome, Knopf weg");

  // ---- Screenshot mit Biom-Popup: ausgegraut, Biome kommen aus dem Welt-Import ----
  await p.evaluate(() => { MOCK.ocr = 1; });   // die simulierte Texterkennung liefert als Nächstes „Cherry Grove“
  await p.setInputFiles("#orteDatei", { name: "biom.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") });
  await warteAuf(p, () => st.importe.length && st.importe.every((e) => !["wartet", "lese"].includes(e.status)));
  const karteBiom = await p.$eval("[data-import]", (k) => ({ aus: k.classList.contains("aus"), text: k.textContent.replace(/\s+/g, " "),
    schalter: Boolean(k.querySelector(".switch")), felder: Boolean(k.querySelector("[data-koord]")) }));
  pruefe(karteBiom.aus && karteBiom.text.includes("Biome kommen aus dem Welt-Import") && !karteBiom.schalter && !karteBiom.felder,
    "Biom aus Screenshot: ausgegraut mit Hinweis");
  pruefe(await p.$eval('[data-aktion="import-speichern"]', (b) => b.disabled), "Nichts zu speichern");
  await p.screenshot({ path: `${DIR}/m10-screenshot-biom.png` });
  await p.evaluate(() => { st.importe = []; alleSchliessen(); });
  pruefe(!(await p.evaluate(() => kategorienManuell("overworld").includes(BIOMES))), "Von Hand: keine Biome");
  await p.close();

  // ======================================================================================
  // Als Datei geöffnet: Demo-Biome ja, Import nein (Worker braucht http)
  // ======================================================================================
  const d = await handy();
  await d.goto(new URL("../companion-prototyp.html?modul=karte", import.meta.url).href);
  await warteAuf(d, () => st.welt && bm.import);
  pruefe(await d.evaluate(() => bm.kacheln.size > 0), "Als Datei: Demo-Biome aus dem Mock");
  await importOeffnen(d);
  await d.setInputFiles("#weltDatei", DATEIEN.korrekt);
  pruefe(await warteAuf(d, () => document.querySelector("#orteSheetInhalt .banner.bad")?.textContent.includes("vom Board kommt (http)")),
    "Als Datei: Hinweis, dass der Import http braucht");
  await d.close();

  // ======================================================================================
  // Live: Board liefert Worker, Dekoder und Bibliothek aus und speichert den Import
  // ======================================================================================
  tmp = mkdtempSync(path.join(tmpdir(), "mcworld-test-"));
  const PORT = 3190, BOARD = `http://127.0.0.1:${PORT}`;
  board = spawn(process.execPath, ["src/server.js"], {
    cwd: path.join(HIER, "../../koordinaten-board/server"),
    env: { ...process.env, PORT: String(PORT), RAUM_PIN: "471100", DATEN_ORDNER: path.join(tmp, "daten") }, stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BOARD}/api/server`)).ok) break; } catch {} await schlafen(200); }
  const token = (await (await fetch(`${BOARD}/api/beitreten`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ pin: "471100", name: "Tim", kontoPin: "9753" }) })).json()).token;
  const welt = (await (await fetch(`${BOARD}/api/orte/welten`, { method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ seed: SEED }) })).json()).welt;
  const beitreten = async (q, name) => {
    await q.goto(`${BOARD}/?pin=471100`);
    await q.waitForSelector("#boardName"); await q.fill("#boardName", name); await q.fill("#boardKontoPin", "2468");
    await q.click('[data-aktion="board-beitreten"]');
    return warteAuf(q, () => !DEMO.enabled && bd.verbindung?.name && st.welt && bm.weltId === st.weltId);
  };
  const max = await handy(), lena = await handy();
  pruefe(await beitreten(max, "Max") && await beitreten(lena, "Lena"), "Max und Lena treten bei");
  pruefe(await lena.evaluate(() => bm.import === null), "Live: noch keine Biome");
  await importOeffnen(max);
  await hochladen(max, DATEIEN.korrekt);
  await warteAuf(max, () => wi.schritt === "bestaetigen");
  await max.click('[data-aktion="wi-lesen"]');
  pruefe(await warteAuf(max, () => wi.schritt === "pruefliste"), "Live: Worker vom Board liest die Welt");
  pruefe(await max.evaluate(() => wi.ergebnis.funde?.info?.schwierigkeit === "normal"), "Live: Board liefert nbt.js und welt-funde.js aus");
  await max.click('[data-aktion="wi-uebernehmen"]');
  pruefe(await warteAuf(max, () => bm.import?.von === "Max"), "Live: Import gespeichert");
  pruefe(await warteAuf(lena, () => bm.import?.weltname === "Unsere Welt" && bm.kacheln.size === 13), "Live: Lena bekommt die Biome sofort");
  const gespeichert = await (await fetch(`${BOARD}/api/welten/${welt.id}/biome`, { headers: { authorization: `Bearer ${token}` } })).json();
  pruefe(gespeichert.kacheln.length === 13 && gespeichert.import.chunks.overworld === 1279, "Live: Board liefert die Kacheln aus");
  await lena.evaluate(() => karte.zentrieren(0, 0)); await schlafen(300);
  await lena.screenshot({ path: `${DIR}/m11-live-lena.png` });
  // Funde live: Max übernimmt die Fundewelt, Lena sieht die Orte sofort
  await importOeffnen(max);
  await hochladen(max, DATEIEN.funde);
  await warteAuf(max, () => wi.schritt === "bestaetigen"); await max.click('[data-aktion="wi-lesen"]');
  pruefe(await warteAuf(max, () => wi.schritt === "pruefliste" && wi.funde?.gruppen?.length === 13), "Live: Funde eingeordnet");
  await max.click('[data-aktion="wi-uebernehmen"]');
  pruefe(await warteAuf(max, () => bm.import?.dateiname === "Funde.zip"), "Live: Funde übernommen");
  pruefe(await warteAuf(lena, () => st.instanzen.filter((i) => i.quelle === "welt").length === 9), "Live: Lena bekommt die Orte aus dem Import sofort");
  const kopf = { headers: { authorization: `Bearer ${token}` } };
  const imBoard = {
    orte: (await (await fetch(`${BOARD}/api/orte/welten/${welt.id}`, kopf)).json()).instanzen.filter((i) => i.quelle === "welt" && i.von === "Max").length,
    portale: (await (await fetch(`${BOARD}/api/portale/welten/${welt.id}`, kopf)).json()).verbindungen.map((v) => v.name),
    sammel: Object.keys((await (await fetch(`${BOARD}/api/sammelobjekte/welten/${welt.id}`, kopf)).json()).status).sort(),
    banner: (await (await fetch(`${BOARD}/api/banner`, kopf)).json()).liste.length,
    info: (await (await fetch(`${BOARD}/api/welten/${welt.id}/biome`, kopf)).json()).import.info?.schwierigkeit,
  };
  pruefe(imBoard.orte === 9 && imBoard.portale.join() === "Portal bei X 100 · Z 200" && imBoard.sammel.join() === "netherite,sentry,spire,wild"
    && imBoard.banner === 2 && imBoard.info === "hard", `Live: Board hat Orte, Verbindung, Vorlagen, Banner und Welt-Info (${JSON.stringify(imBoard)})`);
  // Lena löscht, Max sieht es
  await importOeffnen(lena);
  await lena.click('[data-aktion="wi-loeschen"]'); await lena.click('[data-aktion="wi-loeschen"]');
  pruefe(await warteAuf(max, () => bm.import === null && bm.kacheln.size === 0), "Live: Löschen kommt bei Max an");
} catch (f) {
  pruefe(false, `Abbruch: ${f.stack || f}`);
} finally {
  pruefe(fehler.length === 0, `keine Fehler in der Konsole${fehler.length ? `: ${fehler.join(" | ")}` : ""}`);
  await browser.close();
  await server?.schliessen();
  if (board) { board.kill("SIGTERM"); await new Promise((r) => board.once("exit", r)); }
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  rmSync(ORDNER, { recursive: true, force: true });
}
