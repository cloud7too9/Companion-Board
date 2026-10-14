// Gemeinsame Daten von Companion und Board: Welten, Orte (Typen + Instanzen), Sammelobjekte, Banner,
// Rüstungs-Sets, Portal-Verbindungen, Anzeigen, Accounts und die Einstellungen der Anzeige. Die Abläufe
// entsprechen dem DEMO-Mock der Companion (mockApi in companion-prototyp.html), geprüft wird mit denselben
// Regeln (companion/regeln.js).
// Gespeichert wird seit Umbau Phase 4 in SQLite (daten.db, speicher.js): Die Daten bleiben im Speicher,
// nach jeder Änderung wird kurz gewartet und dann geschrieben, was sich geändert hat (version je Zeile,
// fortlaufende Änderungsnummer). Die Biome des Welt-Imports liegen je Kachel in einer Zeile.
// Eine alte daten.json (und biome/<weltId>.json) wird beim ersten Start einmal übernommen und bleibt
// als Sicherung liegen (werkzeuge/nach-sqlite.mjs macht dasselbe von Hand).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { regeln, groessen } from './regeln.js';
import { layoutPruefen, reihenGueltig } from './layout.js';
import { WIDGETS, quelleZuWidget, widgetQuellen } from './widgets.js';
import { Sitzungen, SITZUNG_LAYER } from './sitzung.js';
import { Speicher } from './speicher.js';

const { DIM_ORDER, BIOMES, SAMMELOBJEKTE, WELTGRENZE } = regeln;

/** Fehler mit HTTP-Status, den die API 1:1 weitergibt */
export class DatenFehler extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fehler = (status, message) => { throw new DatenFehler(status, message); };

const STANDARD_EINSTELLUNGEN = { titel: 'Unsere Welt', qrZeigen: true, aktiveWelt: null };
const leer = () => ({
  zaehler: 0,
  // Identität (Strang B, Bauplan „Anmeldung“): Konten mit Passwort und PIN, Profile und Geräte. Feldnamen wie im
  // Referenzschema (planung/schema/): benutzer, geraete, zugaenge, anzeige_geraete.
  benutzer: [],      // { id, echterName, anzeigename, passwortHash, pinHash, pinGeaendertAm, freigegebenAm|null, freigegebenVon|null, rolle:"Besitzer", am }
  profile: [],       // { id, benutzerId, geteilt }
  geraete: [],       // { id, benutzerId, freigeschaltet, typ:"persoenlich"|"geteilt", profilId, freigeschaltetAm, letzterKontakt, pinBestaetigtAm, am }
  zugaenge: [],      // Dashboard-Zugänge: { id, code, pinHash, erstelltVon|null, erstelltAm, gueltigBis|null }
  anzeigeGeraete: [],// per Dashboard-Login angemeldete Anzeigen: { id, zugangId, anzeigeId|null, letzterKontakt }
  welten: [],        // { id, seed }
  typen: [],         // { id, kategorie, variante|null }   – welt-übergreifend
  instanzen: [],     // { id, dimensionId, featureTypeId, x, y|null, z, quelle, angeheftet, erledigt?:{ von, am }|null, von, am, geaendert? }
  sammel: {},        // { [weltId]: { [objektId]: { von, am } } }
  banner: [],        // { id, name, basis, ebenen, von, am }
  ruestung: [],      // { id, name, teile:{ helmet|chestplate|leggings|boots: { ruestung, muster, material, farbe }|null }, von, am }
  portale: [],       // { id, weltId, name, oberwelt, nether, von, am }
  anzeigen: [],      // { id, name, schluessel, am, reihen?, layout? } – Geräte, die als Anzeige laufen dürfen (Anzeige-Link), mit ihrem Widget-Layout
  einstellungen: { ...STANDARD_EINSTELLUNGEN },
});
/** Urheber eines Eintrags als stabile Benutzer-ID; `von` (Name) bleibt nur zur Anzeige.
    Einträge von vor den Accounts (B2) haben „unbekannt“. */
const ERSTELLER_UNBEKANNT = 'unbekannt';
/** Wer legt an: der angemeldete Nutzer ({ id, name } aus identitaet.js) oder – in Tests – nur ein Name */
const urheber = (nutzer) => (typeof nutzer === 'string'
  ? { von: nutzer, erstellerId: ERSTELLER_UNBEKANNT }
  : { von: nutzer?.name ?? '', erstellerId: nutzer?.id ?? ERSTELLER_UNBEKANNT });
/** Sammlungen mit Einträgen, die einen Ersteller haben */
const MIT_ERSTELLER = ['instanzen', 'banner', 'ruestung', 'portale'];

/** Zufälliger Anzeige-Schlüssel für den Link (URL-tauglich) */
const neuerSchluessel = () => randomBytes(18).toString('base64url');

const tag = () => new Date().toISOString().slice(0, 10);
function anzeigeName(body) {
  const name = String(body?.name ?? '').trim().slice(0, 40);
  if (!name) fehler(400, 'Bitte einen Namen für die Anzeige eingeben');
  return name;
}
const kopie = (x) => structuredClone(x);
const dimensionenVon = (welt) => DIM_ORDER.map((type) => ({ id: `d_${welt.id}_${type}`, worldId: welt.id, type }));
const ganz = (v) => Number.isInteger(v) && Math.abs(v) <= WELTGRENZE;

