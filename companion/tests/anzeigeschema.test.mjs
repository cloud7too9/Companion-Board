// Anzeigeschema: Jeder Inhalt der Companion lässt sich aufs Board werfen.
// Für alle DEMO-Inhalte wird die Karte gebaut und mit der Prüfung des Boards (zeigen.js)
// kontrolliert; je Schema landet eine Karte auf einer echten Anzeige (Screenshot).
// Die Schemas werden in der DEMO-Companion gebaut und mit zeigen.js geprüft; „Aufs Board“ selbst läuft live vom Board (Bauplan „Sitzung“, S2).
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdirSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { companionAusliefern, threeUmleiten, CHROMIUM_OPTIONEN, anzeigeLinkQuery } from "./hilfen.mjs";

const HIER = fileURLToPath(new URL(".", import.meta.url));
const DIR = path.join(HIER, "bilder");
mkdirSync(DIR, { recursive: true });
const BOARD_ORDNER = path.join(HIER, "../../koordinaten-board");
const { kartePruefen } = await import(pathToFileURL(path.join(BOARD_ORDNER, "server/src/zeigen.js")).href);
const TMP = mkdtempSync(path.join(tmpdir(), "schema-test-"));
const PORT = 3194, PIN = "471100", BOARD = `http://127.0.0.1:${PORT}`;
if (!existsSync(path.join(BOARD_ORDNER, "client/dist/index.html"))) {
  console.log("FEHL Board-Client nicht gebaut: npm --prefix ../../koordinaten-board run build");
  process.exit(1);
}
const pruefe = (ok, text) => { console.log((ok ? "OK   " : "FEHL ") + text); if (!ok) process.exitCode = 1; };
const schlafen = (ms) => new Promise((r) => setTimeout(r, ms));

