// Sitzung einer Anzeige (Bauplan „Sitzung“, S1): die Widgets, die „Aufs Board“ während der
// Laufzeit auf eine Anzeige gelegt hat. Sie liegen nur im Speicher – nach einem Neustart ist
// die Sitzung leer, das gespeicherte Layout der Anzeige bleibt (Entscheidung E16).
//
// Nach außen erscheint die Sitzung als eigener Layer „sitzung“ im Layout der Anzeige
// (daten.js mischt ihn in anzeigeLayout() dazu und zieht ihn in anzeigeLayoutSetzen() wieder
// heraus). Dashboard und „Anzeige anordnen“ behandeln ihn wie jeden Layer: verschieben,
// Stufe wechseln, entfernen, Vollbild. Hinzugefügt wird nur über „Aufs Board“.
//
// Die erste freie Stelle rechnet der Server mit den Größen aus companion/widget-groessen.mjs,
// denselben, mit denen das Dashboard zeichnet.
import { randomUUID } from 'node:crypto';

export const SITZUNG_LAYER = 'sitzung';
export const SITZUNG_NAME = 'Sitzung';
export const KEIN_PLATZ = 'Kein Platz auf der Anzeige. In „Anzeige anordnen“ Platz schaffen.';

const kopie = (x) => structuredClone(x);

export class Sitzungen {
  /** groessen: das Modul widget-groessen.mjs (WIDGET_GROESSEN, rechtecke, ersteFreieStelle, STANDARD_REIHEN) */
  constructor(groessen) {
    this.groessen = groessen;
    this.je = new Map(); // anzeigeId → { instanzen: [{ id, typ, stufe, x, y, quelle?, von, farbe, am }], aktiv }
  }

  von(anzeigeId) {
    let s = this.je.get(anzeigeId);
    if (!s) {
      s = { instanzen: [], aktiv: false };
      this.je.set(anzeigeId, s);
    }
    return s;
  }

  /** Der Sitzungs-Layer fürs Layout der Anzeige (Kopie) */
  layer(anzeigeId) {
    return { id: SITZUNG_LAYER, name: SITZUNG_NAME, instanzen: kopie(this.von(anzeigeId).instanzen) };
  }

  /** Ist der Sitzungs-Layer gerade der aktive (zuletzt „Aufs Board“ oder am Handy gewählt)? */
  aktiv(anzeigeId) {
    return this.von(anzeigeId).aktiv;
  }

  hat(anzeigeId, instanzId) {
    return this.von(anzeigeId).instanzen.some((i) => i.id === instanzId);
  }

  /**
   * „Aufs Board“: Widget an der ersten freien Stelle der Sitzung, der Sitzungs-Layer wird aktiv.
   * Dieselbe Quelle ein zweites Mal legt kein zweites Widget an (idempotent).
   * → { instanz, neu } oder { fehler }
   */
  hinzufuegen(anzeigeId, { typ, quelle = '', von = '', farbe = '' }, reihen) {
    const s = this.von(anzeigeId);
    const da = s.instanzen.find((i) => i.typ === typ && (i.quelle ?? '') === quelle);
    if (da) {
      s.aktiv = true;
      return { instanz: kopie(da), neu: false };
    }
    const g = this.groessen.WIDGET_GROESSEN[typ];
    if (!g) return { fehler: `Unbekannter Widget-Typ „${typ}“` };
    const stelle = this.groessen.ersteFreieStelle(this.groessen.rechtecke(s.instanzen), reihen ?? this.groessen.STANDARD_REIHEN, g.stufen);
    if (!stelle) return { fehler: KEIN_PLATZ };
    const instanz = {
      id: randomUUID(), typ, stufe: stelle.stufe, x: stelle.x, y: stelle.y,
      ...(quelle ? { quelle } : {}),
      von, farbe, am: new Date().toISOString(),
    };
    s.instanzen.push(instanz);
    s.aktiv = true;
    return { instanz: kopie(instanz), neu: true };
  }

  /** „Wegnehmen“ – true, wenn es die Instanz gab */
  entfernen(anzeigeId, instanzId) {
    const s = this.von(anzeigeId);
    const vorher = s.instanzen.length;
    s.instanzen = s.instanzen.filter((i) => i.id !== instanzId);
    return s.instanzen.length < vorher;
  }

  /**
   * Vom Handy gespeichertes Layout übernehmen (Anzeige anordnen): Stufe und Position bekannter
   * Instanzen ändern, fehlende entfernen. Unbekannte IDs werden ignoriert – in die Sitzung
   * kommt man nur über „Aufs Board“. aktiv: ob der Sitzungs-Layer der aktive Layer ist.
   */
  uebernehmen(anzeigeId, instanzen, aktiv) {
    const s = this.von(anzeigeId);
    s.instanzen = instanzen
      .map((i) => {
        const alt = s.instanzen.find((a) => a.id === i.id);
        return alt ? { ...alt, stufe: i.stufe, x: i.x, y: i.y } : null;
      })
      .filter(Boolean);
    s.aktiv = Boolean(aktiv);
  }

  leeren(anzeigeId) {
    this.je.delete(anzeigeId);
  }
}
