// Tests für den erweiterten Welt-Import (Bauplan „Welt-Funde“, W1): NBT-Leser und Funde.
// Lauf: node --test welt-funde.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { openAsBlob, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import path from "node:path";
import { nbtLesen, nbtAlleLesen, levelDatNbt } from "../nbt.js";
import { fundeSammler, beuteZuordnen, BEUTE, SPAWNER, BEREICHE, NAEHE, BANNER_FARBEN, BANNER_MUSTER, RUESTUNG_MATERIAL } from "../welt-funde.js";
import { weltLesen } from "../biom-welt.js";
import { levelDatLesen } from "../biom-dekoder.js";
import { testweltBauen, fundeweltBauen, nbt, nbtBauen, levelDatBauen, SEED } from "./welt-bauen.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HIER, "daten", "fixture-seed.mcworld");
const text = (t) => new TextEncoder().encode(t);

/** Stammdaten aus regeln.js wie im Board-Server (koordinaten-board/server/src/regeln.js) */
function regelnLaden() {
  const kontext = vm.createContext({});
  new vm.Script(readFileSync(path.join(HIER, "..", "regeln.js"), "utf8")).runInContext(kontext);
  // JSON-Runde: Arrays aus dem vm-Kontext haben einen anderen Prototyp (deepStrictEqual)
  const daten = JSON.parse(new vm.Script("JSON.stringify({ FEATURE_KATEGORIEN, FARBEN, MUSTER, RUESTUNGEN, BESATZ_MATERIALIEN, SAMMELOBJEKTE })").runInContext(kontext));
  return { ...daten, bannerPruefen: new vm.Script("bannerPruefen").runInContext(kontext) };
}
const regeln = regelnLaden();

// ---------- NBT ----------

test("NBT: alle Typen, mehrere Wurzeln hintereinander, level.dat", () => {
  const bytes = nbtBauen({
    b: nbt.byte(-3), s: nbt.short(-300), i: 70000, l: nbt.long(-6889192652397090698n), f: 1.5, d: nbt.double(0.1),
    t: "Grüße", bs: nbt.bytes([1, 2, 255]), is: nbt.ints([1, -2]), ls: nbt.longs([5n]),
    leer: nbt.liste(0, []), liste: [{ a: 1 }, { a: 2 }], tief: { innen: { x: "y" } },
  }, { zwei: 2 });
  const [a, b] = nbtAlleLesen(bytes);
  assert.deepEqual(b, { zwei: 2 });
  assert.equal(a.b, -3); assert.equal(a.s, -300); assert.equal(a.i, 70000); assert.equal(a.l, -6889192652397090698n);
  assert.equal(a.f, 1.5); assert.equal(a.d, 0.1); assert.equal(a.t, "Grüße");
  assert.deepEqual([...a.bs], [1, 2, 255]); assert.deepEqual([...a.is], [1, -2]); assert.deepEqual([...a.ls], [5n]);
  assert.deepEqual(a.leer, []); assert.deepEqual(a.liste.map((x) => x.a), [1, 2]); assert.equal(a.tief.innen.x, "y");
  // Erste Wurzel einzeln: Ende zeigt auf die zweite
  const { ende } = nbtLesen(bytes);
  assert.deepEqual(nbtLesen(bytes, ende).wert, { zwei: 2 });
  // level.dat: 8 Byte Kopf
  const ld = levelDatNbt(levelDatBauen({ seed: SEED, zusatz: { GameType: 1 } }));
  assert.equal(ld.RandomSeed, BigInt(SEED)); assert.equal(ld.GameType, 1); assert.equal(ld.Difficulty, 2);
});

