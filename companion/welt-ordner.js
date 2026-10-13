/* ============================================================================
   welt-ordner.js  ·  Welt-Import aus dem Ordner statt aus der ZIP
   ----------------------------------------------------------------------------
   Am iPhone (Safari ab iOS 18.4) lässt sich der Weltordner aus der Dateien-App
   direkt wählen (<input webkitdirectory>) oder auf die Seite ziehen. Dieses Modul
   sammelt die Dateien, findet darin die Welt(en) und behält nur, was der Import
   braucht: level.dat, levelname.txt und die LevelDB in db/ (CURRENT, MANIFEST,
   .ldb, .log). Paket-Ordner, world_icon.jpeg, level.dat_old, LOCK und LOG bleiben
   liegen. Ohne Abhängigkeiten: Die Seite lädt es per import(), biom-welt.js im
   Worker nutzt ordnerAlsEintraege().

   Eintrag einer Ordner-Liste: { pfad, datei } – pfad relativ zum gewählten Ordner
   mit „/“ (wie webkitRelativePath), datei ein File.
   ========================================================================== */

/** Braucht der Import diese Datei? pfad relativ zum Weltordner */
export const gebraucht = (pfad) =>
  pfad === "level.dat" || pfad === "levelname.txt" || /^db\/(CURRENT|MANIFEST-\d+|\d+\.(ldb|log))$/.test(pfad);

/** FileList aus <input type="file" webkitdirectory> → [{ pfad, datei }] */
export const ausAuswahl = (dateien) =>
  [...dateien].map((datei) => ({ pfad: datei.webkitRelativePath || datei.name, datei }));

/** Ordner aus einer Ablage (Ziehen und Loslassen) rekursiv lesen. readEntries liefert in Safari
    höchstens 100 Einträge je Aufruf, darum bis zur leeren Antwort weiterlesen. */
async function eintragLesen(eintrag, pfad, ergebnis) {
  if (eintrag.isFile) {
    const datei = await new Promise((ok, fehl) => eintrag.file(ok, fehl));
    ergebnis.push({ pfad: pfad + eintrag.name, datei });
    return;
  }
  if (!eintrag.isDirectory) return;
  const leser = eintrag.createReader();
  for (;;) {
    const stapel = await new Promise((ok, fehl) => leser.readEntries(ok, fehl));
    if (!stapel.length) break;
    for (const kind of stapel) await eintragLesen(kind, `${pfad}${eintrag.name}/`, ergebnis);
  }
}

/** Ablage → [{ pfad, datei }]; Ordner rekursiv, einzelne Dateien direkt. Die Einträge sammelt die Seite
    sofort im drop-Ereignis ein ({ eintraege:[{ eintrag:webkitGetAsEntry(), datei:getAsFile() }], dateien }),
    danach gibt der Browser sie nicht mehr heraus. Ohne Eintrag (webkitGetAsEntry fehlt oder liefert null) zählt die Datei selbst, z. B. eine ZIP. */
export async function ausAblage({ eintraege = [], dateien = [] }) {
  const ergebnis = [];
  for (const { eintrag, datei } of eintraege) {
    if (eintrag) await eintragLesen(eintrag, "", ergebnis);
    else if (datei) ergebnis.push({ pfad: datei.name, datei });
  }
  if (!eintraege.length) for (const datei of dateien) ergebnis.push({ pfad: datei.name, datei });
  return ergebnis;
}

const ordnerVon = (pfad) => (pfad.includes("/") ? pfad.slice(0, pfad.lastIndexOf("/") + 1) : "");
const letzterName = (ordner) => ordner.replace(/\/$/, "").split("/").pop() || "";

/**
 * Alle gesammelten Dateien → die Welten darin. Eine Welt ist ein Ordner mit level.dat und
 * db/CURRENT. Je Welt bleiben nur die gebrauchten Dateien, ihr pfad ist dann relativ zum Weltordner.
 * → [{ ordner, ordnername, name, dateien, alle:{ anzahl, bytes }, behalten:{ anzahl, bytes } }]
 *   name aus levelname.txt (sonst der Ordnername), sortiert nach Name.
 */
export async function weltenFinden(liste) {
  const pfade = new Set(liste.map((e) => e.pfad));
  const wurzeln = [...pfade].filter((p) => p.endsWith("level.dat") && (p === "level.dat" || p.endsWith("/level.dat")))
    .map(ordnerVon).filter((o) => pfade.has(`${o}db/CURRENT`));
  const welten = [];
  for (const ordner of wurzeln) {
    // Dateien einer tiefer liegenden Welt gehören nicht dazu (z. B. eine Welt im Ordner einer anderen)
    const andere = wurzeln.filter((w) => w !== ordner && w.startsWith(ordner));
    const imOrdner = liste.filter((e) => e.pfad.startsWith(ordner) && !andere.some((w) => e.pfad.startsWith(w)));
    const dateien = imOrdner.map((e) => ({ pfad: e.pfad.slice(ordner.length), datei: e.datei })).filter((e) => gebraucht(e.pfad));
    const summe = (l) => ({ anzahl: l.length, bytes: l.reduce((n, e) => n + (e.datei.size || 0), 0) });
    const levelname = dateien.find((e) => e.pfad === "levelname.txt");
    const name = levelname ? (await levelname.datei.text()).trim() : "";
    const ordnername = letzterName(ordner);
    welten.push({ ordner, ordnername, name: name || ordnername || "Welt", dateien, alle: summe(imOrdner), behalten: summe(dateien) });
  }
  return welten.sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/** Ordner-Liste → Einträge wie aus der ZIP (zip.js), damit biom-welt.js beide gleich liest */
export const ordnerAlsEintraege = (liste) => liste.map(({ pfad, datei }) => ({
  filename: pfad,
  directory: false,
  getData: async () => new Uint8Array(await datei.arrayBuffer()),
}));