export class Daten {
  constructor(ordner) {
    this.ordner = ordner;
    this.datei = path.join(ordner, 'daten.json');       // alter Stand, nur noch zum Übernehmen
    this.dbDatei = path.join(ordner, 'daten.db');
    this.biomeOrdner = path.join(ordner, 'biome');      // alte Biom-Dateien, nur noch zum Übernehmen
    this.inhalt = leer();
    /** Sitzungen der Anzeigen (Bauplan „Sitzung“): Widgets von „Aufs Board“, nur im Speicher, nie in daten.db */
    this.sitzungen = new Sitzungen(groessen);
    /** Änderungsnummer: steigt mit jeder Änderung, läuft über Neustarts weiter (aenderungen.nr in daten.db) */
    this.version = 0;
    this.timer = null;
    this.gespeichertAm = null;  // letztes erfolgreiches Speichern (für /api/health)
    this.speicherFehler = null; // { am, text }, solange das verzögerte Speichern fehlschlägt
    this.speicher = null;       // SQLite, geöffnet beim Laden oder ersten Speichern
    this.gespeichert = {};      // je Sammlung: id → zuletzt geschriebene Zeile (JSON), für den Abgleich beim Speichern
  }

  /** daten.db öffnen (einmal); der Ordner entsteht bei Bedarf */
  oeffnen() {
    if (!this.speicher) {
      mkdirSync(this.ordner, { recursive: true });
      this.speicher = new Speicher(this.dbDatei);
    }
    return this.speicher;
  }

  async laden() {
    await mkdir(this.ordner, { recursive: true });
    const speicher = this.oeffnen();
    if (speicher.leer()) {
      await this.jsonUebernehmen();
    } else {
      const { sammlungen, gespeichert } = speicher.lesen();
      this.inhalt = { ...leer(), ...sammlungen, zaehler: speicher.wert('zaehler') ?? 0, einstellungen: { ...STANDARD_EINSTELLUNGEN, ...(speicher.wert('einstellungen') ?? {}) } };
      this.gespeichert = gespeichert;
      this.version = speicher.aenderungsNr();
    }
    this.erstellerNachtragen();
    this.kontenUmstellen();
    this.anzeigenSicherstellen();
  }

  /** Einmaliger Umzug (Umbau Phase 4): daten.json und biome/<weltId>.json → daten.db. Die JSON-Dateien bleiben als Sicherung. */
  async jsonUebernehmen() {
    let text;
    try {
      text = await readFile(this.datei, 'utf8');
      const roh = JSON.parse(text);
      this.inhalt = { ...leer(), ...roh, einstellungen: { ...STANDARD_EINSTELLUNGEN, ...roh.einstellungen } };
    } catch (f) {
      if (f.code !== 'ENOENT') console.warn('daten.json unlesbar, starte leer:', f.message);
      return;   // nichts zu übernehmen: leerer Start
    }
    await this.biomPunkteEntfernen(text);
    this.erstellerNachtragen();
    let importe = 0;
    for (const w of this.inhalt.welten) {
      try {
        const b = JSON.parse(await readFile(this.biomDateiAlt(w.id), 'utf8'));
        if (b.import) { this.speicher.biomeSetzen(w.id, b.import, b.kacheln ?? []); importe += 1; }
      } catch (f) {
        if (f.code !== 'ENOENT') console.warn(`Biome von ${w.id} unlesbar, nicht übernommen:`, f.message);
      }
    }
    await this.speichern();
    const eintraege = Object.values(this.speicher.umfang()).reduce((a, b) => a + b, 0);
    console.log(`  daten.json nach daten.db übernommen (${eintraege} Zeilen, ${importe} Welt-Importe). Die JSON-Dateien bleiben als Sicherung liegen.`);
  }

  /** Alte Einträge ohne erstellerId (vor Strang B) bekommen „unbekannt“ */
  erstellerNachtragen() {
    let geaendert = false;
    const nachtragen = (e) => { if (e && !e.erstellerId) { e.erstellerId = ERSTELLER_UNBEKANNT; geaendert = true; } };
    for (const name of MIT_ERSTELLER) this.inhalt[name].forEach(nachtragen);
    for (const status of Object.values(this.inhalt.sammel)) Object.values(status).forEach(nachtragen);
    if (geaendert) this.speichernVerzoegert();
  }

  /** Bauplan „Anmeldung“ (L16): Konten von vor der Anmeldung mit Passwort fallen weg, samt Profilen und Geräten.
      Alle legen sich neu an; was die alten Konten eingetragen haben, bleibt stehen (Ersteller „unbekannt“). */
  kontenUmstellen() {
    const alt = this.inhalt.benutzer.filter((b) => !b.passwortHash).map((b) => b.id);
    this.kontenEntfernen(alt);
    const bekannt = new Set(this.inhalt.benutzer.map((b) => b.id));
    const geraete = this.inhalt.geraete.filter((g) => bekannt.has(g.benutzerId));   // auch Geräte ohne Konto
    if (geraete.length !== this.inhalt.geraete.length) {
      this.inhalt.geraete = geraete;
      this.speichernVerzoegert();
    }
    if (alt.length) console.log(`  ${alt.length} alte Konten ohne Passwort entfernt – alle legen sich auf der Anmeldeseite neu an.`);
  }

  /** Biome kommen nur noch aus dem Welt-Import (regeln.js): alte Biom-Punkte aus Screenshots
      entfernen, vorher den alten Stand einmal als daten.vor-welt-import.json sichern. */
  async biomPunkteEntfernen(alterText) {
    const biomTypen = new Set(this.inhalt.typen.filter((t) => t.kategorie === BIOMES).map((t) => t.id));
    const weg = this.inhalt.instanzen.filter((i) => biomTypen.has(i.featureTypeId));
    if (!biomTypen.size) return;
    await writeFile(path.join(path.dirname(this.datei), 'daten.vor-welt-import.json'), alterText);
    this.inhalt.instanzen = this.inhalt.instanzen.filter((i) => !biomTypen.has(i.featureTypeId));
    this.inhalt.typen = this.inhalt.typen.filter((t) => !biomTypen.has(t.id));
    await this.speichern();
    console.log(`  ${weg.length} Biom-Punkte aus Screenshots entfernt – Biome kommen jetzt aus dem Welt-Import (Sicherung: daten.vor-welt-import.json).`);
  }

