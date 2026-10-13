/**
 * Passt-Prüfung beim Anordnen (A2). Die Prüfung selbst liegt in companion/widget-groessen.mjs,
 * gemeinsam mit dem Server, der damit für „Aufs Board“ die erste freie Stelle rechnet
 * (Bauplan „Sitzung“). Hier nur die Typen fürs Dashboard und `hasCollision`.
 */
import { belegungBauen, passt, type PasstErgebnis, type PasstGrund } from "../../../../../widget-groessen.mjs";
import { rectsOverlap, type Rect } from "./layout-utils";

export { belegungBauen, passt };
export type { PasstErgebnis, PasstGrund };

export function hasCollision(candidate: Rect & { id: string }, others: (Rect & { id: string })[]): boolean {
  return others.some((o) => o.id !== candidate.id && rectsOverlap(candidate, o));
}
