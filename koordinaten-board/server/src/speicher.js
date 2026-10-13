// SQLite-Speicher für die Daten des Boards (Umbau Phase 4): node:sqlite (ab Node 22.13 ohne Flag), eine Datei
// daten.db im WAL-Modus. Je Sammlung eine Tabelle (id, version, reihenfolge, daten als JSON), dazu `werte`
// (Einstellungen, Zähler, Stand), `aenderungen` (fortlaufende Änderungsnummer je geschriebener Zeile) und
// die Biome je Welt (Import + eine Zeile je Kachel). daten.js hält die Daten weiter im Speicher und
// schreibt hier nur, was sich seit dem letzten Speichern geändert hat; so steigt `version` je Zeile.
import { DatabaseSync } from 'node:sqlite';

/** Sammlungen aus daten.js, die als Zeilen gespeichert werden (sammel als weltId|objektId) */
export const SAMMLUNGEN = ['benutzer', 'profile', 'geraete', 'welten', 'typen', 'instanzen', 'sammel', 'banner', 'ruestung', 'portale', 'anzeigen', 'zugaenge', 'anzeigeGeraete'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS werte (name TEXT PRIMARY KEY, wert TEXT NOT NULL);
${SAMMLUNGEN.map((t) => `CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, version INTEGER NOT NULL DEFAULT 1, reihenfolge INTEGER NOT NULL DEFAULT 0, daten TEXT NOT NULL);`).join('\n')}
CREATE TABLE IF NOT EXISTS aenderungen (nr INTEGER PRIMARY KEY AUTOINCREMENT, sammlung TEXT NOT NULL, id TEXT NOT NULL, version INTEGER, am TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS biome_import (welt_id TEXT PRIMARY KEY, daten TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS biome_kacheln (welt_id TEXT NOT NULL, dim TEXT NOT NULL, kx INTEGER NOT NULL, kz INTEGER NOT NULL, daten BLOB NOT NULL,
  PRIMARY KEY (welt_id, dim, kx, kz));
`;

/** Sammlung aus daten.inhalt → [id, Zeile als JSON] in Reihenfolge */
function zeilen(name, sammlung) {
  if (name === 'sammel') {
    return Object.entries(sammlung).flatMap(([weltId, status]) =>
      Object.entries(status).map(([objektId, s]) => [`${weltId}|${objektId}`, JSON.stringify({ weltId, objektId, ...s })]));
  }
  return sammlung.map((e) => [e.id, JSON.stringify(e)]);
}

export class Speicher {
  constructor(datei) {
    this.db = new DatabaseSync(datei);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');
    this.db.exec(SCHEMA);
    this.s = {
      wert: this.db.prepare('SELECT wert FROM werte WHERE name = ?'),
      wertSetzen: this.db.prepare('INSERT INTO werte (name, wert) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET wert = excluded.wert'),
      aenderung: this.db.prepare('INSERT INTO aenderungen (sammlung, id, version, am) VALUES (?, ?, ?, ?)'),
      letzteNr: this.db.prepare('SELECT COALESCE(MAX(nr), 0) AS nr FROM aenderungen'),
      biomImport: this.db.prepare('SELECT daten FROM biome_import WHERE welt_id = ?'),
      biomKacheln: this.db.prepare('SELECT dim, kx, kz, daten FROM biome_kacheln WHERE welt_id = ? ORDER BY dim, kx, kz'),
      biomImportSetzen: this.db.prepare('INSERT INTO biome_import (welt_id, daten) VALUES (?, ?) ON CONFLICT(welt_id) DO UPDATE SET daten = excluded.daten'),
      biomKachel: this.db.prepare('INSERT INTO biome_kacheln (welt_id, dim, kx, kz, daten) VALUES (?, ?, ?, ?, ?)'),
      biomImportWeg: this.db.prepare('DELETE FROM biome_import WHERE welt_id = ?'),
      biomKachelnWeg: this.db.prepare('DELETE FROM biome_kacheln WHERE welt_id = ?'),
    };
    for (const t of SAMMLUNGEN) {
      this.s[`${t}.alle`] = this.db.prepare(`SELECT id, version, daten FROM ${t} ORDER BY reihenfolge, rowid`);
      this.s[`${t}.neu`] = this.db.prepare(`INSERT INTO ${t} (id, version, reihenfolge, daten) VALUES (?, 1, ?, ?)`);
      this.s[`${t}.aendern`] = this.db.prepare(`UPDATE ${t} SET version = version + 1, reihenfolge = ?, daten = ? WHERE id = ? RETURNING version`);
      this.s[`${t}.ordnen`] = this.db.prepare(`UPDATE ${t} SET reihenfolge = ? WHERE id = ? AND reihenfolge <> ?`);
      this.s[`${t}.weg`] = this.db.prepare(`DELETE FROM ${t} WHERE id = ?`);
    }
  }

  /** Noch nie etwas gespeichert? Dann darf daten.json übernommen werden. */
  leer() {
    return this.wert('stand') === null;
  }

  wert(name) {
    const r = this.s.wert.get(name);
    return r ? JSON.parse(r.wert) : null;
  }

  wertSetzen(name, wert) {
    this.s.wertSetzen.run(name, JSON.stringify(wert));
  }

  /** Alle Sammlungen lesen → { sammlungen: { name: Einträge }, gespeichert: { name: Map(id → JSON) } } */
  lesen() {
    const sammlungen = {}, gespeichert = {};
    for (const t of SAMMLUNGEN) {
      const rows = this.s[`${t}.alle`].all();
      gespeichert[t] = new Map(rows.map((r) => [r.id, r.daten]));
      if (t === 'sammel') {
        sammlungen.sammel = {};
        for (const r of rows) {
          const { weltId, objektId, ...status } = JSON.parse(r.daten);
          (sammlungen.sammel[weltId] ??= {})[objektId] = status;
        }
      } else {
        sammlungen[t] = rows.map((r) => JSON.parse(r.daten));
      }
    }
    return { sammlungen, gespeichert };
  }

  /**
   * Schreibt, was sich seit `gespeichert` geändert hat (neu, geändert mit version + 1, gelöscht), hält die
   * Reihenfolge fest und trägt jede geschriebene Zeile in `aenderungen` ein.
   * → { gespeichert, nr: letzte Änderungsnummer, geschrieben: Anzahl Zeilen }
   */
  schreiben(inhalt, gespeichert = {}) {
    const am = new Date().toISOString();
    const neu = {};
    let geschrieben = 0;
    this.db.exec('BEGIN');
    try {
      for (const t of SAMMLUNGEN) {
        const vorher = gespeichert[t] ?? new Map();
        const jetzt = new Map();
        zeilen(t, inhalt[t]).forEach(([id, json], reihenfolge) => {
          jetzt.set(id, json);
          const alt = vorher.get(id);
          if (alt === json) { this.s[`${t}.ordnen`].run(reihenfolge, id, reihenfolge); return; }
          let version = 1;
          if (alt === undefined) this.s[`${t}.neu`].run(id, reihenfolge, json);
          else version = this.s[`${t}.aendern`].get(reihenfolge, json, id).version;
          this.s.aenderung.run(t, id, version, am);
          geschrieben += 1;
        });
        for (const id of vorher.keys()) {
          if (jetzt.has(id)) continue;
          this.s[`${t}.weg`].run(id);
          this.s.aenderung.run(t, id, null, am);
          geschrieben += 1;
        }
        neu[t] = jetzt;
      }
      this.wertSetzen('einstellungen', inhalt.einstellungen);
      this.wertSetzen('zaehler', inhalt.zaehler);
      this.wertSetzen('stand', am);
      this.db.exec('COMMIT');
    } catch (f) {
      this.db.exec('ROLLBACK');
      throw f;
    }
    return { gespeichert: neu, nr: this.s.letzteNr.get().nr, geschrieben };
  }

  /** Letzte Änderungsnummer (0, wenn nie geschrieben) */
  aenderungsNr() {
    return this.s.letzteNr.get().nr;
  }

  // ---------- Biome je Welt: Import + eine Zeile je Kachel ----------

  biomeLesen(weltId) {
    const imp = this.s.biomImport.get(weltId);
    if (!imp) return { import: null, kacheln: [] };
    const kacheln = this.s.biomKacheln.all(weltId).map((k) => ({ dim: k.dim, kx: k.kx, kz: k.kz, daten: Buffer.from(k.daten).toString('base64') }));
    return { import: JSON.parse(imp.daten), kacheln };
  }

  /** Ersetzt Import und alle Kacheln der Welt in einer Transaktion (daten der Kacheln: Base64 → BLOB) */
  biomeSetzen(weltId, imp, kacheln) {
    this.db.exec('BEGIN');
    try {
      this.s.biomKachelnWeg.run(weltId);
      this.s.biomImportSetzen.run(weltId, JSON.stringify(imp));
      for (const k of kacheln) this.s.biomKachel.run(weltId, k.dim, k.kx, k.kz, Buffer.from(k.daten, 'base64'));
      this.db.exec('COMMIT');
    } catch (f) {
      this.db.exec('ROLLBACK');
      throw f;
    }
  }

  biomeLoeschen(weltId) {
    this.db.exec('BEGIN');
    try {
      this.s.biomKachelnWeg.run(weltId);
      this.s.biomImportWeg.run(weltId);
      this.db.exec('COMMIT');
    } catch (f) {
      this.db.exec('ROLLBACK');
      throw f;
    }
  }

  /** Zahl der Zeilen je Tabelle, für Konsole und Umzugsskript */
  umfang() {
    const z = {};
    for (const t of [...SAMMLUNGEN, 'aenderungen', 'biome_import', 'biome_kacheln']) z[t] = this.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
    return z;
  }

  schliessen() {
    this.db.close();
  }
}