  speichernVerzoegert() {
    this.version += 1;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.speichern().catch((f) => {
      // Laut melden: Die Daten liegen dann nur noch im Speicher. /api/health antwortet 503, bis es wieder klappt.
      this.speicherFehler = { am: new Date().toISOString(), text: f.message };
      console.error('FEHLER beim Speichern in daten.db – Änderungen liegen nur im Speicher:', f);
    }), 300);
  }

  /** Schreibt, was sich seit dem letzten Mal geändert hat, in daten.db (eine Transaktion) */
  async speichern() {
    clearTimeout(this.timer);
    const { gespeichert, nr } = this.oeffnen().schreiben(this.inhalt, this.gespeichert);
    this.gespeichert = gespeichert;
    this.version = Math.max(this.version, nr);
    this.gespeichertAm = new Date().toISOString();
    this.speicherFehler = null;
  }

  /** Beim Beenden: ausstehende Änderungen schreiben und daten.db schließen */
  async schliessen() {
    await this.speichern();
    this.speicher?.schliessen();
    this.speicher = null;
  }

  neueId(praefix) {
    this.inhalt.zaehler += 1;
    return `${praefix}_${this.inhalt.zaehler}`;
  }

  /** ID eines neuen Eintrags: vom Handy (UUID, regeln.js) – geprüft und nicht doppelt – oder ohne vom Server */
  eintragId(body, praefix, liste) {
    if (body?.id == null) return this.neueId(praefix);
    if (!regeln.idGueltig(body.id)) fehler(400, 'Ungültige ID');
    if (liste.some((x) => x.id === body.id)) fehler(409, 'Diesen Eintrag gibt es schon');
    return body.id;
  }

  // ---------- Welten + Orte ----------

  welt(id) {
    return this.inhalt.welten.find((w) => w.id === id) ?? fehler(404, 'Welt nicht gefunden');
  }

  /** Welt, deren Orte die Anzeige zeigt: die eingestellte, sonst die erste */
  aktiveWelt() {
    const { welten, einstellungen } = this.inhalt;
    return welten.find((w) => w.id === einstellungen.aktiveWelt) ?? welten[0] ?? null;
  }

  /** Dimension zu einer id – { id, worldId, type } oder null */
  dimension(id) {
    const m = /^d_(.+)_(overworld|nether|end)$/.exec(String(id ?? ''));
    if (!m || !this.inhalt.welten.some((w) => w.id === m[1])) return null;
    return { id: m[0], worldId: m[1], type: m[2] };
  }

  instanzenVon(weltId) {
    return this.inhalt.instanzen.filter((i) => this.dimension(i.dimensionId)?.worldId === weltId);
  }

  weltenListe() {
    return this.inhalt.welten.map((w) => ({ ...w, anzahl: this.instanzenVon(w.id).length }));
  }

  weltAnlegen(body) {
    const seed = String(body?.seed ?? '').trim();
    if (!/^-?\d{1,20}$/.test(seed)) fehler(400, 'Seed muss eine Zahl sein');
    if (this.inhalt.welten.some((w) => w.seed === seed)) fehler(409, 'Diese Welt gibt es schon');
    const welt = { id: this.neueId('w'), seed };
    this.inhalt.welten.push(welt);
    this.speichernVerzoegert();
    return kopie(welt);
  }

  weltLesen(id) {
    const welt = this.welt(id);
    return {
      welt: kopie(welt),
      dimensionen: dimensionenVon(welt),
      typen: kopie(this.inhalt.typen),   // alle Typen: Varianten sind welt-übergreifend
      instanzen: kopie(this.instanzenVon(id)),
    };
  }

  typFinden(kategorie, variante) {
    return this.inhalt.typen.find((t) => t.kategorie === kategorie && (t.variante || null) === (variante || null));
  }

  instanzAnlegen(body, von) {
    const d = this.dimension(body?.dimensionId);
    if (!d) fehler(400, 'Dimension unbekannt');
    const variante = body.variante ? String(body.variante).trim().slice(0, 60) : null;
    const quelle = body.quelle === 'screenshot' || body.quelle === 'welt' ? body.quelle : 'manuell';
    const vorhanden = this.typFinden(body.kategorie, variante);
    const problem = regeln.instanzPruefen({ ...body, variante, quelle }, d.type, Boolean(vorhanden));
    if (problem) fehler(422, problem);
    const id = this.eintragId(body, 'i', this.inhalt.instanzen);
    let typ = vorhanden;
    if (!typ) {
      typ = { id: this.neueId('t'), kategorie: body.kategorie, variante };
      this.inhalt.typen.push(typ);
    }
    const instanz = {
      id, dimensionId: d.id, featureTypeId: typ.id,
      x: body.x, y: body.y ?? null, z: body.z, quelle, angeheftet: false, ...urheber(von), am: new Date().toISOString(),
    };
    this.inhalt.instanzen.push(instanz);
    this.speichernVerzoegert();
    return { instanz: kopie(instanz), typ: kopie(typ), weltId: d.worldId };
  }

  instanz(id) {
    return this.inhalt.instanzen.find((x) => x.id === id) ?? fehler(404, 'Ort nicht gefunden');
  }

  instanzAendern(id, body) {
    const i = this.instanz(id);
    if (!ganz(body?.x) || !ganz(body?.z) || (body.y != null && !ganz(body.y))) fehler(400, 'Ungültige Koordinaten');
    Object.assign(i, { x: body.x, y: body.y ?? null, z: body.z, geaendert: new Date().toISOString() });
    this.speichernVerzoegert();
    return { instanz: kopie(i), weltId: this.dimension(i.dimensionId)?.worldId };
  }

  /** Ort als erledigt markieren (Max, 05.10.2026): wer und wann; false nimmt es zurück */
  instanzErledigt(id, body, von) {
    const i = this.instanz(id);
    Object.assign(i, { erledigt: body?.erledigt ? { ...urheber(von), am: tag() } : null, geaendert: new Date().toISOString() });
    this.speichernVerzoegert();
    return { instanz: kopie(i), weltId: this.dimension(i.dimensionId)?.worldId };
  }

  /** Für die großen Karten der Anzeige */
  instanzAnheften(id, body) {
    const i = this.instanz(id);
    Object.assign(i, { angeheftet: Boolean(body?.angeheftet), geaendert: new Date().toISOString() });
    this.speichernVerzoegert();
    return { instanz: kopie(i), weltId: this.dimension(i.dimensionId)?.worldId };
  }

  instanzLoeschen(id) {
    const i = this.instanz(id);
    this.inhalt.instanzen.splice(this.inhalt.instanzen.indexOf(i), 1);
    this.speichernVerzoegert();
    return { weltId: this.dimension(i.dimensionId)?.worldId };
  }

  // ---------- Welt-Import: Biome je Welt (in daten.db, eine Zeile je Kachel) ----------

  /** Alte Datei des Welt-Imports (vor Umbau Phase 4), nur noch zum Übernehmen */
  biomDateiAlt(weltId) {
    return path.join(this.biomeOrdner, `${weltId.replace(/[^\w-]/g, '_')}.json`);
  }

  /** → { import: WeltImport | null, kacheln: [{ dim, kx, kz, daten }] } */
  async biomeLesen(weltId) {
    this.welt(weltId);
    return this.oeffnen().biomeLesen(weltId);
  }

  /** Ersetzt Import und alle Kacheln der Welt in einem Schritt → { import } */
  async biomeSetzen(weltId, body, von) {
    const problem = regeln.biomImportPruefen(body, this.welt(weltId));
    if (problem) fehler(422, problem);
    const sauber = regeln.biomImportSauber(body);
    const imp = { id: this.neueId('bi'), weltId, ...kopie(sauber.import), von: urheber(von).von, importiertAm: new Date().toISOString() };
    this.oeffnen().biomeSetzen(weltId, imp, sauber.kacheln);
    this.speichernVerzoegert();   // Zähler der IDs
    return { import: imp };
  }

  async biomeLoeschen(weltId) {
    this.welt(weltId);
    this.oeffnen().biomeLoeschen(weltId);
  }

  // ---------- Welt-Funde: viele Einträge in einem Rutsch (Bauplan „Welt-Funde“, W2) ----------

  /** Orte (quelle "welt"), Verbindungen, Sammelobjekte, Rüstungs-Sets und Banner aus dem Welt-Import anlegen.
      Jeder Eintrag geht durch dieselbe Methode wie bei seiner eigenen Route; was eine Regel ablehnt, kommt mit
      Meldung zurück, der Rest bleibt. Schon gefundene Sammelobjekte behalten von und am.
      → { angelegt:{ orte, verbindungen, sammelobjekte, ruestung, banner }, abgelehnt:[{ art, nr, meldung }] } */
  fundeAnlegen(weltId, body, von) {
    this.welt(weltId);
    const problem = regeln.fundePruefen(body);
    if (problem) fehler(422, problem);
    const angelegt = { orte: 0, verbindungen: 0, sammelobjekte: 0, ruestung: 0, banner: 0 };
    const abgelehnt = [];
    const je = (art, liste, anlegen) => (liste ?? []).forEach((eintrag, nr) => {
      try {
        if (anlegen(eintrag) !== false) angelegt[art] += 1;
      } catch (f) {
        if (!(f instanceof DatenFehler)) throw f;
        abgelehnt.push({ art, nr, meldung: f.message });
      }
    });
    je('orte', body.orte, (o) => {
      if (this.dimension(o?.dimensionId)?.worldId !== weltId) fehler(400, 'Dimension gehört nicht zu dieser Welt');
      this.instanzAnlegen({ ...o, quelle: 'welt' }, von);
    });
    je('verbindungen', body.verbindungen, (v) => this.portalAnlegen(weltId, v, von));
    je('sammelobjekte', body.sammelobjekte, (id) => {
      if (this.inhalt.sammel[weltId]?.[id]) return false;
      this.sammelSetzen(weltId, String(id), { gefunden: true }, von);
    });
    je('ruestung', body.ruestung, (s) => this.ruestungAnlegen(s, von));
    je('banner', body.banner, (b) => this.bannerAnlegen(b, von));
    return { angelegt, abgelehnt };
  }

  // ---------- Sammelobjekte ----------

  sammelLesen(weltId) {
    this.welt(weltId);
    return { status: kopie(this.inhalt.sammel[weltId] ?? {}) };
  }

  sammelSetzen(weltId, objektId, body, von) {
    this.welt(weltId);
    if (!SAMMELOBJEKTE.some((o) => o.id === objektId)) fehler(404, 'Unbekanntes Sammelobjekt');
    const status = (this.inhalt.sammel[weltId] ??= {});
    if (body?.gefunden) status[objektId] = { ...urheber(von), am: tag() };
    else delete status[objektId];
    this.speichernVerzoegert();
    return { status: kopie(status) };
  }

  // ---------- Portal-Verbindungen ----------

  portaleListe(weltId) {
    this.welt(weltId);
    return this.inhalt.portale.filter((v) => v.weltId === weltId).map(({ weltId: _w, ...v }) => kopie(v));
  }

  portal(id) {
    return this.inhalt.portale.find((x) => x.id === id) ?? fehler(404, 'Verbindung nicht gefunden');
  }

  portalAnlegen(weltId, body, von) {
    this.welt(weltId);
    const problem = regeln.verbindungRegelPruefen(body);
    if (problem) fehler(422, problem);
    const v = { id: this.eintragId(body, 'p', this.inhalt.portale), weltId, ...kopie(regeln.verbindungSauber(body)), ...urheber(von), am: tag() };
    this.inhalt.portale.push(v);
    this.speichernVerzoegert();
    const { weltId: _w, ...ohne } = v;
    return kopie(ohne);
  }

  portalAendern(id, body) {
    const v = this.portal(id);
    const problem = regeln.verbindungRegelPruefen(body);
    if (problem) fehler(422, problem);
    Object.assign(v, kopie(regeln.verbindungSauber(body)));
    this.speichernVerzoegert();
    const { weltId, ...ohne } = v;
    return { verbindung: kopie(ohne), weltId };
  }

  portalLoeschen(id) {
    const v = this.portal(id);
    this.inhalt.portale.splice(this.inhalt.portale.indexOf(v), 1);
    this.speichernVerzoegert();
    return { weltId: v.weltId };
  }

  // ---------- Banner (für alle Welten) ----------

  bannerListe() {
    return kopie(this.inhalt.banner);
  }

  bannerStueck(id) {
    return this.inhalt.banner.find((x) => x.id === id) ?? fehler(404, 'Banner nicht gefunden');
  }

  bannerAnlegen(body, von) {
    const problem = regeln.bannerPruefen(body);
    if (problem) fehler(422, problem);
    const b = { id: this.eintragId(body, 'b', this.inhalt.banner), ...kopie(regeln.bannerSauber(body)), ...urheber(von), am: tag() };
    this.inhalt.banner.unshift(b);
    this.speichernVerzoegert();
    return kopie(b);
  }

  bannerAendern(id, body) {
    const b = this.bannerStueck(id);
    const problem = regeln.bannerPruefen(body);
    if (problem) fehler(422, problem);
    Object.assign(b, kopie(regeln.bannerSauber(body)));
    this.speichernVerzoegert();
    return kopie(b);
  }

  bannerLoeschen(id) {
    const b = this.bannerStueck(id);
    this.inhalt.banner.splice(this.inhalt.banner.indexOf(b), 1);
    this.speichernVerzoegert();
  }

  // ---------- Rüstungs-Sets (für alle Welten) ----------

  ruestungListe() {
    return kopie(this.inhalt.ruestung);
  }

  ruestungSet(id) {
    return this.inhalt.ruestung.find((x) => x.id === id) ?? fehler(404, 'Rüstungs-Set nicht gefunden');
  }

  ruestungAnlegen(body, von) {
    const problem = regeln.ruestungPruefen(body);
    if (problem) fehler(422, problem);
    const s = { id: this.eintragId(body, 'r', this.inhalt.ruestung), ...kopie(regeln.ruestungSauber(body)), ...urheber(von), am: tag() };
    this.inhalt.ruestung.unshift(s);
    this.speichernVerzoegert();
    return kopie(s);
  }

  ruestungAendern(id, body) {
    const s = this.ruestungSet(id);
    const problem = regeln.ruestungPruefen(body);
    if (problem) fehler(422, problem);
    Object.assign(s, kopie(regeln.ruestungSauber(body)));
    this.speichernVerzoegert();
    return kopie(s);
  }

  ruestungLoeschen(id) {
    const s = this.ruestungSet(id);
    this.inhalt.ruestung.splice(this.inhalt.ruestung.indexOf(s), 1);
    this.speichernVerzoegert();
  }

  // ---------- Anzeigen: Geräte mit Anzeige-Link ----------

  /** Beim ersten Start gibt es eine Anzeige „Board“; ihr Link steht in der Konsole und in daten/anzeige-link.txt */
  anzeigenSicherstellen() {
    if (this.inhalt.anzeigen.length) return;
    this.inhalt.anzeigen.push({ id: this.neueId('a'), name: 'Board', schluessel: neuerSchluessel(), am: new Date().toISOString() });
    this.speichernVerzoegert();
  }

  /** Anzeigen ohne Layout (das holt man einzeln), reihen: null, solange sie sich nicht gemeldet hat */
  anzeigenListe() {
    return this.inhalt.anzeigen.map(({ layout: _l, vollbild: _v, ...a }) => ({ ...kopie(a), reihen: a.reihen ?? null }));
  }

  anzeige(id) {
    return this.inhalt.anzeigen.find((a) => a.id === id) ?? fehler(404, 'Anzeige nicht gefunden');
  }

  anzeigeAnlegen(body) {
    const a = { id: this.neueId('a'), name: anzeigeName(body), schluessel: neuerSchluessel(), am: new Date().toISOString() };
    this.inhalt.anzeigen.push(a);
    this.speichernVerzoegert();
    return kopie(a);
  }

  /**
   * Kopie einer Anzeige für ein weiteres Anzeige-Gerät (Bauplan „Anmeldung“, AN4: Layout und Raster je Gerät):
   * das gespeicherte Layout (ohne Sitzung, ohne Vollbild), eigene Reihen, eigener Schlüssel. Name „Board 2“,
   * „Board 3“ … – aus „Board 2“ wird wieder „Board 3“, nicht „Board 2 2“.
   */
  anzeigeKopieren(id) {
    const vorlage = this.anzeige(id);
    const namen = new Set(this.inhalt.anzeigen.map((a) => a.name));
    const ohneNummer = vorlage.name.replace(/ \d+$/, '');
    const basis = (ohneNummer !== vorlage.name && namen.has(ohneNummer) ? ohneNummer : vorlage.name).slice(0, 36);
    let n = 2;
    while (namen.has(`${basis} ${n}`)) n += 1;
    const a = { id: this.neueId('a'), name: `${basis} ${n}`, schluessel: neuerSchluessel(), am: new Date().toISOString(),
      ...(vorlage.layout ? { layout: kopie(vorlage.layout) } : {}) };
    this.inhalt.anzeigen.push(a);
    this.speichernVerzoegert();
    return kopie(a);
  }

  anzeigeUmbenennen(id, body) {
    const a = this.anzeige(id);
    a.name = anzeigeName(body);
    this.speichernVerzoegert();
    return kopie(a);
  }

  /** Neuer Schlüssel – alte Links gelten danach nicht mehr */
  anzeigeSchluesselNeu(id) {
    const a = this.anzeige(id);
    a.schluessel = neuerSchluessel();
    this.speichernVerzoegert();
    return kopie(a);
  }

  /** Layout einer Anzeige: { anzeige, reihen, layout, vollbild } – layout null, solange keins gespeichert ist
      und die Sitzung leer ist; sonst das gespeicherte Layout, und sobald die Sitzung ein Widget hat, mit dem
      Sitzungs-Layer an erster Stelle (Bauplan „Sitzung“; aktiv ist er, wenn „Aufs Board“ ihn zuletzt aktiv
      gemacht hat oder das Handy ihn gewählt hat);
      vollbild: ID des Widgets, das die Anzeige gerade allein zeigt (vom Handy gestartet), sonst null */
  anzeigeLayout(id) {
    const a = this.anzeige(id);
    return { anzeige: { id: a.id, name: a.name }, reihen: a.reihen ?? null, layout: this.layoutMitSitzung(a), vollbild: a.vollbild ?? null };
  }

  layoutMitSitzung(a) {
    const sitzung = this.sitzungen.layer(a.id);
    const mitSitzung = sitzung.instanzen.length > 0;
    if (!a.layout && !mitSitzung) return null;
    const layer = [...(mitSitzung ? [sitzung] : []), ...kopie(a.layout?.layer ?? [])];
    const aktiverLayer = mitSitzung && (this.sitzungen.aktiv(a.id) || !a.layout) ? SITZUNG_LAYER : a.layout.aktiverLayer;
    return { layer, aktiverLayer };
  }

  /** Vom Handy gespeichertes Layout: der Sitzungs-Layer geht in die Sitzung (Speicher), der Rest nach daten.db */
  anzeigeLayoutSetzen(id, body) {
    const a = this.anzeige(id);
    const { layout, fehler: problem } = layoutPruefen(body, Object.keys(WIDGETS));
    if (problem) fehler(422, problem);
    const sitzung = layout.layer.find((l) => l.id === SITZUNG_LAYER);
    const gespeichert = layout.layer.filter((l) => l.id !== SITZUNG_LAYER);
    if (sitzung) this.sitzungen.uebernehmen(a.id, sitzung.instanzen, layout.aktiverLayer === SITZUNG_LAYER);
    else if (layout.aktiverLayer !== SITZUNG_LAYER) this.sitzungen.uebernehmen(a.id, this.sitzungen.layer(a.id).instanzen, false);
    a.layout = gespeichert.length
      ? { layer: gespeichert, aktiverLayer: gespeichert.some((l) => l.id === layout.aktiverLayer) ? layout.aktiverLayer : gespeichert[0].id }
      : null;
    // Ein Vollbild endet, wenn sein Widget nicht mehr im aktiven Layer liegt
    if (a.vollbild && !this.imAktivenLayer(a, a.vollbild)) a.vollbild = null;
    this.speichernVerzoegert();
    return this.anzeigeLayout(id);
  }

  imAktivenLayer(a, instanzId) {
    const layout = this.layoutMitSitzung(a);
    const layer = layout?.layer.find((l) => l.id === layout.aktiverLayer);
    return Boolean(layer?.instanzen.some((i) => i.id === instanzId));
  }

  /**
   * „Aufs Board“ (Bauplan „Sitzung“): Quelle („portal:<id>“, „sammelstand“ …) als Widget an der ersten
   * freien Stelle der Sitzung dieser Anzeige. → { instanz, neu }; Fehler 400 (Quelle unbekannt),
   * 404 (Anzeige oder Quelle gibt es nicht), 409 (kein Platz).
   */
  sitzungHinzufuegen(anzeigeId, { quelle, nutzer }) {
    const a = this.anzeige(anzeigeId);
    const ziel = quelleZuWidget(quelle);
    if (!ziel) fehler(400, `Unbekannte Quelle „${quelle}“`);
    if (ziel.quelle && !widgetQuellen(this, ziel.typ).quellen.some((q) => q.id === ziel.quelle)) {
      // Gibt es die Quelle in einer anderen Welt? Dann zeigt die Anzeige gerade nicht die Welt des Handys
      const andereWelt = this.inhalt.instanzen.some((i) => i.id === ziel.quelle) || this.inhalt.portale.some((v) => v.id === ziel.quelle);
      fehler(andereWelt ? 409 : 404, andereWelt ? 'Die Anzeige zeigt eine andere Welt. Unter Board → „Welt auf der Anzeige“ umstellen.' : 'Die Quelle gibt es nicht mehr');
    }
    const ergebnis = this.sitzungen.hinzufuegen(a.id, { typ: ziel.typ, quelle: ziel.quelle, herkunft: quelle, von: nutzer?.name ?? '', farbe: nutzer?.farbe ?? '' }, a.reihen ?? null);
    if (ergebnis.fehler) fehler(409, ergebnis.fehler);
    return ergebnis;
  }

  /** „Wegnehmen“ – true, wenn das Widget in der Sitzung lag */
  sitzungEntfernen(anzeigeId, instanzId) {
    const a = this.anzeige(anzeigeId);
    const weg = this.sitzungen.entfernen(a.id, instanzId);
    if (weg && a.vollbild === instanzId) a.vollbild = null;
    return weg;
  }

  /** Vollbild an der Anzeige starten (ID eines Widgets im aktiven Layer) oder beenden (null) */
  anzeigeVollbildSetzen(id, instanzId) {
    const a = this.anzeige(id);
    if (instanzId != null && (typeof instanzId !== 'string' || !this.imAktivenLayer(a, instanzId))) {
      fehler(422, 'Dieses Widget liegt nicht im aktiven Layer der Anzeige');
    }
    a.vollbild = instanzId ?? null;
    this.speichernVerzoegert();
    return this.anzeigeLayout(id);
  }

  /** Eine Anzeige meldet, wie viele Reihen auf ihren Bildschirm passen – true, wenn sich etwas geändert hat */
  anzeigeReihenSetzen(id, reihen) {
    const a = this.anzeige(id);
    if (!reihenGueltig(reihen)) fehler(400, 'Reihen müssen eine ganze Zahl von 1 bis 200 sein');
    if (a.reihen === reihen) return false;
    a.reihen = reihen;
    this.speichernVerzoegert();
    return true;
  }

  /** Anzeige zu id + Schlüssel aus dem Link, sonst null (Vergleich in konstanter Zeit) */
  anzeigeMitSchluessel(id, schluessel) {
    const a = this.inhalt.anzeigen.find((x) => x.id === id);
    if (!a || typeof schluessel !== 'string') return null;
    const soll = Buffer.from(a.schluessel), ist = Buffer.from(schluessel);
    return soll.length === ist.length && timingSafeEqual(soll, ist) ? kopie(a) : null;
  }

  // ---------- Konten und Geräte (Bauplan „Anmeldung“, Abläufe in identitaet.js) ----------

  /** Alle Konten ohne Hashes, mit echtem Namen (sichtbar für alle Konten, L18) */
  kontenListe() {
    const name = (id) => this.benutzer(id)?.anzeigename ?? null;
    return this.inhalt.benutzer.map((b) => ({
      id: b.id, anzeigename: b.anzeigename, echterName: b.echterName, am: b.am,
      freigegebenAm: b.freigegebenAm ?? null, freigegebenVon: b.freigegebenVon ? name(b.freigegebenVon) : null,
    }));
  }

  benutzer(id) {
    return this.inhalt.benutzer.find((b) => b.id === id) ?? null;
  }

  /** Konto zu einem Anzeigenamen, ohne Groß-/Kleinschreibung (der Name ist eindeutig) */
  benutzerMitName(name) {
    const gesucht = regeln.anzeigenameSauber(name).toLocaleLowerCase('de');
    return this.inhalt.benutzer.find((b) => b.anzeigename.toLocaleLowerCase('de') === gesucht) ?? null;
  }

  /** Neues Konto. Es wartet auf Freigabe (L19) – außer es ist das erste: dann gibt es niemanden, der freigeben könnte (⚠ AN14). */
  benutzerAnlegen({ echterName, anzeigename, passwortHash, pinHash, am }) {
    if (this.benutzerMitName(anzeigename)) fehler(409, `Den Namen „${anzeigename}“ gibt es schon`);
    const erstes = !this.inhalt.benutzer.some((b) => b.freigegebenAm);
    const b = {
      id: randomUUID(), echterName, anzeigename, passwortHash, pinHash, pinGeaendertAm: am,
      freigegebenAm: erstes ? am : null, freigegebenVon: null, rolle: 'Besitzer', am,
    };
    this.inhalt.benutzer.push(b);
    this.speichernVerzoegert();
    return kopie(b);
  }

  benutzerAendern(id, felder) {
    const b = this.benutzer(id) ?? fehler(404, 'Konto unbekannt');
    Object.assign(b, felder);
    this.speichernVerzoegert();
    return kopie(b);
  }

  /** Wartendes Konto freigeben; ein schon freigegebenes bleibt, wie es ist */
  kontoFreigeben(id, vonId, am) {
    const b = this.benutzer(id) ?? fehler(404, 'Konto unbekannt');
    if (!b.freigegebenAm) {
      Object.assign(b, { freigegebenAm: am, freigegebenVon: vonId });
      this.speichernVerzoegert();
    }
    return this.kontenListe().find((k) => k.id === id);
  }

  /** Wartendes Konto ablehnen = löschen (nur solange es wartet) */
  kontoAblehnen(id) {
    const b = this.benutzer(id) ?? fehler(404, 'Konto unbekannt');
    if (b.freigegebenAm) fehler(409, 'Nur wartende Konten lassen sich ablehnen');
    this.kontenEntfernen([id]);
  }

  /** Konten samt Profilen und Geräten entfernen. Ihre Einträge bleiben, der Ersteller wird „unbekannt“,
      der Name in `von` bleibt stehen (wie im Referenzschema: ON DELETE SET NULL). */
  kontenEntfernen(ids) {
    if (!ids.length) return;
    const weg = new Set(ids);
    const profile = new Set(this.inhalt.profile.filter((p) => weg.has(p.benutzerId)).map((p) => p.id));
    this.inhalt.benutzer = this.inhalt.benutzer.filter((b) => !weg.has(b.id));
    this.inhalt.profile = this.inhalt.profile.filter((p) => !profile.has(p.id));
    this.inhalt.geraete = this.inhalt.geraete.filter((g) => !weg.has(g.benutzerId) && !profile.has(g.profilId));
    const unbekannt = (e) => { if (e && weg.has(e.erstellerId)) e.erstellerId = ERSTELLER_UNBEKANNT; };
    for (const name of MIT_ERSTELLER) this.inhalt[name].forEach(unbekannt);
    this.inhalt.instanzen.forEach((i) => unbekannt(i.erledigt));
    for (const status of Object.values(this.inhalt.sammel)) Object.values(status).forEach(unbekannt);
    for (const z of this.inhalt.zugaenge) if (weg.has(z.erstelltVon)) z.erstelltVon = null;
    this.speichernVerzoegert();
  }

  /** Neues Gerät bei der ersten Anmeldung mit Passwort; ein persönliches Profil entsteht beim ersten Gerät */
  geraetAnlegen(benutzerId, am, typ = 'persoenlich') {
    let profil = this.inhalt.profile.find((p) => p.benutzerId === benutzerId && !p.geteilt);
    if (!profil) {
      profil = { id: randomUUID(), benutzerId, geteilt: false };
      this.inhalt.profile.push(profil);
    }
    const g = {
      id: randomUUID(), benutzerId, freigeschaltet: true, typ, profilId: profil.id,
      freigeschaltetAm: am, letzterKontakt: am, pinBestaetigtAm: am, am,
    };
    this.inhalt.geraete.push(g);
    this.speichernVerzoegert();
    return kopie(g);
  }

  geraet(id) {
    const g = this.inhalt.geraete.find((x) => x.id === id);
    return g ? kopie(g) : null;
  }

  /** Felder eines Geräts setzen (letzterKontakt, pinBestaetigtAm); unbekanntes Gerät → null */
  geraetAendern(id, felder) {
    const g = this.inhalt.geraete.find((x) => x.id === id);
    if (!g) return null;
    Object.assign(g, felder);
    this.speichernVerzoegert();
    return kopie(g);
  }

  geraetEntfernen(id) {
    const vorher = this.inhalt.geraete.length;
    this.inhalt.geraete = this.inhalt.geraete.filter((g) => g.id !== id);
    if (this.inhalt.geraete.length !== vorher) this.speichernVerzoegert();
  }

  /** Konto hinter einem freigeschalteten Gerät, sonst null */
  benutzerVonGeraet(geraetId) {
    const g = this.inhalt.geraete.find((x) => x.id === geraetId);
    return g?.freigeschaltet ? this.benutzer(g.benutzerId) : null;
  }

  // ---------- Dashboard-Zugänge und Anzeige-Geräte (Bauplan „Anmeldung“, L4; Abläufe in dashboard-zugang.js) ----------

  zugaengeListe() {
    return kopie(this.inhalt.zugaenge);
  }

  zugang(id) {
    const z = this.inhalt.zugaenge.find((x) => x.id === id);
    return z ? kopie(z) : null;
  }

  /** Zugang zu einem Code; Groß- und Kleinschreibung zählt */
  zugangMitCode(code) {
    const z = this.inhalt.zugaenge.find((x) => x.code === code);
    return z ? kopie(z) : null;
  }

  zugangAnlegen({ code, pinHash, erstelltVon, erstelltAm, gueltigBis }) {
    if (this.inhalt.zugaenge.some((z) => z.code === code)) fehler(409, 'Diesen Code gibt es schon');
    const z = { id: randomUUID(), code, pinHash, erstelltVon, erstelltAm, gueltigBis };
    this.inhalt.zugaenge.unshift(z);
    this.speichernVerzoegert();
    return kopie(z);
  }

  /** Widerrufen: der Zugang ist weg, alle damit angemeldeten Anzeigen auch (AN5) → IDs der abgemeldeten Anzeige-Geräte */
  zugangWiderrufen(id) {
    if (!this.inhalt.zugaenge.some((z) => z.id === id)) fehler(404, 'Zugang nicht gefunden');
    const weg = this.inhalt.anzeigeGeraete.filter((a) => a.zugangId === id).map((a) => a.id);
    this.inhalt.zugaenge = this.inhalt.zugaenge.filter((z) => z.id !== id);
    this.inhalt.anzeigeGeraete = this.inhalt.anzeigeGeraete.filter((a) => a.zugangId !== id);
    this.speichernVerzoegert();
    return weg;
  }

  anzeigeGeraeteListe() {
    return kopie(this.inhalt.anzeigeGeraete);
  }

  anzeigeGeraet(id) {
    const a = this.inhalt.anzeigeGeraete.find((x) => x.id === id);
    return a ? kopie(a) : null;
  }

  anzeigeGeraetAnlegen({ zugangId, letzterKontakt }) {
    const a = { id: randomUUID(), zugangId, anzeigeId: null, letzterKontakt };
    this.inhalt.anzeigeGeraete.push(a);
    this.speichernVerzoegert();
    return kopie(a);
  }

  /** Felder setzen (anzeigeId, letzterKontakt); unbekanntes Gerät → null */
  anzeigeGeraetAendern(id, felder) {
    const a = this.inhalt.anzeigeGeraete.find((x) => x.id === id);
    if (!a) return null;
    Object.assign(a, felder);
    this.speichernVerzoegert();
    return kopie(a);
  }

  anzeigeGeraetEntfernen(id) {
    const vorher = this.inhalt.anzeigeGeraete.length;
    this.inhalt.anzeigeGeraete = this.inhalt.anzeigeGeraete.filter((a) => a.id !== id);
    if (this.inhalt.anzeigeGeraete.length !== vorher) this.speichernVerzoegert();
  }

  // ---------- Einstellungen der Anzeige ----------

  einstellungenLesen() {
    return { ...kopie(this.inhalt.einstellungen), aktiv: this.aktiveWelt()?.id ?? null };
  }

  einstellungenAendern(felder = {}) {
    const e = this.inhalt.einstellungen;
    if ('titel' in felder) e.titel = String(felder.titel ?? '').trim().slice(0, 60) || STANDARD_EINSTELLUNGEN.titel;
    if ('qrZeigen' in felder) e.qrZeigen = Boolean(felder.qrZeigen);
    if ('aktiveWelt' in felder) {
      if (felder.aktiveWelt !== null) this.welt(felder.aktiveWelt);
      e.aktiveWelt = felder.aktiveWelt;
    }
    this.speichernVerzoegert();
    return this.einstellungenLesen();
  }
}