test("NBT: kaputte Daten werfen, „__proto__“ bleibt ein gewöhnliches Feld", () => {
  const bytes = nbtBauen({ a: "langer Text" });
  assert.throws(() => nbtLesen(bytes.subarray(0, bytes.length - 4)), /abgeschnitten/);
  assert.throws(() => nbtLesen(Uint8Array.of(0)), /ohne Inhalt/);
  assert.throws(() => nbtLesen(Uint8Array.of(10, 0, 0, 99, 0, 0)), /Unbekannter NBT-Typ 99/);
  // Tief verschachtelt (böswillig): Fehler statt Stapelüberlauf
  const tief = [10, 0, 0];
  for (let i = 0; i < 2000; i += 1) tief.push(10, 1, 0, 0x61);
  assert.throws(() => nbtLesen(Uint8Array.from(tief)), /zu tief/);
  const o = nbtLesen(nbtBauen({ ["__proto__"]: { boese: 1 } })).wert;
  assert.equal(Object.getPrototypeOf(o), Object.prototype);
  assert.deepEqual(Object.keys(o), ["__proto__"]);
  assert.equal({}.boese, undefined);
});

test("level.dat über nbt.js: Seed, Name, Version wie bisher", () => {
  const w = levelDatLesen(levelDatBauen({ seed: "-42", name: "Welt", version: [1, 21, 0, 3, 0] }));
  assert.deepEqual(w, { seed: "-42", weltname: "Welt", spielversion: "1.21.0" });
  assert.throws(() => levelDatLesen(levelDatBauen({ seed: 1 }).subarray(0, 30)));
});

// ---------- Testwelt von Max ----------

test("Testwelt von Max: genau 6 Verliese und 1 vergrabener Schatz, Spieler und Welt-Info", async () => {
  const { funde, meta } = await weltLesen(await openAsBlob(FIXTURE));
  assert.equal(meta.seed, "6889192652397090698");
  const orte = funde.orte.map((o) => `${o.kategorie} ${o.x} ${o.y} ${o.z}`);
  assert.deepEqual(orte, [
    "Dungeon -46 -36 107", "Dungeon -23 -36 -42", "Dungeon -7 -35 36", "Dungeon -6 -12 -95", "Dungeon 8 -39 31", "Dungeon 41 -6 33",
    "Treasure 72 47 -56",
  ]);
  // Zwei Verliese liegen nur 16 Blöcke auseinander: je Spawner ein Ort, die Truhen beim nächsten
  assert.deepEqual(funde.orte.filter((o) => o.kategorie === "Dungeon").map((o) => [o.spawner, o.behaelter]),
    [[1, 2], [1, 2], [1, 2], [1, 0], [1, 1], [1, 2]]);
  assert.deepEqual(funde.orte.find((o) => o.kategorie === "Treasure").beute, ["buriedtreasure"]);
  // Max stand mit den Füßen auf y 74 bei X 0 / Z 0
  assert.deepEqual(funde.spieler, { dim: "overworld", x: 0, y: 74, z: 0, level: 0 });
  assert.deepEqual(funde.info, {
    spielmodus: "survival", schwierigkeit: "normal", tage: 0, spawn: { x: 0, y: null, z: 0 },
    zuletztGespielt: "2026-09-29T17:12:51.000Z", hardcore: false, cheats: false, drache: null,
  });
  assert.deepEqual([funde.portale, funde.sammelobjekte, funde.ruestung, funde.banner, funde.andereSpieler], [[], [], [], [], 0]);
  assert.deepEqual(funde.unbekannt, { beute: [], muster: [], ruestung: [] });
  assert.equal(funde.fehler, 0);
  // Streaming und „komplett“ (Bibliothek) finden dasselbe
  const komplett = await weltLesen(await openAsBlob(FIXTURE), { weg: "komplett" });
  assert.deepEqual(komplett.funde, funde);
});

test("ohne Funde: funde: false liest nur Biome", async () => {
  const { zip } = testweltBauen();
  const e = await weltLesen(new Blob([zip]), { funde: false });
  assert.equal(e.funde, null);
  assert.ok(e.kacheln.length);
});

// ---------- Synthetische Welt mit allen Arten von Funden ----------

