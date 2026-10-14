import { useEffect, useState } from "react";
import type { WidgetAntwort } from "../karte.types";
import { useBoardStore } from "../model/board.store";

/**
 * Karte eines Widgets vom Board (oder Beispielkarte ohne Board). Lädt neu,
 * wenn sich am Board etwas ändert. `null`, solange noch nichts da ist.
 */
export function useKarte(typ: string, quelle?: string): WidgetAntwort | null {
  const modus = useBoardStore((s) => s.modus);
  const version = useBoardStore((s) => s.version);
  const karteLaden = useBoardStore((s) => s.karteLaden);
  const [antwort, setAntwort] = useState<WidgetAntwort | null>(null);

  useEffect(() => {
    if (modus === "pruefen" || !typ) return;
    let aktuell = true;
    // Beim Neuladen bleibt die alte Karte stehen, bis die neue da ist (kein Flackern)
    // Kurz kein Netz: die letzte Karte bleibt stehen statt „Board nicht erreichbar“
    void karteLaden(typ, quelle).then((a) => { if (aktuell) setAntwort((alt) => (a.netzFehler && alt?.karte ? alt : a)); });
    return () => { aktuell = false; };
  }, [modus, version, typ, quelle, karteLaden]);

  return antwort;
}
