// Alle Tests der Companion und des Dashboards nacheinander – anders als eine Kette mit && läuft es nach einem
// Fehler weiter und meldet am Ende, welche Dateien fehlgeschlagen sind (Exit-Code 1, wenn eine dabei ist).
// Aufruf: npm test · nur einzelne: node alle.mjs karte board (Teil des Dateinamens genügt)
// Jede Datei hat ihren eigenen Port (3184–3200), sie stören sich also auch nicht, wenn man zwei parallel startet.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HIER = fileURLToPath(new URL(".", import.meta.url));
// node --test: reine Logik ohne Browser; danach die Playwright-Tests
const LAEUFE = [
  ["node", ["--test", "biom-dekoder.test.mjs", "welt-funde.test.mjs"], "biom-dekoder + welt-funde"],
  ...["banner", "portale", "sammelobjekte", "kennbloecke", "karte", "board", "anmeldung", "dashboard-login", "live",
    "getrennt", "netlify", "anzeigeschema", "ruestung", "karte-mcworld", "anzeige-link", "widgets", "widgets-board",
    "widgets-anordnen"].map((n) => ["node", [`${n}.test.mjs`], n]),
];

const wahl = process.argv.slice(2);
const laeufe = wahl.length ? LAEUFE.filter(([, , name]) => wahl.some((w) => name.includes(w))) : LAEUFE;

const ergebnisse = [];
for (const [befehl, argumente, name] of laeufe) {
  console.log(`\n=== ${name}`);
  const start = Date.now();
  const code = await new Promise((fertig) => {
    const p = spawn(befehl, argumente, { cwd: HIER, stdio: "inherit" });
    p.on("exit", (c, signal) => fertig(c ?? (signal ? 1 : 0)));
    p.on("error", () => fertig(1));
  });
  ergebnisse.push({ name, ok: code === 0, sekunden: Math.round((Date.now() - start) / 1000) });
}

console.log("\n=== Zusammenfassung");
for (const e of ergebnisse) console.log(`${e.ok ? "OK  " : "FEHL"} ${e.name.padEnd(28)} ${String(e.sekunden).padStart(4)} s`);
const fehl = ergebnisse.filter((e) => !e.ok);
console.log(fehl.length ? `\n${fehl.length} von ${ergebnisse.length} fehlgeschlagen: ${fehl.map((e) => e.name).join(", ")}`
  : `\nAlle ${ergebnisse.length} bestanden`);
process.exitCode = fehl.length ? 1 : 0;
