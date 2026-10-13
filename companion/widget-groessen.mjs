// Größenstufen aller Widget-Typen und die Passt-Prüfung des Rasters – eine Datei für
// Server und Dashboard (Bauplan „Sitzung“, S1): Der Server braucht sie, um für „Aufs Board“
// die erste freie Stelle in der Sitzung zu finden; das Dashboard (companion/widgets) nimmt
// seine Stufen von hier statt aus eigenen Zahlen. So wird nichts doppelt gepflegt.
//
// ES-Modul (.mjs): Node lädt es mit import(), Vite bündelt es ins Dashboard. Die Companion-
// Seite am Handy braucht es nicht, sie berechnet keine Positionen.
//
// Die Stufen sind Platzhalter, bis die Planungsrunde A7 die Größen festlegt (siehe
// planung/WARTELISTE.md, E6). Namen, Bereiche und Quellen der Typen stehen weiter im
// Register des Dashboards (widget-register.ts); hier nur, was das Raster braucht.

export const RASTER_SPALTEN = 32;
/** Reihen, solange eine Anzeige ihre Fläche noch nicht gemeldet hat (16:9 wie ein Fernseher) */
export const STANDARD_REIHEN = 18;

const stufe = (name, breite, hoehe, informationsumfang) => ({ name, breite, hoehe, informationsumfang });
const platzhalter = (breite, hoehe, informationsumfang) => [stufe('standard', breite, hoehe, informationsumfang)];

/** Widget-Typ → { stufen: [{ name, breite, hoehe, informationsumfang }], vollbild? }; die erste Stufe ist die Standardstufe */
export const WIDGET_GROESSEN = Object.freeze({
  'karte.gesamtkarte': { stufen: [stufe('standard', 12, 8, 'Karte mit Markern, ausrichtbar auf Punkt oder Koordinate')], vollbild: true },
  'karte.einzelkoordinate': { stufen: platzhalter(6, 4, 'eine Koordinate mit Umrechnung') },
  'karte.koordinatensammlung': { stufen: platzhalter(8, 6, 'mehrere Koordinaten einer Sammlung') },
  'sammelobjekte.gesamtauflistung': { stufen: [stufe('standard', 8, 8, 'alle Sammelobjekte mit Stand')] },
  'sammelobjekte.eigeneliste': { stufen: platzhalter(6, 6, 'frei zusammengestellte Sammelobjekte') },
  'sammelobjekte.einzelobjekt': { stufen: platzhalter(6, 4, '„suche ich als Nächstes“ mit nächstem Fundort') },
  'sammelobjekte.status': { stufen: [stufe('standard', 4, 3, 'Fortschritt als Kennzahl')] },
  'portale.verbindungen': {
    stufen: [stufe('standard', 10, 6, 'alle Verbindungen Oberwelt ↔ Nether mit Koordinaten'), stufe('groß', 12, 9, 'Verbindungen und Tipps')],
    vollbild: true,
  },
  // Eine einzelne Verbindung (Bauplan „Sitzung“: Ziel von „Aufs Board“ aus der Portal-Verwaltung)
  'portale.verbindung': { stufen: platzhalter(6, 4, 'eine Verbindung Oberwelt ↔ Nether mit beiden Koordinaten') },
  'handbuch.eintrag': { stufen: platzhalter(6, 6, 'ein Brau-, Crafting-Rezept, eine Verzauberung …') },
  'handbuch.materialliste': { stufen: platzhalter(6, 6, 'Materialien zum Abhaken') },
  'bauplaene.bauplan': { stufen: platzhalter(8, 6, 'ein einzelner Bauplan') },
  'banner.banner': { stufen: platzhalter(8, 6, 'Motiv und Herstellungsschritte') },
  'ruestung.set': { stufen: platzhalter(8, 6, 'Set mit Teilen und Besätzen') },
  // Widgets der Anzeige (Bauplan „Sitzung“, S3): rendert das Dashboard selbst aus zustand/teilnehmer
  'karte.orte': { stufen: [stufe('standard', 12, 8, 'Orte je Dimension mit Kennblock und Umrechnung'), stufe('groß', 20, 10, 'dazu die angehefteten Orte groß')], vollbild: true },
  'board.beitreten': { stufen: platzhalter(6, 6, 'QR-Code zum Beitreten, Adresse und PIN') },
  'board.spieler': { stufen: platzhalter(6, 4, 'wer gerade mit dem Handy am Board ist') },
  'board.zuletzt': { stufen: platzhalter(8, 8, 'die zuletzt gespeicherten Orte mit Urheber') },
});

