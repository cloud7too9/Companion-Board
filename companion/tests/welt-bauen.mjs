// Baut synthetische Bedrock-Welten (.mcworld) für die Tests des Welt-Imports – nur mit Node-Bordmitteln.
// Das Format schreibt diese Datei selbst: level.dat (NBT, Little Endian), LevelDB-Dateien (.ldb mit
// komprimierten Blöcken, .log mit fragmentierten Records, MANIFEST) und das ZIP drumherum. Echte Welten
// von Max ersetzen das nicht: ob das Format zu Mojangs Dateien passt, zeigt erst tools/welt-pruefen.mjs.
import { deflateRawSync, crc32 } from "node:zlib";

// ---------- Bytes ----------

class Puffer {
  teile = [];
  laenge = 0;
  bytes(b) { const u = b instanceof Uint8Array ? b : Uint8Array.from(b); this.teile.push(u); this.laenge += u.length; return this; }
  u8(v) { return this.bytes([v & 0xff]); }
  u16(v) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); return this.bytes(b); }
  i16(v) { const b = new Uint8Array(2); new DataView(b.buffer).setInt16(0, v, true); return this.bytes(b); }
  i32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v, true); return this.bytes(b); }
  u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); return this.bytes(b); }
  i64(v) { const b = new Uint8Array(8); new DataView(b.buffer).setBigInt64(0, BigInt(v), true); return this.bytes(b); }
  u64(v) { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(v), true); return this.bytes(b); }
  varint(v) { const b = []; let n = v; do { let x = n & 0x7f; n = Math.floor(n / 128); if (n) x |= 0x80; b.push(x); } while (n); return this.bytes(b); }
  text(s) { return this.bytes(new TextEncoder().encode(s)); }
  fertig() { const out = new Uint8Array(this.laenge); let o = 0; for (const t of this.teile) { out.set(t, o); o += t.length; } return out; }
}
const vergleichen = (a, b) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]; return a.length - b.length; };

// ---------- Chunk-Schlüssel und Data3D ----------

const DIM_NR = { overworld: null, nether: 1, end: 2 };
export function chunkSchluessel(cx, cz, dim = "overworld", tag = 0x2b) {
  const p = new Puffer().i32(cx).i32(cz);
  if (DIM_NR[dim]) p.i32(DIM_NR[dim]);
  return p.u8(tag).fertig();
}

const BITS = [1, 2, 3, 4, 5, 6, 8, 16];   // Breiten, die Bedrock schreibt
/** Eine Biom-Sektion 16×16×16; biom(x, y, z) liefert die ID. Kopf: (bits << 1) | 1 */
function sektionBauen(p, biom) {
  const werte = new Int32Array(4096);
  const palette = [];
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < 16; y++) {
    const id = biom(x, y, z);
    if (!palette.includes(id)) palette.push(id);
    werte[(x << 8) | (z << 4) | y] = palette.indexOf(id);
  }
  if (palette.length === 1) { p.u8(0x01).i32(palette[0]); return; }
  const bits = BITS.find((b) => (1 << b) >= palette.length);
  const proWort = Math.floor(32 / bits), woerter = new Uint32Array(Math.ceil(4096 / proWort));
  for (let i = 0; i < 4096; i++) woerter[Math.floor(i / proWort)] |= werte[i] << ((i % proWort) * bits);
  p.u8((bits << 1) | 1);
  for (const w of woerter) p.u32(w);
  p.i32(palette.length);
  for (const id of palette) p.i32(id);
}

/**
 * Data3D-Wert: hoehe(x, z) = Wert der Höhenkarte (relativ zu −64, erste Luft),
 * biom(x, y, z) mit absolutem y. Gleiche Sektionen hintereinander werden „0xFF“.
 */
export function data3dBauen({ hoehe = () => 128, biom, dim = "overworld", sektionen = 25 }) {
  const p = new Puffer();
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) p.i16(hoehe(x, z));   // Index z*16+x
  const minY = dim === "overworld" ? -64 : 0;
  let vorher = null;
  for (let s = 0; s < sektionen; s++) {
    const f = (x, y, z) => biom(x, minY + s * 16 + y, z);
    const fingerabdruck = [];
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < 16; y++) fingerabdruck.push(f(x, y, z));
    const text = fingerabdruck.join(",");
    if (text === vorher) { p.u8(0xff); continue; }
    sektionBauen(p, f);
    vorher = text;
  }
  return p.fertig();
}

// ---------- NBT schreiben (Little Endian) ----------

/** Werte mit Typ: nbt.byte(1), nbt.liste(nbt.STRING, ["a"]) … Ohne Hülle gilt: Text → String,
    ganze Zahl → Int, sonst Zahl → Float, BigInt → Long, Array → Liste (Typ vom ersten Wert), Objekt → Compound */