test("Fundewelt: Orte je Struktur, Löschen und Überschreiben wie bei den Biomen", async () => {
  const { funde } = await weltLesen(new Blob([fundeweltBauen().zip]));
  // Anzahl je Ort: Behälter/Spawner/Kies/Tresore/Prüfungs-Spawner/Strukturbereiche/Endtransitportale
  const orte = funde.orte.map((o) => `${o.dim} ${o.kategorie} ${o.x} ${o.y} ${o.z} · ${[o.behaelter, o.spawner, o.kies, o.tresore, o.pruefspawner, o.bereiche, o.tore].join("/")}`);
  assert.deepEqual(orte, [
    "overworld Desert Temple 165 64 170 · 4/0/0/0/0/0/0",
    "overworld Desert Well 180 60 170 · 0/0/1/0/0/0/0",
    "overworld Mineshaft 300 20 -101 · 1/0/0/0/0/0/0",
    "overworld Monument -941 50 669 · 0/0/0/0/0/1/0",
    "overworld Outpost 487 80 487 · 1/0/0/0/0/1/0",
    "overworld Shipwreck -310 60 490 · 1/0/0/0/0/0/0",
    "overworld Trial Chamber -150 -20 -150 · 0/0/0/1/1/0/0",
    "overworld Village -1970 70 2030 · 0/0/0/0/0/1/0",
    "overworld Village 360 70 10 · 2/0/0/0/0/1/0",
    "overworld Witch Hut 603 66 603 · 0/0/0/0/0/1/0",
    "nether Nether Fortress 100 72 88 · 1/1/0/0/0/1/0",
    "nether Ruined Portal -70 40 85 · 1/0/0/0/0/0/0",
    "end End City 970 80 5 · 1/0/0/0/0/0/0",
    "end End Gateway 96 75 0 · 0/0/0/0/0/0/1",
    "end End Gateway 1100 60 50 · 0/0/0/0/0/0/1",
  ]);
  assert.deepEqual(funde.orte.find((o) => o.kategorie === "Nether Fortress").mobs, ["blaze"]);
  assert.deepEqual(funde.orte.map((o) => o.naehe), [48, 16, 96, 96, 48, 48, 96, 96, 96, 32, 96, 16, 96, 8, 8]);
  assert.deepEqual(funde.orte.find((o) => o.kategorie === "Desert Well").beute, ["desert_well_brushable_block"]);
  assert.deepEqual(funde.unbekannt.beute, [{ name: "mod_kiste", anzahl: 2 }]);
  // Nur der kaputte Block-Eintrag zählt; das ~local_player-Füllstück der Standard-Testwelt ersetzt die .log später
  assert.equal(funde.fehler, 1);
});

test("W3: Strukturbereiche, Dörfer, Endtransitportale und Drache – Mitte des Kastens, Spawner geht vor", async () => {
  const { funde } = await weltLesen(new Blob([fundeweltBauen().zip]));
  const ort = (k, x) => funde.orte.find((o) => o.kategorie === k && (x == null || o.x === x));
  // Außenposten: Mitte des Kastens statt der Truhe; Netherfestung: der Lohenspawner bleibt die Koordinate
  assert.deepEqual([ort("Outpost").x, ort("Outpost").z, ort("Outpost").beute], [487, 487, ["pillager_outpost"]]);
  assert.deepEqual([ort("Nether Fortress").x, ort("Nether Fortress").bereiche], [100, 1]);
  // Dorf: Mitte aus VILLAGE_…_INFO; das dritte Dorf hat die .log gelöscht; Typ 4 und ein Monument im Nether fallen weg
  assert.equal(funde.orte.filter((o) => o.kategorie === "Village").length, 2);
  assert.ok(!funde.orte.some((o) => o.x === 5020 || o.x === 611 || (o.dim === "nether" && o.kategorie === "Monument")));
  assert.equal(funde.info.drache, true);
  // Kaputter Strukturbereich: nur er fehlt
  const s = fundeSammler();
  s.aufnehmen(Uint8Array.of(1, 0, 0, 0, 1, 0, 0, 0, 57), Uint8Array.of(2, 0, 0, 0, 1, 2, 3), false);
  assert.equal(s.auswerten().fehler, 1);
});

