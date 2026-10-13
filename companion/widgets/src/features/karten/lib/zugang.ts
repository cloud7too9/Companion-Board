// Anzeige-Link: http://<board>:3000/dashboard?anzeige=<id>&schluessel=<schluessel>
// Damit darf ein anderes Gerät im Netz Anzeige sein. Der Browser merkt sich den Schlüssel unter
// demselben Namen wie früher die alte Anzeige (/anzeige, bis Bauplan „Sitzung“ S4): ein Gerät, das
// sie geöffnet hatte, landet über die Umleitung /anzeige → /dashboard/ ohne neuen Link im Dashboard.
const SPEICHER = "anzeige.zugang";

export interface Zugang {
  anzeige: string;
  schluessel: string;
}

function lesen(): Zugang | null {
  try {
    const z = JSON.parse(localStorage.getItem(SPEICHER) ?? "null");
    return z && typeof z.anzeige === "string" && typeof z.schluessel === "string" ? z : null;
  } catch {
    return null;
  }
}

/** Zugang aus dem Link (wird gemerkt) oder aus dem Speicher; null = kein Zugang, auch auf dem Board-Gerät selbst (Umbau Phase 1) */
export function zugangHolen(suche = location.search): Zugang | null {
  const q = new URLSearchParams(suche);
  const anzeige = q.get("anzeige"), schluessel = q.get("schluessel");
  if (anzeige && schluessel) {
    const zugang = { anzeige, schluessel };
    try { localStorage.setItem(SPEICHER, JSON.stringify(zugang)); } catch { /* privater Modus */ }
    return zugang;
  }
  return lesen();
}

/** Query-Teile für /api/widgets und /ws: anzeige=…&schluessel=… (oder keine) */
export const zugangParameter = (z: Zugang | null): Record<string, string> =>
  z ? { anzeige: z.anzeige, schluessel: z.schluessel } : {};
