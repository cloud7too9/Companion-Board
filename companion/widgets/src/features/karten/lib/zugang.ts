import { API_URL } from "./api";

// Zugang der Anzeige zum Board, zwei Wege (Bauplan „Anmeldung und Dashboard-Zugang“):
// - Anzeige-Token (L5): Die Anmeldeseite (/, Reiter „Dashboard-Login“) legt ihn nach Zugangs-Code und
//   Dashboard-PIN unter „board.anzeige“ ab ({ adresse, token }). Welche Anzeige das Gerät zeigt, weiß das Board.
// - Anzeige-Link (fällt mit L6 weg): http://<board>:3000/dashboard?anzeige=<id>&schluessel=<schluessel>.
//   Der Browser merkt sich den Schlüssel unter demselben Namen wie früher die alte Anzeige (/anzeige, bis
//   Bauplan „Sitzung“ S4): ein Gerät, das sie geöffnet hatte, landet über /anzeige → /dashboard/ ohne neuen Link hier.
const SPEICHER = "anzeige.zugang";
const TOKEN_SPEICHER = "board.anzeige";

export type Zugang = { anzeige: string; schluessel: string } | { anzeigeToken: string };

/** Zugang über den Anzeige-Token (sonst über den Anzeige-Link)? */
export const mitToken = (z: Zugang | null): z is { anzeigeToken: string } => Boolean(z && "anzeigeToken" in z);

function json(schluessel: string): Record<string, unknown> | null {
  try {
    return JSON.parse(localStorage.getItem(schluessel) ?? "null");
  } catch {
    return null;
  }
}

/**
 * Zugang aus dem Link (wird gemerkt), sonst der Anzeige-Token für dieses Board, sonst ein gemerkter Link.
 * null = kein Zugang, auch auf dem Board-Gerät selbst (Umbau Phase 1). adresse: Board, mit dem das Dashboard spricht.
 */
export function zugangHolen(suche = location.search, adresse = API_URL || location.origin): Zugang | null {
  const q = new URLSearchParams(suche);
  const anzeige = q.get("anzeige"), schluessel = q.get("schluessel");
  if (anzeige && schluessel) {
    const zugang = { anzeige, schluessel };
    try { localStorage.setItem(SPEICHER, JSON.stringify(zugang)); } catch { /* privater Modus */ }
    return zugang;
  }
  const t = json(TOKEN_SPEICHER);
  if (t && t.adresse === adresse && typeof t.token === "string" && t.token) return { anzeigeToken: t.token };
  const z = json(SPEICHER);
  return z && typeof z.anzeige === "string" && typeof z.schluessel === "string" ? { anzeige: z.anzeige, schluessel: z.schluessel } : null;
}

/** Query-Teile für /api/anzeige, /api/widgets und /ws: anzeigeToken=… oder anzeige=…&schluessel=… (oder keine) */
export const zugangParameter = (z: Zugang | null): Record<string, string> =>
  !z ? {} : mitToken(z) ? { anzeigeToken: z.anzeigeToken } : { anzeige: z.anzeige, schluessel: z.schluessel };
