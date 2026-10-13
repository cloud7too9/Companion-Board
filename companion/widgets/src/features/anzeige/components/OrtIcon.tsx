import { useState } from "react";
import { kennblockDatei } from "../../karten/lib/kennbloecke";
import type { Kategorie } from "../anzeige.types";

// Linien-Icons je Kategorie (24er Raster), übernommen aus der alten Anzeige (bis S4 koordinaten-board/client)
const PFADE: Record<Kategorie | "kompass", string> = {
  basis: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z",
  farm: "M12 21V11M12 11c0-4.4 3.1-7.5 7.5-7.5 0 4.4-3.1 7.5-7.5 7.5zM12 15c0-3.6-2.6-6.5-6.5-6.5 0 3.6 2.6 6.5 6.5 6.5z",
  portal: "M5 21V6.5a7 7 0 0 1 14 0V21M9 21V8.5a3 3 0 0 1 6 0V21M3 21h18",
  dorf: "M2 21v-9l5-4 5 4v9zM12 21v-6l5-4 5 4v6zM5.5 21v-4h3v4",
  struktur: "M4 21V4h3v3h3V4h4v3h3V4h3v17zM10 21v-5h4v5",
  ressource: "M6.5 3h11L22 9 12 21 2 9zM2 9h20M12 21 8.5 9l3.5-6 3.5 6z",
  sonstiges: "M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  kompass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM16 8l-2 6-6 2 2-6z",
};

export function KategorieIcon({ name, groesse = 18 }: { name: Kategorie | "kompass"; groesse?: number }) {
  return (
    <svg width={groesse} height={groesse} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PFADE[name]} />
    </svg>
  );
}

/**
 * Symbol eines Orts: der Kennblock der Struktur (PNG), sonst das Linien-Icon der Kategorie.
 * Lädt das Bild nicht, fällt es ebenfalls auf das Linien-Icon zurück.
 */
export function OrtIcon({ typ, kategorie, groesse = 18 }: { typ?: string; kategorie: Kategorie; groesse?: number }) {
  const datei = kennblockDatei(typ);
  const [kaputt, setKaputt] = useState<string | null>(null);
  if (datei && kaputt !== datei) {
    return <img className="kennblock h-[1.6em] w-[1.6em] object-contain" src={datei} alt="" style={{ imageRendering: "pixelated" }} onError={() => setKaputt(datei)} />;
  }
  return <KategorieIcon name={kategorie} groesse={groesse} />;
}
