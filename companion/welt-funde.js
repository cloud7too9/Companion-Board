/* ============================================================================
   welt-funde.js  ·  Funde aus der Welt: Strukturen, Portale, Spieler, Banner
   ----------------------------------------------------------------------------
   Bauplan „Welt-Funde“, Phase W1. Der Sammler sieht im selben Durchlauf wie die
   Biome (biom-welt.js) jeden LevelDB-Eintrag und behält nur, was er braucht:
     · Block-Entities (Chunk-Tag 49): Behälter mit Beute-Tabelle, Spawner,
       Tresore, Prüfungs-Spawner, Seltsamer Kies und Sand, Banner, Inhalte
     · Lebewesen (actorprefix…, alte Welten Chunk-Tag 50): Loren und Boote mit
       Truhe, Rüstungsständer, alles mit Inhalt
     · ~local_player: Position, Inventar, Endertruhe, getragene Rüstung
     · portals: die Netherportale, die das Spiel kennt
     · level.dat: Spielmodus, Schwierigkeit, Tage, Spawn, zuletzt gespielt
   Wie bei den Biomen ersetzt ein späterer Eintrag einen früheren, gelöschte
   fallen raus. Gespeichert wird je Eintrag nur das Gefilterte, kein Rohwert.

   Ohne Abhängigkeit von regeln.js (der Worker ist ein Modul): Die IDs passen zu
   dessen Stammdaten (FEATURE_KATEGORIEN, MUSTER, FARBEN, RUESTUNGEN,
   BESATZ_MATERIALIEN, SAMMELOBJEKTE), ein Test hält beides zusammen. Prüfen
   gegen Vorhandenes („schon bekannt“), Portal-Paare und Lederfarbe → FARBEN
   macht die Seite (W2) mit regeln.js und board-karten.js.

   Formate aus der Testwelt von Max (Bedrock 1.26.51) bestätigt: Truhe, Spawner,
   Lebewesen, Spieler, level.dat. Nur aus der Beschreibung des Formats
   (Minecraft Wiki „Bedrock Edition level format“), an einer echten Welt noch
   zu prüfen (Haltepunkt H12): Portal-Liste, Banner (Farbnummern, Muster-
   Kürzel), Besatz und Lederfarbe an Rüstungen, Tresor, Kies, Lore mit Truhe.
   ========================================================================== */
import { nbtLesen, nbtAlleLesen, levelDatNbt } from "./nbt.js";

const DIM_NUMMER = Object.freeze({ 0: "overworld", 1: "nether", 2: "end" });
const OW = ["overworld"], NE = ["nether"], EN = ["end"];

/* Beute-Tabelle → Kategorie (FEATURE_KATEGORIEN) und Dimensionen, in denen es sie gibt.
   Name ohne „loot_tables/“ und ohne Ordner „chests/“ bzw. „entities/“ (Kies und Sand). */