/** Stufe eines Typs nach Name; ohne Treffer die Standardstufe. null bei unbekanntem Typ. */
export function stufeVon(typ, name) {
  const g = WIDGET_GROESSEN[typ];
  if (!g) return null;
  return g.stufen.find((s) => s.name === name) ?? g.stufen[0];
}

/** Rechteck einer Instanz { id, typ, stufe, x, y } in Zellen; null bei unbekanntem Typ */
export function rechteck(instanz) {
  const s = stufeVon(instanz.typ, instanz.stufe);
  return s ? { id: instanz.id, x: instanz.x, y: instanz.y, w: s.breite, h: s.hoehe } : null;
}

/** Rechtecke aller Instanzen mit bekanntem Typ */
export const rechtecke = (instanzen) => instanzen.map(rechteck).filter(Boolean);

/**
 * Belegungsmatrix spalten × reihen (Index `y * spalten + x`, 1 = belegt).
 * Teile außerhalb der Fläche werden nicht eingetragen; die Instanz `ohneId` zählt nicht.
 */
export function belegungBauen(items, reihen, ohneId, spalten = RASTER_SPALTEN) {
  const matrix = new Uint8Array(spalten * Math.max(0, reihen));
  for (const it of items) {
    if (it.id !== undefined && it.id === ohneId) continue;
    for (let y = Math.max(0, it.y); y < Math.min(reihen, it.y + it.h); y++) {
      for (let x = Math.max(0, it.x); x < Math.min(spalten, it.x + it.w); x++) matrix[y * spalten + x] = 1;
    }
  }
  return matrix;
}

/**
 * Passt-Prüfung (Bauplan Widget-Größensystem, A2): Größe innerhalb von Mindest- und
 * Maximalgröße (`grenzen = { mindest, maximal? }`, optional), `x + w ≤ spalten`,
 * `y + h ≤ reihen`, keine belegte Zelle. Ergebnis { passt, grund?: "stufe"|"rand"|"belegt" }.
 */
export function passt(kandidat, items, reihen, grenzen, spalten = RASTER_SPALTEN) {
  if (grenzen) {
    const { mindest, maximal } = grenzen;
    if (mindest && (kandidat.w < mindest.breite || kandidat.h < mindest.hoehe)) return { passt: false, grund: 'stufe' };
    if (maximal && (kandidat.w > maximal.breite || kandidat.h > maximal.hoehe)) return { passt: false, grund: 'stufe' };
  }
  if (kandidat.x < 0 || kandidat.y < 0 || kandidat.x + kandidat.w > spalten || kandidat.y + kandidat.h > reihen) {
    return { passt: false, grund: 'rand' };
  }
  const matrix = belegungBauen(items, reihen, kandidat.id, spalten);
  for (let y = kandidat.y; y < kandidat.y + kandidat.h; y++) {
    for (let x = kandidat.x; x < kandidat.x + kandidat.w; x++) {
      if (matrix[y * spalten + x]) return { passt: false, grund: 'belegt' };
    }
  }
  return { passt: true };
}

/**
 * Erste freie Stelle für eine neue Instanz: die Stufen der Reihe nach, je Stufe zeilenweise
 * von oben links. `belegt` sind die Rechtecke der vorhandenen Instanzen (siehe `rechtecke`).
 * null, wenn keine Stufe mehr auf die Fläche passt.
 */
export function ersteFreieStelle(belegt, reihen, stufen, spalten = RASTER_SPALTEN) {
  for (const s of stufen) {
    for (let y = 0; y + s.hoehe <= reihen; y++) {
      for (let x = 0; x + s.breite <= spalten; x++) {
        if (passt({ x, y, w: s.breite, h: s.hoehe }, belegt, reihen, undefined, spalten).passt) return { x, y, stufe: s.name };
      }
    }
  }
  return null;
}
