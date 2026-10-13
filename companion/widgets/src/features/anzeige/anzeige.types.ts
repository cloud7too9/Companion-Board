/**
 * Zustand der Anzeige vom Board (koordinaten-board/server/src/sicht.js → `zustand` über /ws),
 * dieselbe Form wie bei der alten Anzeige (bis S4). Die Widgets der Anzeige
 * (Bauplan „Sitzung“, S3: Orte, Beitreten, Spieler, Zuletzt) rendern daraus, ohne Karte vom Server.
 */
export type Dimension = "oberwelt" | "nether" | "ende";
export type Kategorie = "basis" | "farm" | "portal" | "dorf" | "struktur" | "ressource" | "sonstiges";

export interface Ort {
  id: string;
  name: string;
  x: number;
  y: number | null;
  z: number;
  dimension: Dimension;
  kategorie: Kategorie;
  /** Feature-Typ der Seed Map, z. B. „Stronghold“ (leer = eigener Ort) */
  typ: string;
  angeheftet: boolean;
  erstelltVon: string;
  erstelltAm: string;
  geaendertAm: string;
}

export interface BoardZustand {
  orte: Ort[];
  einstellungen: { titel: string; qrZeigen: boolean };
  welt?: { id: string; seed: string } | null;
  version: number;
}

/** GET /api/anzeige: QR-Code zum Beitreten (SVG kommt von GET /api/anzeige/qr) */
export interface Beitritt {
  beitrittsUrl: string;
  adresse: string;
  pin: string;
}