export const nbt = {
  BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTES: 7, STRING: 8, LISTE: 9, COMPOUND: 10, INTS: 11, LONGS: 12,
  byte: (v) => ({ t: 1, v }), short: (v) => ({ t: 2, v }), int: (v) => ({ t: 3, v }), long: (v) => ({ t: 4, v: BigInt(v) }),
  float: (v) => ({ t: 5, v }), double: (v) => ({ t: 6, v }), bytes: (v) => ({ t: 7, v }), ints: (v) => ({ t: 11, v }), longs: (v) => ({ t: 12, v }),
  liste: (elem, v) => ({ t: 9, elem, v }),
};
const nbtTyp = (w) => (w && typeof w === "object" && "t" in w && "v" in w ? w.t
  : typeof w === "string" ? 8 : typeof w === "bigint" ? 4 : typeof w === "number" ? (Number.isInteger(w) ? 3 : 5)
  : Array.isArray(w) ? 9 : 10);
const nbtRoh = (w) => (w && typeof w === "object" && "t" in w && "v" in w ? w.v : w);
function nbtWert(p, typ, w) {
  const v = nbtRoh(w);
  switch (typ) {
    case 1: return p.u8(v);
    case 2: return p.i16(v);
    case 3: return p.i32(v);
    case 4: return p.i64(v);
    case 5: { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, v, true); return p.bytes(b); }
    case 6: { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v, true); return p.bytes(b); }
    case 7: return p.i32(v.length).bytes(v);
    case 8: { const t = new TextEncoder().encode(v); return p.u16(t.length).bytes(t); }
    case 9: {
      const elem = w?.elem ?? (v.length ? nbtTyp(v[0]) : 0);
      p.u8(elem).i32(v.length);
      for (const x of v) nbtWert(p, elem, x);
      return p;
    }
    case 10: {
      for (const [name, x] of Object.entries(v)) { const t = nbtTyp(x); nbtWert(p.u8(t), 8, name); nbtWert(p, t, x); }
      return p.u8(0);
    }
    case 11: p.i32(v.length); for (const x of v) p.i32(x); return p;
    case 12: p.i32(v.length); for (const x of v) p.i64(x); return p;
    default: throw new Error(`NBT-Typ ${typ}`);
  }
}
/** Wurzel-Compound(s) → Bytes; mehrere hintereinander wie bei Block-Entities */
export function nbtBauen(...wurzeln) {
  const p = new Puffer();
  for (const w of wurzeln) nbtWert(nbtWert(p.u8(10), 8, ""), 10, w);
  return p.fertig();
}

// ---------- level.dat ----------

/** level.dat mit RandomSeed, LevelName, lastOpenedWithVersion – und Füllstoff aller NBT-Typen zum Überspringen.
    zusatz: weitere Felder (nbt-Werte), z. B. GameType, Time, LastPlayed – ersetzen gleichnamige Füllfelder */
export function levelDatBauen({ seed, name = "Testwelt", version = [1, 26, 50, 20, 0], zusatz = {} }) {
  const n = new Puffer();
  const kopf = (typ, name) => n.u8(typ).u16(new TextEncoder().encode(name).length).text(name);
  n.u8(10).u16(0);                                                      // Wurzel-Compound, leerer Name
  if (!("Difficulty" in zusatz)) kopf(1, "Difficulty").u8(2);
  kopf(2, "Kurz").i16(-3);
  kopf(5, "Zufall").u32(0x3f800000);
  kopf(6, "Doppelt").u64(0n);
  kopf(7, "Bytes").i32(3).bytes([1, 2, 3]);
  kopf(9, "Leere Liste").u8(0).i32(0);
  kopf(9, "Liste Compound").u8(10).i32(2).u8(8).u16(1).text("a").u16(2).text("xy").u8(0).u8(0);
  kopf(10, "abilities"); kopf(1, "flying").u8(0); kopf(9, "tief").u8(9).i32(1).u8(3).i32(1).i32(7); n.u8(0);
  kopf(11, "Ints").i32(2).i32(1).i32(2);
  kopf(12, "Longs").i32(1).i64(9);
  kopf(4, "RandomSeed").i64(BigInt(seed));
  kopf(8, "LevelName").u16(new TextEncoder().encode(name).length).text(name);
  kopf(9, "lastOpenedWithVersion").u8(3).i32(version.length);
  for (const v of version) n.i32(v);
  if (!("SpawnX" in zusatz)) kopf(3, "SpawnX").i32(0);
  for (const [name, w] of Object.entries(zusatz)) { const t = nbtTyp(w); kopf(t, name); nbtWert(n, t, w); }
  n.u8(0);
  const daten = n.fertig();
  return new Puffer().i32(10).i32(daten.length).bytes(daten).fertig();
}

// ---------- LevelDB ----------

