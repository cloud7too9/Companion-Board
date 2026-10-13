import type { Beitritt, BoardZustand } from "../anzeige.types";

/**
 * Beispiel für die Widgets der Anzeige, solange kein Board erreichbar ist (z. B. `npm run dev`
 * allein) – wie die Beispielkarten in karten/lib/mock-karten.ts.
 */
export function beispielZustand(jetzt = Date.now()): BoardZustand {
  const vor = (min: number) => new Date(jetzt - min * 60_000).toISOString();
  const ort = (id: string, name: string, dimension: BoardZustand["orte"][number]["dimension"], kategorie: BoardZustand["orte"][number]["kategorie"],
    x: number, y: number | null, z: number, typ = "", angeheftet = false, von = "Max", min = 30) =>
    ({ id, name, x, y, z, dimension, kategorie, typ, angeheftet, erstelltVon: von, erstelltAm: vor(min), geaendertAm: vor(min) });
  return {
    orte: [
      ort("b1", "Hauptbasis", "oberwelt", "basis", 260, 80, -420, "", true, "Max", 300),
      ort("b2", "Village (Plains)", "oberwelt", "dorf", -1180, 70, 344, "Village", false, "Lena", 120),
      ort("b3", "Stronghold", "oberwelt", "struktur", 1824, null, -96, "Stronghold", false, "Lena", 12),
      ort("b4", "Eisenfarm", "oberwelt", "farm", 800, 64, 80, "", false, "Max", 45),
      ort("b5", "Nether Fortress", "nether", "struktur", -200, 70, 96, "Nether Fortress", false, "Max", 8),
      ort("b6", "Bastion Remnant", "nether", "struktur", 412, 40, -310, "Bastion Remnant", false, "Lena", 200),
      ort("b7", "End City", "ende", "struktur", 1200, 60, 880, "End City", false, "Max", 600),
    ],
    einstellungen: { titel: "Unsere Welt", qrZeigen: true },
    welt: { id: "w_beispiel", seed: "6889192652397090698" },
    version: 1,
  };
}

export const BEISPIEL_TEILNEHMER = ["Max", "Lena"];

export const BEISPIEL_BEITRITT: Beitritt = { beitrittsUrl: "https://mainhubv1.com/", adresse: "https://mainhubv1.com" };

/** Platzhalter statt eines echten QR-Codes (das Beispiel hat kein Board, dem man beitreten könnte) */
export const BEISPIEL_QR =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 7"><path d="M0 0h3v3H0zM4 0h3v3H4zM0 4h3v3H0zM4 4h1v1H4zM6 4h1v1H6zM5 5h1v1H5zM4 6h1v1H4zM6 6h1v1H6z"/></svg>';