export const BEUTE = Object.freeze([
  [/^simple_dungeon/, "Dungeon", OW],
  [/^buried_?treasure/, "Treasure", OW],
  [/^abandoned_mineshaft/, "Mineshaft", OW],
  [/^village\//, "Village", OW],
  [/^ancient_city/, "Ancient City", OW],
  [/^stronghold_/, "Stronghold", OW],
  [/^woodland_mansion/, "Mansion", OW],
  [/^pillager_outpost/, "Outpost", OW],
  [/^desert_pyramid/, "Desert Temple", OW],
  [/^(jungle_temple|dispenser_trap)/, "Jungle Temple", OW],
  [/^shipwreck/, "Shipwreck", OW],
  [/^(underwater_ruin|(cold_|warm_)?ocean_ruin)/, "Ocean Ruins", OW],
  [/^igloo/, "Igloo", OW],
  [/^ruined_portal/, "Ruined Portal", ["overworld", "nether"]],
  [/^trail_ruins/, "Trail Ruins", OW],
  [/^desert_well/, "Desert Well", OW],
  [/^trial_chambers?\//, "Trial Chamber", OW],
  [/^nether_bridge/, "Nether Fortress", NE],
  [/^bastion_/, "Bastion", NE],
  [/^end_city_treasure/, "End City", EN],
]);
/** Bekannte Tabellen, die keine Struktur sind (Bonustruhe, Geschenke der Dorfbewohner) – nicht als unbekannt melden */
const BEUTE_OHNE_ORT = /^(spawn_bonus_chest|hero_of_the_village\/|gameplay\/)/;

/* Spawner → Kategorie (Mob aus EntityIdentifier) */
export const SPAWNER = Object.freeze({
  zombie: ["Dungeon", OW], skeleton: ["Dungeon", OW], spider: ["Dungeon", OW],
  cave_spider: ["Mineshaft", OW], silverfish: ["Stronghold", OW],
  blaze: ["Nether Fortress", NE], magma_cube: ["Bastion", NE],
});

/* Ein Ort je Struktur: Funde derselben Kategorie, die näher als das hier beieinander liegen (X/Z), sind eine Struktur */
export const NAEHE = Object.freeze({
  Dungeon: 16, Treasure: 16, Igloo: 16, "Ruined Portal": 16, "Desert Well": 16,
  "Desert Temple": 48, "Jungle Temple": 48, Shipwreck: 48, "Ocean Ruins": 48, "Trail Ruins": 48, Outpost: 48,
  Mineshaft: 96, Village: 96, Mansion: 96, Bastion: 96, "Nether Fortress": 96, "End City": 96, "Trial Chamber": 96,
  "Ancient City": 160, Stronghold: 160,
});
export const PORTAL_NAEHE = 8;

/* Banner: Farbnummer (wie die Farbstoffe in Bedrock, 0 = Schwarz) → FARBEN, Muster-Kürzel → MUSTER */
export const BANNER_FARBEN = Object.freeze(["black", "red", "green", "brown", "blue", "purple", "cyan", "light_gray",
  "gray", "pink", "lime", "yellow", "light_blue", "magenta", "orange", "white"]);
export const BANNER_MUSTER = Object.freeze({
  bs: "stripe_bottom", ts: "stripe_top", ls: "stripe_left", rs: "stripe_right", cs: "stripe_center", ms: "stripe_middle",
  drs: "stripe_downright", dls: "stripe_downleft", ss: "small_stripes", cr: "cross", sc: "straight_cross",
  ld: "diagonal_left", rud: "diagonal_right", lud: "diagonal_up_left", rd: "diagonal_up_right",
  vh: "half_vertical", vhr: "half_vertical_right", hh: "half_horizontal", hhb: "half_horizontal_bottom",
  bl: "square_bottom_left", br: "square_bottom_right", tl: "square_top_left", tr: "square_top_right",
  bt: "triangle_bottom", tt: "triangle_top", bts: "triangles_bottom", tts: "triangles_top",
  mc: "circle", mr: "rhombus", bo: "border", cbo: "curly_border", bri: "bricks", gra: "gradient", gru: "gradient_up",
  cre: "creeper", sku: "skull", flo: "flower", moj: "mojang", glb: "globe", pig: "piglin", flw: "flow", gus: "guster",
});

/* Rüstung: Material im Item-Namen → RUESTUNGEN, Teil → RUESTUNGS_TEILE */
export const RUESTUNG_MATERIAL = Object.freeze({
  leather: "leather", chainmail: "chainmail", copper: "copper", iron: "iron", golden: "gold", diamond: "diamond", netherite: "netherite",
});
const RUESTUNG_ITEM = /^minecraft:(leather|chainmail|copper|iron|golden|diamond|netherite)_(helmet|chestplate|leggings|boots)$/;
/* Schmiedevorlagen → SAMMELOBJEKTE (gleiche IDs; Netheritaufwertung = „netherite“) */
const VORLAGE = /^minecraft:(?:([a-z]+)_armor_trim|(netherite)_upgrade)_smithing_template$/;

const BEHAELTER = Object.freeze({
  Chest: "Truhe", Barrel: "Fass", ShulkerBox: "Shulkerkiste", Dispenser: "Werfer", Dropper: "Spender", Hopper: "Trichter",
  "minecraft:chest_minecart": "Lore mit Truhe", "minecraft:chest_boat": "Boot mit Truhe", "minecraft:hopper_minecart": "Lore mit Trichter",
});

/* level.dat → Welt-Info */
const SPIELMODUS = Object.freeze({ 0: "survival", 1: "creative", 2: "adventure", 6: "spectator" });
const SCHWIERIGKEIT = Object.freeze({ 0: "peaceful", 1: "easy", 2: "normal", 3: "hard" });
const SPAWN_OBERFLAECHE = 32767;   // SpawnY: „auf der Oberfläche suchen“
const AUGENHOEHE = 1.62;           // Pos des Spielers liegt auf Augenhöhe (Testwelt: Pos 75,62, Füße auf y 74)

const tagName = (s) => (s.startsWith("minecraft:") ? s.slice(10) : s);
const ganz = (v) => (typeof v === "bigint" ? Number(v) : Number.isFinite(v) ? Math.floor(v) : null);
const schluesselText = (bytes) => String.fromCharCode(...bytes);
const zahlText = (n) => `${n < 0 ? "−" : ""}${Math.abs(n)}`;
export const ortText = (p) => `X ${zahlText(p.x)}${p.y != null ? ` · Y ${zahlText(p.y)}` : ""} · Z ${zahlText(p.z)}`;

/** Chunk-Schlüssel mit diesem Tag → { cx, cz, dim } oder null */
function chunkVon(keyBytes, tag) {
  const n = keyBytes.length;
  if ((n !== 9 && n !== 13) || keyBytes[n - 1] !== tag) return null;
  const dv = new DataView(keyBytes.buffer, keyBytes.byteOffset, n);
  const dim = n === 9 ? "overworld" : DIM_NUMMER[dv.getInt32(8, true)];
  if (!dim || dim === "overworld" && n === 13) return null;
  return { cx: dv.getInt32(0, true), cz: dv.getInt32(4, true), dim };
}

/** Beute-Tabelle → { kategorie, dims } | { ohneOrt:true } | null (unbekannt) */
export function beuteZuordnen(pfad) {
  const name = String(pfad).replace(/^loot_tables\//, "").replace(/^(chests|entities)\//, "").replace(/\.json$/, "");
  for (const [muster, kategorie, dims] of BEUTE) if (muster.test(name)) return { name, kategorie, dims };
  return BEUTE_OHNE_ORT.test(name) ? { name, ohneOrt: true } : { name, unbekannt: true };
}

/** Gegenstände durchsuchen (auch Shulkerkisten darin) → Schmiedevorlagen [id] */
function vorlagenIn(items, tiefe = 0) {
  const ids = [];
  if (!Array.isArray(items) || tiefe > 3) return ids;
  for (const it of items) {
    const m = typeof it?.Name === "string" && it.Count > 0 ? VORLAGE.exec(it.Name) : null;
    if (m) ids.push(m[1] ?? m[2]);
    if (Array.isArray(it?.tag?.Items)) ids.push(...vorlagenIn(it.tag.Items, tiefe + 1));
  }
  return ids;
}

/** Rüstungsteile aus einer Item-Liste (Reihenfolge egal, das Teil steht im Namen) → { teile, unbekannt } */
function ruestungAus(items) {
  const teile = { helmet: null, chestplate: null, leggings: null, boots: null };
  const unbekannt = [];
  for (const it of Array.isArray(items) ? items : []) {
    const name = typeof it?.Name === "string" ? it.Name : "";
    if (!name || !(it.Count > 0)) continue;
    let ruestung = null, teil = null;
    const m = RUESTUNG_ITEM.exec(name);
    if (m) { ruestung = RUESTUNG_MATERIAL[m[1]]; teil = m[2]; }
    else if (name === "minecraft:turtle_helmet") { ruestung = "turtle"; teil = "helmet"; }
    if (!teil) { if (/_(helmet|chestplate|leggings|boots)$/.test(name)) unbekannt.push(tagName(name)); continue; }
    const trim = it.tag?.Trim;
    const muster = typeof trim?.Pattern === "string" ? tagName(trim.Pattern) : null;
    const material = muster && typeof trim?.Material === "string" ? tagName(trim.Material) : null;
    const farbe = ruestung === "leather" && Number.isInteger(it.tag?.customColor)
      ? `#${(it.tag.customColor & 0xffffff).toString(16).padStart(6, "0")}` : null;
    teile[teil] = { ruestung, muster, material, lederfarbe: farbe };
  }
  return { teile, unbekannt };
}

/** Funde derselben Kategorie und Dimension zu Strukturen zusammenfassen (Nähe in X/Z, verkettet).
    Ein Verlies hat genau einen Spawner: Dort ist jeder Spawner ein Ort, Truhen gehören zum nächsten
    (in der Testwelt liegen zwei Verliese nur 16 Blöcke auseinander). */
const EIN_SPAWNER = new Set(["Dungeon"]);
const abstand = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function verketten(liste, naehe) {
  const eltern = liste.map((_, i) => i);
  const wurzel = (i) => (eltern[i] === i ? i : (eltern[i] = wurzel(eltern[i])));
  for (let i = 0; i < liste.length; i += 1) for (let j = i + 1; j < liste.length; j += 1) {
    if (abstand(liste[i], liste[j]) <= naehe) eltern[wurzel(i)] = wurzel(j);
  }
  const cluster = new Map();
  liste.forEach((k, i) => { const w = wurzel(i); if (!cluster.has(w)) cluster.set(w, []); cluster.get(w).push(k); });
  return [...cluster.values()];
}
function zuOrten(kandidaten) {
  const gruppen = new Map();
  for (const k of kandidaten) {
    const s = `${k.dim}|${k.kategorie}`;
    if (!gruppen.has(s)) gruppen.set(s, []);
    gruppen.get(s).push(k);
  }
  const orte = [];
  for (const liste of gruppen.values()) {
    const naehe = NAEHE[liste[0].kategorie] ?? 32;
    let cluster;
    if (EIN_SPAWNER.has(liste[0].kategorie)) {
      const spawner = liste.filter((k) => k.art === "spawner").map((k) => [k]);
      const rest = [];
      for (const k of liste.filter((x) => x.art !== "spawner")) {
        const naechster = spawner.reduce((best, s) => (abstand(s[0], k) <= naehe && (!best || abstand(s[0], k) < abstand(best[0], k)) ? s : best), null);
        if (naechster) naechster.push(k); else rest.push(k);
      }
      cluster = [...spawner, ...verketten(rest, naehe)];
    } else cluster = verketten(liste, naehe);
    for (const teile of cluster) {
      // Koordinate: der Spawner (Verlies), sonst der Fund, der dem Mittelpunkt am nächsten liegt – eine echte Blockposition
      const mx = teile.reduce((s, k) => s + k.x, 0) / teile.length, mz = teile.reduce((s, k) => s + k.z, 0) / teile.length;
      const mitte = teile.find((k) => k.art === "spawner")
        ?? teile.reduce((a, b) => (Math.hypot(b.x - mx, b.z - mz) < Math.hypot(a.x - mx, a.z - mz) ? b : a));
      const zaehlen = (art) => teile.filter((k) => k.art === art).length;
      orte.push({
        kategorie: mitte.kategorie, dim: mitte.dim, x: mitte.x, y: mitte.y, z: mitte.z,
        behaelter: zaehlen("behaelter"), spawner: zaehlen("spawner"), kies: zaehlen("kies"),
        tresore: zaehlen("tresor"), pruefspawner: zaehlen("pruefspawner"),
        mobs: [...new Set(teile.map((k) => k.mob).filter(Boolean))].sort(),
        beute: [...new Set(teile.map((k) => k.beute).filter(Boolean))].sort(),
      });
    }
  }
  const dimNr = (d) => ["overworld", "nether", "end"].indexOf(d);
  return orte.sort((a, b) => dimNr(a.dim) - dimNr(b.dim) || a.kategorie.localeCompare(b.kategorie) || a.x - b.x || a.z - b.z);
}

/** level.dat (Bytes oder schon gelesenes NBT) → Welt-Info */
export function weltInfo(levelDat) {
  const w = levelDat instanceof Uint8Array ? levelDatNbt(levelDat) : levelDat;
  const zeit = ganz(w.Time);
  const zuletzt = ganz(w.LastPlayed);
  const spawnY = ganz(w.SpawnY);
  return {
    spielmodus: SPIELMODUS[w.GameType] ?? null,
    schwierigkeit: SCHWIERIGKEIT[w.Difficulty] ?? null,
    tage: zeit != null && zeit >= 0 ? Math.floor(zeit / 24000) : null,
    spawn: Number.isInteger(w.SpawnX) && Number.isInteger(w.SpawnZ)
      ? { x: w.SpawnX, y: spawnY == null || spawnY === SPAWN_OBERFLAECHE ? null : spawnY, z: w.SpawnZ } : null,
    zuletztGespielt: zuletzt > 0 ? new Date(zuletzt * 1000).toISOString() : null,
    hardcore: w.IsHardcore === 1,
    cheats: w.cheatsEnabled === 1 || w.commandsEnabled === 1,
  };
}

/**
 * Sammler für einen Durchlauf. aufnehmen(keyBytes, value, geloescht) für jeden LevelDB-Eintrag in
 * der Reihenfolge des Lesens; levelDat(bytes) einmal; auswerten() am Ende → Funde:
 *   { orte:[{ kategorie, dim, x, y, z, behaelter, spawner, kies, tresore, pruefspawner, mobs, beute }],
 *     portale:[{ dim, x, y, z, achse, breite }],
 *     sammelobjekte:[{ id, wo:[Text] }],
 *     ruestung:[{ name, quelle:"spieler"|"staender", x?, z?, teile:{ helmet|chestplate|leggings|boots: { ruestung, muster, material, lederfarbe } | null } }],
 *     banner:[{ name, basis, ebenen:[{ muster, farbe }], dim, x, y, z }],
 *     spieler:{ dim, x, y, z, level } | null, andereSpieler, info,
 *     unbekannt:{ beute:[{ name, anzahl }], muster:[Kürzel], ruestung:[Item] },
 *     fehler }   Einträge, deren letzter Stand nicht lesbar ist (ihr Fund fehlt)
 */
export function fundeSammler() {
  const bloecke = new Map();   // Chunk-Schlüssel → gefilterte Block-Entities
  const wesen = new Map();     // Lebewesen-Schlüssel → gefiltertes Lebewesen
  const altWesen = new Map();  // alte Welten: Chunk-Schlüssel (Tag 50) → gefilterte Lebewesen
  const andere = new Set();    // player_… (andere Spieler, nur gezählt – Frage 2)
  const kaputt = new Set();    // Schlüssel, deren letzter Stand nicht lesbar ist (ein späterer Eintrag heilt)
  let spieler = null, portale = null, info = null, levelDatKaputt = false;

  /** Block-Entity behalten? → gefilterte Form oder null */
  function blockFiltern(b, dim) {
    const id = typeof b?.id === "string" ? b.id : "";
    const pos = { dim, x: ganz(b.x), y: ganz(b.y), z: ganz(b.z) };
    if (pos.x == null || pos.z == null) return null;
    const beute = typeof b.LootTable === "string" ? b.LootTable : null;
    const vorlagen = vorlagenIn(b.Items);
    if (id === "MobSpawner") return { art: "spawner", ...pos, mob: typeof b.EntityIdentifier === "string" ? tagName(b.EntityIdentifier) : null };
    if (id === "Vault" || id === "TrialSpawner") return { art: id === "Vault" ? "tresor" : "pruefspawner", ...pos };
    if (id === "Banner") {
      return { art: "banner", ...pos, basis: ganz(b.Base), unheilvoll: b.Type === 1,
        ebenen: (Array.isArray(b.Patterns) ? b.Patterns : []).map((p) => ({ kuerzel: String(p?.Pattern ?? ""), farbe: ganz(p?.Color) })) };
    }
    if (beute || vorlagen.length) return { art: id === "BrushableBlock" ? "kies" : "behaelter", ...pos, behaelter: BEHAELTER[id] ?? "Behälter", beute, vorlagen };
    return null;
  }

  /** Lebewesen behalten? → gefilterte Form oder null */
  function wesenFiltern(w) {
    const id = typeof w?.identifier === "string" ? w.identifier : "";
    const p = Array.isArray(w?.Pos) ? w.Pos : [];
    const pos = { x: ganz(p[0]), y: ganz(p[1]), z: ganz(p[2]) };
    if (id === "minecraft:armor_stand") {
      const r = ruestungAus(w.Armor);
      return Object.values(r.teile).some(Boolean) || r.unbekannt.length ? { art: "staender", ...pos, ...r } : null;
    }
    const beute = typeof w.LootTable === "string" ? w.LootTable : null;
    const vorlagen = vorlagenIn(w.Items);
    if (beute || vorlagen.length) return { art: "behaelter", ...pos, dim: null, behaelter: BEHAELTER[id] ?? "Behälter", beute, vorlagen };
    return null;
  }

  function spielerFiltern(s) {
    const p = Array.isArray(s?.Pos) ? s.Pos : [];
    const ort = p.length === 3 ? { x: Math.floor(p[0]), y: Math.floor(p[1] - AUGENHOEHE + 0.01), z: Math.floor(p[2]) } : null;
    return {
      dim: DIM_NUMMER[s?.DimensionId] ?? null, ...(ort ?? { x: null, y: null, z: null }),
      level: Number.isInteger(s?.PlayerLevel) ? s.PlayerLevel : null,
      inventar: vorlagenIn([...(s?.Inventory ?? []), ...(s?.Offhand ?? []), ...(s?.Mainhand ?? [])]),
      endertruhe: vorlagenIn(s?.EnderChestInventory),
      ruestung: ruestungAus(s?.Armor),
    };
  }

  function aufnehmen(keyBytes, value, geloescht) {
    const n = keyBytes?.length;
    if (!n || n > 64) return;   // alle gesuchten Schlüssel sind kurz
    const s = schluesselText(keyBytes);
    try {
      verarbeiten(keyBytes, s, value, geloescht);
      kaputt.delete(s);
    } catch {
      kaputt.add(s);   // ein kaputter Eintrag kostet nur seinen Fund, nicht den Import
    }
  }

  function verarbeiten(keyBytes, s, value, geloescht) {
    const n = keyBytes.length;
    let c;
    if ((c = chunkVon(keyBytes, 49))) {
      if (geloescht) { bloecke.delete(s); return; }
      bloecke.delete(s);
      const liste = nbtAlleLesen(value).map((b) => blockFiltern(b, c.dim)).filter(Boolean);
      if (liste.length) bloecke.set(s, liste);
      return;
    }
    if ((c = chunkVon(keyBytes, 50))) {
      if (geloescht) { altWesen.delete(s); return; }
      altWesen.delete(s);
      const liste = nbtAlleLesen(value).map(wesenFiltern).filter(Boolean).map((w) => ({ ...w, dim: c.dim }));
      if (liste.length) altWesen.set(s, liste);
      return;
    }
    if (n === 19 && s.startsWith("actorprefix")) {
      if (geloescht) { wesen.delete(s); return; }
      wesen.delete(s);
      const w = wesenFiltern(nbtLesen(value).wert);
      if (w) wesen.set(s, w);
      return;
    }
    if (s.startsWith("player_")) {   // andere Spieler (auch player_server_…)
      if (geloescht) andere.delete(s); else andere.add(s);
      return;
    }
    if (s === "~local_player") {
      spieler = null;
      if (!geloescht) spieler = spielerFiltern(nbtLesen(value).wert);
      return;
    }
    if (s === "portals") {
      portale = null;
      if (geloescht) return;
      const liste = nbtLesen(value).wert?.data?.PortalRecords;
      portale = (Array.isArray(liste) ? liste : []).map((p) => ({
        dim: DIM_NUMMER[p?.DimId] ?? null, x: ganz(p?.TpX), y: ganz(p?.TpY), z: ganz(p?.TpZ),
        achse: p?.Xa ? "x" : "z", breite: ganz(p?.Span),
      })).filter((p) => p.dim && p.dim !== "end" && p.x != null && p.z != null);
    }
  }

  function levelDat(bytes) {
    try { info = weltInfo(bytes); } catch { levelDatKaputt = true; }
  }

  function auswerten() {
    const bloeckeAlle = [...bloecke.values()].flat();
    const wesenAlle = [...wesen.values(), ...[...altWesen.values()].flat()];
    const unbekannteBeute = new Map(), unbekannteMuster = new Set(), unbekannteRuestung = new Set();
    const kandidaten = [];

    // Strukturen aus Beute-Tabellen (Behälter, Kies, Loren), Spawnern, Tresoren
    for (const b of [...bloeckeAlle, ...wesenAlle.filter((w) => w.art === "behaelter")]) {
      if (b.art === "spawner") {
        const z = SPAWNER[b.mob];
        if (z && z[1].includes(b.dim)) kandidaten.push({ ...b, kategorie: z[0] });
        continue;
      }
      if (b.art === "tresor" || b.art === "pruefspawner") {
        if (b.dim === "overworld") kandidaten.push({ ...b, kategorie: "Trial Chamber" });
        continue;
      }
      if (!b.beute) continue;
      const z = beuteZuordnen(b.beute);
      if (z.unbekannt) { unbekannteBeute.set(z.name, (unbekannteBeute.get(z.name) ?? 0) + 1); continue; }
      if (z.ohneOrt) continue;
      // Lebewesen kennen ihre Dimension nicht: nur Kategorien, die es in genau einer Dimension gibt
      const dim = b.dim ?? (z.dims.length === 1 ? z.dims[0] : null);
      if (dim && z.dims.includes(dim)) kandidaten.push({ ...b, dim, kategorie: z.kategorie, beute: z.name });
    }

    // Schmiedevorlagen: wo sie liegen
    const vorlagen = new Map();
    const merken = (ids, wo) => { for (const id of ids) { if (!vorlagen.has(id)) vorlagen.set(id, new Set()); vorlagen.get(id).add(wo); } };
    if (spieler) { merken(spieler.inventar, "Inventar"); merken(spieler.endertruhe, "Endertruhe"); }
    for (const b of [...bloeckeAlle, ...wesenAlle]) if (b.vorlagen?.length) merken(b.vorlagen, `${b.behaelter} bei ${ortText(b)}`);

    // Rüstung: was der Spieler trägt, was auf Rüstungsständern steht
    const ruestung = [];
    const datum = info?.zuletztGespielt ? new Date(info.zuletztGespielt).toLocaleDateString("de-DE", { day: "numeric", month: "numeric", timeZone: "UTC" }) : null;
    const setDazu = (r, name, quelle, ort) => {
      r.unbekannt.forEach((u) => unbekannteRuestung.add(u));
      if (Object.values(r.teile).some(Boolean)) ruestung.push({ name, quelle, ...ort, teile: r.teile });
    };
    if (spieler) setDazu(spieler.ruestung, `Getragene Rüstung${datum ? ` (${datum})` : ""}`, "spieler", {});
    for (const w of wesenAlle.filter((x) => x.art === "staender").sort((a, b) => a.x - b.x || a.z - b.z)) {
      setDazu(w, `Rüstungsständer bei X ${zahlText(w.x)} · Z ${zahlText(w.z)}`, "staender", { x: w.x, z: w.z });
    }

    // Banner (das Unheilvolle Banner der Plünderer bleibt weg)
    const banner = [];
    for (const b of bloeckeAlle.filter((x) => x.art === "banner" && !x.unheilvoll).sort((a, c) => a.x - c.x || a.z - c.z)) {
      const ebenen = [];
      for (const e of b.ebenen) {
        const muster = BANNER_MUSTER[e.kuerzel], farbe = BANNER_FARBEN[e.farbe];
        if (!muster || !farbe) { unbekannteMuster.add(e.kuerzel || "?"); continue; }
        ebenen.push({ muster, farbe });
      }
      banner.push({ name: `Banner bei X ${zahlText(b.x)} · Z ${zahlText(b.z)}`, basis: BANNER_FARBEN[b.basis] ?? null, ebenen,
        dim: b.dim, x: b.x, y: b.y, z: b.z });
    }

    const reihenfolge = (a, b) => a.localeCompare(b);
    return {
      orte: zuOrten(kandidaten),
      portale: (portale ?? []).slice().sort((a, b) => a.dim.localeCompare(b.dim) || a.x - b.x || a.z - b.z),
      sammelobjekte: [...vorlagen].map(([id, wo]) => ({ id, wo: [...wo].sort(reihenfolge) })).sort((a, b) => reihenfolge(a.id, b.id)),
      ruestung,
      banner,
      spieler: spieler ? { dim: spieler.dim, x: spieler.x, y: spieler.y, z: spieler.z, level: spieler.level } : null,
      andereSpieler: andere.size,
      info,
      unbekannt: {
        beute: [...unbekannteBeute].map(([name, anzahl]) => ({ name, anzahl })).sort((a, b) => b.anzahl - a.anzahl || reihenfolge(a.name, b.name)),
        muster: [...unbekannteMuster].sort(reihenfolge),
        ruestung: [...unbekannteRuestung].sort(reihenfolge),
      },
      fehler: kaputt.size + (levelDatKaputt ? 1 : 0),
    };
  }

  return { aufnehmen, levelDat, auswerten };
}