const MAGIC = [0x57, 0xfb, 0x80, 0x8b, 0x24, 0x75, 0x47, 0xdb];
/** Block: Einträge ohne gemeinsamen Präfix + Restarts, komprimiert (raw deflate wie Mojang) */
function blockBauen(eintraege) {
  const p = new Puffer();
  for (const [schluessel, wert] of eintraege) p.varint(0).varint(schluessel.length).varint(wert.length).bytes(schluessel).bytes(wert);
  p.u32(0).u32(1);   // ein Restart bei 0
  return deflateRawSync(p.fertig());
}
/** Interner Schlüssel = Benutzerschlüssel + 8 Byte (Sequenz << 8 | Typ) */
const intern = (schluessel, seq, typ) => new Puffer().bytes(schluessel).u64((BigInt(seq) << 8n) | BigInt(typ)).fertig();

/** .ldb aus [[schluessel, wert | null (Löschmarke)]] */
export function ldbBauen(eintraege, { seq = 1, blockGroesse = 4096 } = {}) {
  const sortiert = [...eintraege].sort((a, b) => vergleichen(a[0], b[0]));
  const datei = new Puffer(), index = [];
  let block = [], groesse = 0;
  const schliessen = () => {
    if (!block.length) return;
    const daten = blockBauen(block);
    index.push([block.at(-1)[0], datei.laenge, daten.length]);
    datei.bytes(daten).u8(4).u32(0);   // Kompressionstyp + CRC (wird nicht geprüft)
    block = []; groesse = 0;
  };
  for (const [s, w] of sortiert) {
    block.push([intern(s, seq, w ? 1 : 0), w ?? new Uint8Array(0)]);
    groesse += s.length + (w?.length ?? 0);
    if (groesse >= blockGroesse) schliessen();
  }
  schliessen();
  const meta = blockBauen([]), metaOffset = datei.laenge;
  datei.bytes(meta).u8(4).u32(0);
  const indexBlock = blockBauen(index.map(([s, o, l]) => [s, new Puffer().varint(o).varint(l).fertig()]));
  const indexOffset = datei.laenge;
  datei.bytes(indexBlock).u8(4).u32(0);
  const fuss = new Puffer().varint(metaOffset).varint(meta.length).varint(indexOffset).varint(indexBlock.length).fertig();
  datei.bytes(fuss).bytes(new Uint8Array(40 - fuss.length)).bytes(MAGIC);
  return datei.fertig();
}

/** Log-Datei (auch MANIFEST): Records in 32-KB-Blöcken, lange Records in FIRST/MIDDLE/LAST geteilt */
function logRecords(nutzlasten) {
  const p = new Puffer();
  for (const last of nutzlasten) {
    let rest = last, erster = true;
    while (true) {
      let frei = 32768 - (p.laenge % 32768);
      if (frei < 7) { p.bytes(new Uint8Array(frei)); frei = 32768; }
      const teil = rest.subarray(0, frei - 7);
      rest = rest.subarray(teil.length);
      const typ = erster && !rest.length ? 1 : erster ? 2 : rest.length ? 3 : 4;
      p.u32(0).u16(teil.length).u8(typ).bytes(teil);
      erster = false;
      if (!rest.length) break;
    }
  }
  return p.fertig();
}
/** .log aus Batches [{ seq, eintraege:[[schluessel, wert | null]] }] */
export function logBauen(batches) {
  return logRecords(batches.map(({ seq, eintraege }) => {
    const p = new Puffer().u64(seq).u32(eintraege.length);
    for (const [s, w] of eintraege) {
      p.u8(w ? 1 : 0).varint(s.length).bytes(s);
      if (w) p.varint(w.length).bytes(w);
    }
    return p.fertig();
  }));
}
/** MANIFEST: neue Dateien [{ level, nr, groesse }] und gelöschte [{ level, nr }] */
export function manifestBauen({ neu = [], geloescht = [], logNr = 1, naechste = 100, seq = 100 }) {
  const p = new Puffer();
  const cmp = new TextEncoder().encode("leveldb.BytewiseComparator");
  p.varint(1).varint(cmp.length).bytes(cmp).varint(2).varint(logNr).varint(3).varint(naechste).varint(4).varint(seq);
  for (const { level, nr, groesse = 1000 } of neu) p.varint(7).varint(level).varint(nr).varint(groesse).varint(1).bytes([0]).varint(1).bytes([0xff]);
  for (const { level, nr } of geloescht) p.varint(6).varint(level).varint(nr);
  return logRecords([p.fertig()]);
}

// ---------- ZIP ----------