const board = spawn(process.execPath, ["src/server.js"], {
  cwd: path.join(BOARD_ORDNER, "server"),
  env: { ...process.env, PORT: String(PORT), RAUM_PIN: PIN, DATEN_ORDNER: path.join(TMP, "daten"), ERLAUBTE_URSPRUENGE: "http://127.0.0.1:3193" },
  stdio: "ignore",
});
const companion = await companionAusliefern(3193);
const browser = await chromium.launch(CHROMIUM_OPTIONEN);
try {
  for (let i = 0; i < 60 && !(await fetch(`${BOARD}/api/server`).then((r) => r.ok, () => false)); i++) await schlafen(200);
  const { token } = await (await fetch(`${BOARD}/api/beitreten`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ pin: PIN, name: "Max", kontoPin: "2468" }) })).json();

  // Companion im DEMO-Modus (über http), mit dem echten Board verbunden
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const fehler = [];
  p.on("pageerror", (e) => fehler.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") fehler.push(m.text()); });
  await threeUmleiten(p);
  await p.goto(`${companion.adresse}/companion-prototyp.html?demo=1`);
  await p.waitForFunction(() => typeof st !== "undefined" && st.weltId && pt.liste.length);
  await p.evaluate(() => Promise.all([bannerLaden(), ruestungLaden()]));
  await p.evaluate(([adresse, t]) => { bd.verbindung = { adresse, token: t, name: "Max" }; boardVerbinden(); }, [BOARD, token]);
  await p.waitForFunction(() => bd.status === "verbunden");

  // ---- Alle Inhalte → Karten → Prüfung des Boards -----------------------------------
  const karten = await p.evaluate(async () => {
    const ids = { ort: st.instanzen.map((i) => i.id), sammel: SAMMELOBJEKTE.map((o) => o.id), sammelstand: [""],
                  portal: pt.liste.map((v) => v.id), banner: bn.liste.map((b) => b.id), ruestung: rs.sets.map((x) => x.id),
                  sammelliste: [""], portalliste: [""], welt: [""] };
    const liste = [];   // karte() darf async sein – nacheinander bauen
    for (const [art, s] of Object.entries(BOARD_KARTEN)) {
      const k = [];
      for (const id of ids[art]) k.push(await s.karte(boardKontext(), id));
      liste.push([art, { titel: s.titel, karten: k }]);
    }
    return Object.fromEntries(liste);
  });
  pruefe(Object.keys(karten).join(",") === "ort,sammel,sammelstand,portal,banner,ruestung,sammelliste,portalliste,welt", `Anzeigeschemas: ${Object.values(karten).map((k) => k.titel).join(", ")}`);
  for (const [art, { karten: liste }] of Object.entries(karten)) {
    const fehlerhaft = liste.map((k) => [k, kartePruefen(k)]).filter(([k, r]) => !k || r.fehler);
    pruefe(liste.length > 0 && fehlerhaft.length === 0,
      `${art}: ${liste.length} Karten vom Board angenommen${fehlerhaft.length ? " – " + fehlerhaft.map(([k, r]) => `${k?.titel}: ${r.fehler}`).join("; ") : ""}`);
  }
  const rippen = karten.sammel.karten.find((k) => k.quelle === "sammel:rib");
  pruefe(rippen.typ === "Nether Fortress" && rippen.dimension === "nether" && rippen.bloecke.some((b) => b.art === "koordinaten"), "Sammelobjekt: Kennblock-Typ, Dimension, nächster Fundort");
  const banner = karten.banner.karten[0];
  pruefe(banner.bloecke[0].art === "bild" && banner.bloecke[0].daten.startsWith("data:image/png;base64,") && banner.bloecke[0].pixelig, "Banner: Vorschau als PNG-Bild (pixelig)");
  const portal = karten.portal.karten[0];
  pruefe(portal.bloecke.filter((b) => b.art === "koordinaten").map((b) => b.dimension).join() === "oberwelt,nether", "Portal: beide Portale mit Dimension");
  pruefe(karten.sammelstand.karten[0].bloecke[0].zeilen[0].wert === "5 von 18", "Sammel-Stand: 5 von 18 gefunden");
  pruefe(karten.ruestung.karten.every((k) => k.bloecke[0].art === "bild" && k.bloecke[1].zeilen.length >= 3), "Rüstung: jedes Set mit Figur-Bild und Zeilen je Teil");

  // ---- Live: „Aufs Board“ legt jeden Inhalt als Sitzungs-Widget ab (Bauplan „Sitzung“, S2) ----
  // Das Board baut die Karte selbst, also müssen die Inhalte auf dem Board liegen: Max legt sie per API an,
  // dann läuft die Companion live vom Board. Bis S4 zeigt auch die alte Anzeige die Karte groß (Brücke).
  const api = (m, pfad, body) => fetch(`${BOARD}/api${pfad}`, { method: m, headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body) }).then((r) => r.json());
  const welt = (await api("POST", "/orte/welten", { seed: "6889192652397090698" })).welt;
  await api("POST", "/orte/instanzen", { dimensionId: `d_${welt.id}_nether`, kategorie: "Nether Fortress", variante: null, x: -200, y: 70, z: 96, quelle: "manuell" });
  await api("PUT", `/sammelobjekte/welten/${welt.id}/rib`, { gefunden: true });
  await api("POST", `/portale/welten/${welt.id}`, { name: "Eisenfarm", oberwelt: { x: 800, y: 64, z: 80 }, nether: { x: 100, y: 64, z: 10 } });
  await api("POST", "/banner", { name: "Kreuz", basis: "white", ebenen: [{ muster: "cross", farbe: "red" }] });
  await api("POST", "/ruestung", { name: "Umbreon", teile: { chestplate: { ruestung: "diamond", muster: "silence", material: "amethyst" } } });

  const live = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  live.on("pageerror", (e) => fehler.push(e.message));
  live.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) fehler.push(m.text()); });
  await live.goto(`${BOARD}/?pin=${PIN}`);
  await live.waitForSelector("#boardName");
  await live.fill("#boardName", "Max"); await live.fill("#boardKontoPin", "2468");
  await live.click('[data-aktion="board-beitreten"]');
  pruefe(await live.waitForFunction(() => typeof bd !== "undefined" && bd.status === "verbunden" && st.weltId, null, { timeout: 15000 }).then(() => true, () => false), "Companion live vom Board, als Max verbunden");
  await live.evaluate(() => Promise.all([bannerLaden(), ruestungLaden(), portaleLaden(), samLaden()]));
  await live.waitForFunction(() => bn.liste.length && rs.sets.length && pt.liste.length);

  const anzeige = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const linkQuery = await anzeigeLinkQuery(path.join(TMP, "daten"));
  await anzeige.goto(`${BOARD}/anzeige${linkQuery}`);
  await anzeige.waitForSelector(".anzeige");
  const dash = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await dash.goto(`${BOARD}/dashboard${linkQuery}`);
  const warteAuf = async (seite, fn, arg, ms = 12000) => { try { await seite.waitForFunction(fn, arg, { timeout: ms }); return true; } catch { return false; } };
  const zeigen = async (oeffnen, name, typ) => {
    await live.evaluate(oeffnen); await live.waitForTimeout(350);
    const knopf = await live.$("#orteSheetInhalt .board-zeigen");
    pruefe(knopf !== null && (await knopf.textContent()).includes("Aufs Board"), `${name}: Knopf „Aufs Board“`);
    await knopf.click();
    pruefe(await warteAuf(live, () => document.querySelector("#orteSheetInhalt .board-zeigen")?.classList.contains("aktiv")), `${name}: Knopf zeigt „Liegt auf dem Board“`);
    pruefe(await warteAuf(dash, (t) => Boolean(document.querySelector(`[data-typ="${t}"] [data-testid="karte"]`)), typ), `${name}: Sitzungs-Widget ${typ} auf dem Dashboard`);
    await anzeige.waitForSelector(".g-karte h2"); await anzeige.waitForTimeout(700);
  };
  await live.evaluate(() => modulWechseln("sammelobjekte"));
  await zeigen(() => samDetailOeffnen("rib"), "Sammelobjekt", "sammelobjekte.einzelobjekt");
  pruefe(await anzeige.$eval(".g-karte h2", (e) => e.textContent) === "Rippenzier", "Anzeige: Rippenzier");
  pruefe(await anzeige.$eval(".g-kennblock img", (i) => i.getAttribute("src").endsWith("fortress.png") && i.naturalWidth > 0), "Anzeige: Kennblock der Netherfestung");
  pruefe(await warteAuf(dash, () => document.querySelector('[data-typ="sammelobjekte.einzelobjekt"] img.kennblock')?.naturalWidth > 0), "Dashboard: Kennblock der Netherfestung im Widget");
  await anzeige.screenshot({ path: `${DIR}/a1-sammelobjekt.png` });

  await live.click('#orteSheetInhalt [data-aktion="schliessen"]'); await live.waitForTimeout(250);
  const fuss = await live.$("#samFuss .sam-board");
  pruefe(fuss !== null, "Sammelobjekte: Bottom-Bar „Aufs Board“ für den Fortschritt");
  await fuss.click();
  pruefe(await warteAuf(anzeige, () => document.querySelector(".g-karte h2")?.textContent === "Rüstungsbesätze"), "Anzeige: Sammel-Fortschritt");
  await anzeige.waitForTimeout(700);
  pruefe(await warteAuf(live, () => document.querySelector("#samFuss .sam-board")?.classList.contains("aktiv")), "Bottom-Bar zeigt „Liegt auf dem Board“");
  pruefe(await warteAuf(dash, () => Boolean(document.querySelector('[data-typ="sammelobjekte.status"]'))), "Dashboard: Sammel-Fortschritt als Sitzungs-Widget");
  await anzeige.screenshot({ path: `${DIR}/a2-sammelstand.png` });
  await live.screenshot({ path: `${DIR}/a2b-sammel-fuss.png` });

  await live.evaluate(() => modulWechseln("portale"));
  await zeigen(() => portalDetailOeffnen(pt.liste.find((v) => v.name === "Eisenfarm").id), "Portal-Verbindung", "portale.verbindung");
  pruefe(await anzeige.$eval(".g-karte", (e) => e.classList.contains("thema-nether") && e.querySelectorAll(".g-koord").length === 2), "Anzeige: Portal mit zwei Koordinaten im Nether-Theme");
  await anzeige.screenshot({ path: `${DIR}/a3-portal.png` });

  await live.evaluate(() => modulWechseln("banner"));
  await zeigen(() => bannerDetailOeffnen(bn.liste[0].id), "Banner", "banner.banner");
  pruefe(await anzeige.$eval(".g-bild img", (i) => i.naturalWidth === 20 && i.naturalHeight === 40 && getComputedStyle(i).imageRendering === "pixelated"), "Anzeige: Banner 20×40 pixelgenau vergrößert");
  await anzeige.screenshot({ path: `${DIR}/a4-banner.png` });

  await live.evaluate(() => modulWechseln("ruestung"));
  await zeigen(() => ruestungDetailOeffnen(rs.sets[0].id), "Rüstungs-Set", "ruestung.set");
  pruefe(await warteAuf(anzeige, () => document.querySelector(".g-karte h2")?.textContent === "Umbreon"), "Anzeige: Rüstungs-Set Umbreon");
  // Die Karte kommt vom Server: Teile als Zeilen, die 3D-Figur fehlt dort vorerst (entschieden 13.10.2026)
  pruefe(await anzeige.$eval(".g-karte", (e) => e.querySelectorAll(".g-zeile").length >= 1), "Anzeige: Rüstungs-Set mit Zeilen je Teil (Figur kommt vom Server noch nicht)");
  await anzeige.screenshot({ path: `${DIR}/a5-ruestung.png` });
  await dash.screenshot({ path: `${DIR}/a6-dashboard-sitzung.png` });

  // Board-Sheet listet die Sitzung, „Alle wegnehmen“ räumt sie
  await live.click('#orteSheetInhalt [data-aktion="schliessen"]'); await live.waitForTimeout(250);
  await live.click("#burgerBtn"); await live.waitForTimeout(300); await live.click("#boardBtn"); await live.waitForTimeout(400);
  const liste = await live.$$eval(".board-gezeigt .card-title", (l) => l.map((e) => e.textContent.trim()));
  pruefe(liste.length === 5 && liste.includes("Rippenzier") && liste.includes("Eisenfarm") && liste.includes("Umbreon"), `Board-Sheet: 5 Sitzungs-Widgets (${liste.join(", ")})`);
  await live.screenshot({ path: `${DIR}/a7-sheet-sitzung.png` });
  await live.click('[data-aktion="board-alle-wegnehmen"]');
  pruefe(await warteAuf(dash, () => !document.querySelector('[data-testid="von"]')), "Alle wegnehmen → keine Sitzungs-Widgets mehr auf dem Dashboard");
  pruefe(await warteAuf(live, () => document.getElementById("orteSheetInhalt")?.textContent.includes("Gerade liegt nichts")), "Board-Sheet: wieder leer");

  pruefe(fehler.length === 0, `keine Fehler in der Konsole${fehler.length ? ": " + fehler.join(" | ") : ""}`);
} catch (e) {
  pruefe(false, "Abbruch: " + e.message);
} finally {
  await browser.close();
  await companion.schliessen();
  board.kill("SIGTERM");
  await new Promise((r) => board.once("exit", r));
  rmSync(TMP, { recursive: true, force: true });
}