test("Fundewelt: Portale, Spieler, Welt-Info", async () => {
  const { funde } = await weltLesen(new Blob([fundeweltBauen().zip]));
  assert.deepEqual(funde.portale, [
    { dim: "nether", x: 12, y: 40, z: 25, achse: "z", breite: 2, naehe: 8 },
    { dim: "overworld", x: 100, y: 70, z: 200, achse: "x", breite: 2, naehe: 8 },
  ]);
  assert.deepEqual(funde.spieler, { dim: "nether", x: 10, y: 70, z: -6, level: 30 });
  assert.equal(funde.andereSpieler, 1);
  assert.deepEqual(funde.info, {
    spielmodus: "creative", schwierigkeit: "hard", tage: 10, spawn: { x: 5, y: null, z: -7 },
    zuletztGespielt: "2026-09-29T17:12:51.000Z", hardcore: false, cheats: true, drache: true,
  });
});

test("Fundewelt: Schmiedevorlagen mit Fundort, Rüstung, Banner", async () => {
  const { funde } = await weltLesen(new Blob([fundeweltBauen().zip]));
  assert.deepEqual(funde.sammelobjekte, [
    { id: "netherite", wo: ["Truhe bei X 52 · Y 64 · Z 50"] },
    { id: "sentry", wo: ["Endertruhe", "Fass bei X 50 · Y 64 · Z 50"] },
    { id: "spire", wo: ["Endertruhe"] },
    { id: "wild", wo: ["Inventar"] },
  ]);
  assert.deepEqual(funde.ruestung, [
    { name: "Getragene Rüstung (29.9.)", quelle: "spieler", teile: {
      helmet: { ruestung: "leather", muster: null, material: null, lederfarbe: "#b02e26" },
      chestplate: null,
      leggings: { ruestung: "iron", muster: "dune", material: "redstone", lederfarbe: null },
      boots: { ruestung: "gold", muster: null, material: null, lederfarbe: null } } },
    { name: "Rüstungsständer bei X −100 · Z 100", quelle: "staender", x: -100, z: 100, teile: {
      helmet: { ruestung: "turtle", muster: null, material: null, lederfarbe: null }, chestplate: null, leggings: null,
      boots: { ruestung: "netherite", muster: "silence", material: "amethyst", lederfarbe: null } } },
    { name: "Rüstungsständer bei X 12 · Z 12", quelle: "staender", x: 12, z: 12, teile: {
      helmet: null, chestplate: { ruestung: "diamond", muster: "coast", material: "quartz", lederfarbe: null }, leggings: null, boots: null } },
  ]);
  assert.deepEqual(funde.unbekannt.ruestung, ["mod_helmet"]);
  assert.deepEqual(funde.banner, [
    { name: "Banner bei X 40 · Z 41", basis: "white", ebenen: [{ muster: "stripe_bottom", farbe: "red" }, { muster: "creeper", farbe: "black" }],
      dim: "overworld", x: 40, y: 70, z: 41 },
    { name: "Banner bei X 44 · Z 41", basis: "yellow", ebenen: [{ muster: "flow", farbe: "blue" }], dim: "overworld", x: 44, y: 70, z: 41 },
  ]);
  assert.deepEqual(funde.unbekannt.muster, ["xyz"]);
  for (const b of funde.banner) assert.equal(regeln.bannerPruefen(b), null, b.name);
});

test("Weltordner und „komplett“ (Bibliothek) liefern dieselben Funde wie die ZIP im Streaming", async () => {
  const { zip, dateien } = fundeweltBauen();
  const ordner = dateien.map(([pfad, bytes]) => ({ pfad, datei: new Blob([bytes]) }));
  const { funde } = await weltLesen(new Blob([zip]));
  assert.deepEqual((await weltLesen(ordner)).funde, funde);
  assert.deepEqual((await weltLesen(new Blob([zip]), { weg: "komplett" })).funde, funde);
});