/** ZIP aus [[pfad, bytes]] (deflate, UTF-8-Namen) → Uint8Array */
export function zipBauen(dateien) {
  const daten = new Puffer(), verzeichnis = new Puffer();
  for (const [pfad, inhalt] of dateien) {
    const name = new TextEncoder().encode(pfad), gepackt = deflateRawSync(inhalt), crc = crc32(inhalt), offset = daten.laenge;
    daten.u32(0x04034b50).u16(20).u16(0x0800).u16(8).u16(0).u16(0).u32(crc).u32(gepackt.length).u32(inhalt.length)
      .u16(name.length).u16(0).bytes(name).bytes(gepackt);
    verzeichnis.u32(0x02014b50).u16(20).u16(20).u16(0x0800).u16(8).u16(0).u16(0).u32(crc).u32(gepackt.length).u32(inhalt.length)
      .u16(name.length).u16(0).u16(0).u16(0).u16(0).u32(0).u32(offset).bytes(name);
  }
  const vz = verzeichnis.fertig(), offset = daten.laenge;
  return daten.bytes(vz).u32(0x06054b50).u16(0).u16(0).u16(dateien.length).u16(dateien.length).u32(vz.length).u32(offset).u16(0).fertig();
}

// ---------- Die Testwelt ----------

export const SEED = "6889192652397090698";
export const ID = { ozean: 0, ebene: 1, wueste: 2, wald: 4, fluss: 7, nether: 8, end: 9, pilz: 14, seelensand: 178, tiefeDunkelheit: 190, UNBEKANNT: 250 };

/** Biom je Chunk, wie es die Testwelt am Ende enthalten soll (vor Überschreiben und Löschen: alt) */
function oberweltBiom(cx) { return cx < -20 ? ID.ozean : cx < 0 ? ID.ebene : cx < 20 ? ID.wald : ID.wueste; }
/** Oberwelt-Chunk: Oberfläche bei y 63 (Höhe 128), darunter bis y 40 Tiefe Dunkelheit (darf nicht zählen) */
const data3dSpeicher = new Map();
function oberweltData3d(id, { mischung = null } = {}) {
  if (!mischung && data3dSpeicher.has(id)) return data3dSpeicher.get(id);
  const wert = data3dBauen({
    hoehe: (x, z) => (x === 15 && z === 15 ? 150 : 128),   // eine Spalte höher – ändert nichts am Ergebnis
    biom: (x, y, z) => (y < 40 ? ID.tiefeDunkelheit : mischung ? mischung(x, z) : id),
  });
  if (!mischung) data3dSpeicher.set(id, wert);
  return wert;
}

/**
 * Baut die Standard-Testwelt. Aufbau:
 *   000013.ldb  Level 1, ältere Daten: alle Oberwelt-Chunks cx −40…39, cz −8…7
 *   000011.ldb  Level 0, neuere Daten: (1,1) → Pilzland, Nether und End, unbekanntes Biom 250 bei cx 30, cz 0…2
 *   000008.ldb  laut MANIFEST gelöscht: (0,0) → Wüste (darf nicht ankommen)
 *   000014.log  am neuesten: (2,2) → Fluss, (3,3) gelöscht, Textschlüssel als Fehlalarme
 * optionen: ordner (Präfix im ZIP, z. B. „Meine Welt/“ wie von Hand gezippt am iPhone),
 *           altesManifest (zweites, veraltetes MANIFEST nach dem gültigen im ZIP),
 *           levelname (Inhalt von levelname.txt), ohne (Pfade mit diesem Anfang weglassen, z. B. "db/"),
 *           beiwerk (was ein echter Weltordner noch enthält: Pakete, world_icon.jpeg, level.dat_old, LOCK, LOG),
 *           eintraege { neu, log } (weitere Einträge [[schluessel, wert | null]] in 000011.ldb bzw. zuletzt in die .log),
 *           levelDat (weitere Felder für level.dat, siehe levelDatBauen)
 * → { zip, dateien: [[pfad, bytes]], erwartet: Map<"dim:cx:cz", id> }
 */
export function testweltBauen({ ordner = "", altesManifest = false, seed = SEED, levelname = "Testwelt", ohne = [], beiwerk = false,
  eintraege = {}, levelDat = {} } = {}) {
  const erwartet = new Map();
  const alt = [];
  for (let cx = -40; cx < 40; cx++) for (let cz = -8; cz < 8; cz++) {
    const id = oberweltBiom(cx);
    // (5,5): Mehrheit entscheidet – 160 Spalten Ebene, 96 Wald → Ebene
    const d3 = cx === 5 && cz === 5 ? oberweltData3d(id, { mischung: (x) => (x < 10 ? ID.ebene : ID.wald) }) : oberweltData3d(id);
    alt.push([chunkSchluessel(cx, cz), d3]);
    erwartet.set(`overworld:${cx}:${cz}`, cx === 5 && cz === 5 ? ID.ebene : id);
  }
  // Andere Chunk-Tags derselben Chunks (Version, SubChunk) – müssen übergangen werden
  alt.push([chunkSchluessel(0, 0, "overworld", 0x2c), Uint8Array.of(40)]);
  alt.push([new Puffer().bytes(chunkSchluessel(0, 0, "overworld", 0x2f)).u8(4).fertig(), new Uint8Array(20)]);

  const neu = [[chunkSchluessel(1, 1), oberweltData3d(ID.pilz)]];
  erwartet.set("overworld:1:1", ID.pilz);
  for (let cz = 0; cz < 3; cz++) { neu.push([chunkSchluessel(30, cz), oberweltData3d(ID.UNBEKANNT)]); erwartet.set(`overworld:30:${cz}`, ID.UNBEKANNT); }
  for (let cx = -3; cx < 3; cx++) for (let cz = -2; cz < 2; cz++) {
    // Nether: bei y 64 Netherödnis, darunter Seelensandtal (die feste Höhe entscheidet)
    neu.push([chunkSchluessel(cx, cz, "nether"), data3dBauen({ dim: "nether", sektionen: 8, hoehe: () => 0, biom: (x, y) => (y < 48 ? ID.seelensand : ID.nether) })]);
    erwartet.set(`nether:${cx}:${cz}`, ID.nether);
  }
  for (let cx = 100; cx < 102; cx++) {
    neu.push([chunkSchluessel(cx, -1, "end"), data3dBauen({ dim: "end", sektionen: 16, hoehe: () => 0, biom: () => ID.end })]);
    erwartet.set(`end:${cx}:-1`, ID.end);
  }

  neu.push(...(eintraege.neu ?? []));
  const log = logBauen([
    { seq: 500, eintraege: [[chunkSchluessel(2, 2), oberweltData3d(ID.fluss)], [chunkSchluessel(3, 3), null]] },
    { seq: 501, eintraege: [
      [new TextEncoder().encode("~local_player"), new Uint8Array(30)],
      [new TextEncoder().encode("abcdefgh+"), new Uint8Array(600)],              // 9 Byte, endet auf „+“
      [new Puffer().i32(1).i32(2).i32(5).u8(0x2b).fertig(), new Uint8Array(600)], // 13 Byte, Dimension 5
    ] },
    ...(eintraege.log?.length ? [{ seq: 502, eintraege: eintraege.log }] : []),
  ]);
  erwartet.set("overworld:2:2", ID.fluss);
  erwartet.delete("overworld:3:3");

  const ldb13 = ldbBauen(alt, { seq: 10 });
  const ldb11 = ldbBauen(neu, { seq: 200 });
  const ldb8 = ldbBauen([[chunkSchluessel(0, 0), oberweltData3d(ID.wueste)]], { seq: 5 });
  const manifest = manifestBauen({ neu: [{ level: 1, nr: 13 }, { level: 0, nr: 11 }], geloescht: [{ level: 0, nr: 8 }], logNr: 14 });
  const dateien = [
    ["level.dat", levelDatBauen({ seed, zusatz: levelDat })],
    ["levelname.txt", new TextEncoder().encode(levelname)],
    ["db/CURRENT", new TextEncoder().encode("MANIFEST-000015\n")],
    ["db/MANIFEST-000015", manifest],
    ["db/000008.ldb", ldb8],
    ["db/000011.ldb", ldb11],
    ["db/000013.ldb", ldb13],
    ["db/000014.log", log],
  ];
  // Veraltetes MANIFEST dahinter: kennt 000008 noch als gültig und 000011 gar nicht
  if (altesManifest) dateien.push(["db/MANIFEST-000004", manifestBauen({ neu: [{ level: 0, nr: 8 }, { level: 0, nr: 13 }], logNr: 3 })]);
  // Wie im Weltordner am iPhone (Screenshot von Max, 13.10.2026): Pakete, Bild, alte level.dat, Sperrdatei und Protokoll der LevelDB
  if (beiwerk) {
    const text = (t) => new TextEncoder().encode(t);
    dateien.push(["level.dat_old", levelDatBauen({ seed })], ["world_icon.jpeg", new Uint8Array(2048)],
      ["world_behavior_packs.json", text("[]")], ["world_resource_packs.json", text("[]")],
      ["behavior_packs/paket/manifest.json", text("{}")], ["resource_packs/paket/manifest.json", text("{}")],
      ["db/LOCK", new Uint8Array(0)], ["db/LOG", text("Protokoll")], ["db/LOG.old", text("altes Protokoll")]);
  }
  const bleiben = dateien.filter(([p]) => !ohne.some((anfang) => p.startsWith(anfang))).map(([p, b]) => [ordner + p, b]);
  return { zip: zipBauen(bleiben), dateien: bleiben, erwartet };
}

// ---------- Die Fundewelt ----------