// ---------- Zuordnungen passen zu den Stammdaten in regeln.js ----------

const pos = (x, y, z) => nbt.liste(nbt.FLOAT, [x, y, z]);
const vorlage = (id) => ({ Count: nbt.byte(1), Damage: nbt.short(0), WasPickedUp: nbt.byte(0),
  Name: id === "netherite" ? "minecraft:netherite_upgrade_smithing_template" : `minecraft:${id}_armor_trim_smithing_template` });

test("Kategorien, Banner, Rüstung und Vorlagen passen zu regeln.js", () => {
  const { FEATURE_KATEGORIEN, FARBEN, MUSTER, RUESTUNGEN, SAMMELOBJEKTE } = regeln;
  const kategorien = [...BEUTE.map(([, k, dims]) => [k, dims]), ...Object.values(SPAWNER), ...Object.values(BEREICHE),
    ["Trial Chamber", ["overworld"]], ["Village", ["overworld"]], ["End Gateway", ["end"]]];
  for (const [k, dims] of kategorien) {
    for (const d of dims) assert.ok(FEATURE_KATEGORIEN[d].includes(k), `${k} gibt es nicht in ${d}`);
    assert.ok(NAEHE[k], `Nähe für ${k} fehlt`);
  }
  assert.equal(new Set(BANNER_FARBEN).size, 16);
  assert.deepEqual([...BANNER_FARBEN].sort(), FARBEN.map((f) => f.id).sort());
  assert.deepEqual(Object.values(BANNER_MUSTER).sort(), MUSTER.map((m) => m.id).sort());
  for (const r of Object.values(RUESTUNG_MATERIAL)) assert.ok(RUESTUNGEN.some((x) => x.id === r), r);
  assert.deepEqual(Object.values(RUESTUNG_MATERIAL).length + 1, RUESTUNGEN.length);   // dazu die Schildkröte
  // Jede Schmiedevorlage aus SAMMELOBJEKTE wird erkannt
  const s = fundeSammler();
  const alle = SAMMELOBJEKTE.map((o) => vorlage(o.id));
  s.aufnehmen(text("~local_player"), nbtBauen({ identifier: "minecraft:player", Pos: pos(0, 65.62, 0), Inventory: alle }), false);
  assert.deepEqual(s.auswerten().sammelobjekte.map((o) => o.id).sort(), SAMMELOBJEKTE.map((o) => o.id).sort());
});

test("Beute-Tabellen: Pfade aus Truhen und Kies", () => {
  assert.equal(beuteZuordnen("loot_tables/chests/village/village_toolsmith.json").kategorie, "Village");
  assert.equal(beuteZuordnen("loot_tables/chests/trial_chambers/corridor.json").kategorie, "Trial Chamber");
  assert.equal(beuteZuordnen("loot_tables/entities/trail_ruins_brushable_block_common.json").kategorie, "Trail Ruins");
  assert.equal(beuteZuordnen("loot_tables/entities/cold_ocean_ruins_brushable_block.json").kategorie, "Ocean Ruins");
  assert.equal(beuteZuordnen("loot_tables/chests/underwater_ruin_big.json").kategorie, "Ocean Ruins");
  assert.equal(beuteZuordnen("loot_tables/chests/jungle_temple_dispenser.json").kategorie, "Jungle Temple");
  assert.equal(beuteZuordnen("loot_tables/chests/bastion_treasure.json").kategorie, "Bastion");
  assert.equal(beuteZuordnen("loot_tables/chests/buried_treasure.json").kategorie, "Treasure");
  assert.ok(beuteZuordnen("loot_tables/chests/spawn_bonus_chest.json").ohneOrt);
  assert.ok(beuteZuordnen("loot_tables/chests/irgendwas.json").unbekannt);
});