const text = (t) => new TextEncoder().encode(t);
const be = (cx, cz, dim, ...bloecke) => [chunkSchluessel(cx, cz, dim, 49), nbtBauen(...bloecke)];
const truhe = (x, y, z, beute, extra = {}) => ({ id: "Chest", x, y, z, LootTable: `loot_tables/chests/${beute}.json`, Items: nbt.liste(10, []), ...extra });
const item = (name, extra = {}) => ({ Count: nbt.byte(1), Damage: nbt.short(0), Name: name, WasPickedUp: nbt.byte(0), ...extra });
const leer = () => item("", { Count: nbt.byte(0) });
const vorlage = (id) => item(id === "netherite" ? "minecraft:netherite_upgrade_smithing_template" : `minecraft:${id}_armor_trim_smithing_template`);
const besatz = (Pattern, Material) => ({ tag: { Trim: { Material, Pattern } } });
let wesenNr = 0;
const wesen = (w) => [new Uint8Array([...text("actorprefix"), 0, 0, 0, 1, 0, 0, 0, ++wesenNr]), nbtBauen(w)];
const pos = (x, y, z) => nbt.liste(nbt.FLOAT, [x, y, z]);
/** Strukturbereiche eines Chunks (Tag 57): [x1, y1, z1, x2, y2, z2, typ] je Kasten */
const bereiche = (cx, cz, dim, ...kaesten) => {
  const p = new Puffer().i32(kaesten.length);
  for (const [x1, y1, z1, x2, y2, z2, typ] of kaesten) p.i32(x1).i32(y1).i32(z1).i32(x2).i32(y2).i32(z2).u8(typ);
  return [chunkSchluessel(cx, cz, dim, 57), p.fertig()];
};
/** Strukturbereiche ab Bedrock 1.26 (Tag 119, AABBVolumes): Namen [nr, name], Teile [teil, x1, y1, z1, x2, y2, z2],
    Zuordnung verschachtelter Strukturen a: [teil, nr], fester Strukturen b: [teil, nr, kennung] (Aufbau in welt-funde.js) */
const volumen = (cx, cz, dim, { namen, teile, a = [], b = [] }) => {
  const p = new Puffer().u32(1).u32(namen.length);
  for (const [nr, name] of namen) p.u32(nr).u16(name.length).text(name);
  p.u32(teile.length);
  for (const [teil, ...k] of teile) { p.u32(teil); for (const v of k) p.i32(v); }
  p.u32(a.length);
  for (const [teil, nr] of a) p.u32(teil).u32(nr).u32(0);
  p.u32(b.length);
  for (const [teil, nr, kennung = 0] of b) p.u32(teil).u32(nr).u32(0).u32(kennung);
  return [chunkSchluessel(cx, cz, dim, 119), p.fertig()];
};
const dorf = (schluessel, [x0, y0, z0, x1, y1, z1]) => [text(schluessel), nbtBauen({ X0: x0, Y0: y0, Z0: z0, X1: x1, Y1: y1, Z1: z1, Tick: nbt.long(9) })];

/**
 * Testwelt mit allen Arten von Funden (Bauplan „Welt-Funde“): Strukturen aus Truhen, Kies, Spawnern und
 * Tresoren, Lore mit Truhe, Rüstungsständer (auch im alten Format, Chunk-Tag 50), Banner, Schmiedevorlagen
 * in Behältern, ~local_player mit Rüstung, Inventar und Endertruhe, Portal-Liste, ein anderer Spieler,
 * Welt-Info in level.dat. Dazu W3: Strukturbereiche (Außenposten mit Truhe, Hexenhütte, Ozeanmonument, Netherfestung
 * beim Lohenspawner, ein Typ 4 und ein Monument im Nether, die wegfallen), zwei Dörfer (eins mit Dimension im Schlüssel)
 * und ein drittes, das die .log löscht, zwei Endtransitportale, TheEnd mit besiegtem Drachen.
 * Die .log löscht ein Schiffswrack und öffnet eine Iglu-Truhe; ein kaputter
 * Block-Eintrag kostet nur seinen Fund. Was herauskommen soll, steht in welt-funde.test.mjs.
 */
export function fundeweltBauen() {
  wesenNr = 0;
  const neu = [
    // Wüstentempel: vier Truhen eng beieinander → ein Ort; dazu der Brunnen (Kies) in der Nähe als eigener Ort
    be(10, 10, "overworld", truhe(165, 64, 170, "desert_pyramid"), truhe(167, 55, 168, "desert_pyramid"),
      truhe(163, 55, 172, "desert_pyramid"), truhe(165, 55, 174, "desert_pyramid")),
    be(11, 10, "overworld", { id: "BrushableBlock", x: 180, y: 60, z: 170, LootTable: "loot_tables/entities/desert_well_brushable_block.json" }),
    // Dorf: Truhen 80 Blöcke auseinander → ein Dorf (Nähe 96)
    be(20, 0, "overworld", truhe(320, 70, 10, "village/village_plains_house")),
    be(25, 0, "overworld", truhe(400, 70, 10, "village/village_weaponsmith")),
    // Zwei Schiffswracks, das zweite verschwindet später (gelöscht in der .log)
    be(-20, 30, "overworld", truhe(-310, 60, 490, "shipwrecktreasure")),
    be(-40, 30, "overworld", truhe(-630, 60, 490, "shipwrecksupply")),
    // Unbekannte Tabellen werden gemeldet, Bonustruhe nicht
    be(1, -30, "overworld", truhe(20, 70, -470, "mod_kiste"), truhe(25, 70, -470, "mod_kiste"), truhe(30, 70, -470, "spawn_bonus_chest")),
    // Netherfestung: Truhe und Lohenspawner → ein Ort beim Spawner; Portalruine im Nether
    be(5, 5, "nether", truhe(90, 70, 85, "nether_bridge"),
      { id: "MobSpawner", x: 100, y: 72, z: 88, EntityIdentifier: "minecraft:blaze" }),
    be(-5, 5, "nether", truhe(-70, 40, 85, "ruined_portal")),
    // Endsiedlung, Prüfungskammer
    be(60, 0, "end", truhe(970, 80, 5, "end_city_treasure")),
    be(-10, -10, "overworld", { id: "Vault", x: -150, y: -20, z: -150 }, { id: "TrialSpawner", x: -140, y: -20, z: -160 }),
    // Banner: weiß mit rotem Fuß und schwarzem Creeper; eins mit unbekanntem Muster; das Unheilvolle bleibt weg
    be(2, 2, "overworld",
      { id: "Banner", x: 40, y: 70, z: 41, Base: 15, Type: 0, Patterns: [{ Color: 1, Pattern: "bs" }, { Color: 0, Pattern: "cre" }] },
      { id: "Banner", x: 44, y: 70, z: 41, Base: 11, Type: 0, Patterns: [{ Color: 4, Pattern: "xyz" }, { Color: 4, Pattern: "flw" }] },
      { id: "Banner", x: 46, y: 70, z: 41, Base: 15, Type: 1, Patterns: [{ Color: 9, Pattern: "mr" }] }),
    // Behälter mit Schmiedevorlagen: Fass direkt, Truhe mit Shulkerkiste darin
    be(3, 3, "overworld",
      { id: "Barrel", x: 50, y: 64, z: 50, Items: [vorlage("sentry")] },
      { id: "Chest", x: 52, y: 64, z: 50, Items: [item("minecraft:shulker_box", { tag: { Items: [vorlage("netherite")] } })] }),
    // Eine Truhe, die später geöffnet wird (Beute-Tabelle weg) – kein Fund mehr
    be(4, 4, "overworld", truhe(70, 30, 70, "igloo_chest")),
    // Lebewesen: Lore mit Truhe (Mineshaft), Rüstungsständer mit besetztem Diamantharnisch, ein Zombie
    wesen({ identifier: "minecraft:chest_minecart", Pos: pos(300.5, 20, -100.5), LootTable: "loot_tables/chests/abandoned_mineshaft.json" }),
    wesen({ identifier: "minecraft:armor_stand", Pos: pos(12.5, 64, 12.5),
      Armor: [leer(), item("minecraft:diamond_chestplate", besatz("coast", "quartz")), leer(), leer()] }),
    wesen({ identifier: "minecraft:zombie", Pos: pos(0, 64, 0), Armor: [item("minecraft:iron_helmet"), leer(), leer(), leer()] }),
    // Alte Welten: Lebewesen im Chunk (Tag 50)
    [chunkSchluessel(6, 6, "overworld", 50), nbtBauen({ identifier: "minecraft:armor_stand", Pos: pos(-99.5, 64, 100.5),
      Armor: [item("minecraft:turtle_helmet"), leer(), leer(), item("minecraft:netherite_boots", besatz("minecraft:silence", "minecraft:amethyst"))] })],
    // Andere Spieler (nur gezählt) und die Portale
    [text("player_server_1234"), nbtBauen({ identifier: "minecraft:player" })],
    [text("portals"), nbtBauen({ data: { PortalRecords: [
      { DimId: 0, Span: nbt.byte(2), TpX: 100, TpY: 70, TpZ: 200, Xa: nbt.byte(1), Za: nbt.byte(0) },
      { DimId: 1, Span: nbt.byte(2), TpX: 12, TpY: 40, TpZ: 25, Xa: nbt.byte(0), Za: nbt.byte(1) },
      { DimId: 2, Span: nbt.byte(2), TpX: 1, TpY: 1, TpZ: 1, Xa: nbt.byte(1), Za: nbt.byte(0) },
    ] } })],
    // Ein kaputter Eintrag kostet nur seinen Fund
    [chunkSchluessel(7, 7, "overworld", 49), Uint8Array.of(10, 0, 0, 8, 5)],
    // W3: Strukturbereiche (Tag 57) – Außenposten neben seiner Truhe, Hexenhütte, Typ 4 fällt weg; Monument; Festung im Nether
    bereiche(30, 30, "overworld", [480, 70, 480, 495, 90, 495, 5], [600, 63, 600, 607, 70, 607, 2], [610, 63, 610, 612, 66, 612, 4]),
    be(30, 30, "overworld", truhe(485, 72, 490, "pillager_outpost")),
    bereiche(-60, 40, "overworld", [-970, 39, 640, -912, 61, 698, 3]),
    bereiche(6, 6, "nether", [60, 60, 80, 140, 80, 96, 1], [10, 10, 10, 20, 20, 20, 3]),
    // Dörfer: Kasten um die Dorftruhen (Mitte X 360 · Z 10) und ein zweites mit Dimension im Schlüssel; ein drittes löscht die .log
    dorf("VILLAGE_0e3e6c48-1111-4a2b-9c3d-000000000001_INFO", [330, 60, -20, 390, 80, 40]),
    dorf("VILLAGE_Overworld_0e3e6c48-1111-4a2b-9c3d-000000000002_INFO", [-2000, 50, 2000, -1940, 90, 2060]),
    dorf("VILLAGE_0e3e6c48-1111-4a2b-9c3d-000000000003_INFO", [5000, 60, 5000, 5040, 80, 5040]),
    // Endtransitportale (Block-Entity im End) und der Drachenkampf
    be(6, 0, "end", { id: "EndGateway", x: 96, y: 75, z: 0, Age: nbt.long(100), ExitPortal: [1100, 60, 50] }),
    be(68, 3, "end", { id: "EndGateway", x: 1100, y: 60, z: 50, Age: nbt.long(100), ExitPortal: [96, 75, 0] }),
    [text("TheEnd"), nbtBauen({ data: { DragonFight: { DragonKilled: nbt.byte(1), DragonSpawned: nbt.byte(0), PreviouslyKilled: nbt.byte(1) } } })],
    // W4: Strukturbereiche ab 1.26 (Tag 119) – Monument (feste Struktur, zwei Chunks), Lager mit Prüfungskammer im selben
    // Eintrag, Außenposten nur mit Spawnbereich bis zur Bauhöhe, ein unbekannter Name, ein ungültiger Kasten
    volumen(62, 62, "overworld", { namen: [[0, "minecraft:monument"]],
      teile: [[1, 1000, 39, 1000, 1028, 61, 1028], [2, 1000, 39, 1000, 1057, 61, 1057]], b: [[1, 0], [2, 0, 1]] }),
    volumen(64, 64, "overworld", { namen: [[0, "minecraft:monument"]], teile: [[1, 1029, 39, 1029, 1057, 61, 1057]], b: [[1, 0]] }),
    volumen(125, 125, "overworld", { namen: [[2, "minecraft:abandoned_camp_taiga"], [0, "minecraft:trial_chambers"]],
      teile: [[3, 2000, 70, 2000, 2006, 74, 2006], [2, 2004, 70, 2004, 2010, 75, 2010], [1, 2020, -30, 2020, 2030, -20, 2030]],
      a: [[3, 2], [2, 2], [1, 0]] }),
    volumen(-80, 80, "overworld", { namen: [[0, "minecraft:pillager_outpost"]], teile: [[1, -1280, 63, 1280, -1265, 319, 1295]], b: [[1, 0, 1]] }),
    volumen(-90, 90, "overworld", { namen: [[0, "minecraft:mystery_tower"], [1, "minecraft:igloo"]],
      teile: [[1, -1440, 70, 1440, -1430, 80, 1450], [2, -1400, 70, 1400, -1410, 80, 1410]], b: [[1, 0], [2, 1]] }),
  ];
  const log = [
    [chunkSchluessel(-40, 30, "overworld", 49), null],
    [text("VILLAGE_0e3e6c48-1111-4a2b-9c3d-000000000003_INFO"), null],
    be(4, 4, "overworld", { id: "Chest", x: 70, y: 30, z: 70, Items: nbt.liste(10, []) }),
    [text("~local_player"), nbtBauen({
      identifier: "minecraft:player", DimensionId: 1, Pos: pos(10.5, 71.62, -5.5), PlayerLevel: 30,
      Armor: [item("minecraft:leather_helmet", { tag: { customColor: 0xffb02e26 | 0 } }), item("minecraft:elytra"),
        item("minecraft:iron_leggings", besatz("dune", "redstone")), item("minecraft:golden_boots"), item("minecraft:mod_helmet")],
      Inventory: [vorlage("wild"), leer()],
      EnderChestInventory: [vorlage("spire"), vorlage("sentry")],
      Mainhand: [leer()], Offhand: [leer()],
    })],
  ];
  return testweltBauen({
    eintraege: { neu, log },
    levelDat: { GameType: 1, Difficulty: 3, Time: nbt.long(10 * 24000 + 500), LastPlayed: nbt.long(1790701971),
      IsHardcore: nbt.byte(0), cheatsEnabled: nbt.byte(1), SpawnX: 5, SpawnY: 32767, SpawnZ: -7 },
  });
}
