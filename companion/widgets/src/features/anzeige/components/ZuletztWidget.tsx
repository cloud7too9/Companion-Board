import { useMemo } from "react";
import { useBoardStore } from "../../karten/model/board.store";
import { DIMENSION_FARBE, useJetzt, vorZeit } from "../lib/anzeige-hilfen";

const ANZAHL = 8;

/** „Zuletzt gespeichert“: die neuesten Orte mit Urheber und Zeit (Bauplan „Sitzung“, S3) */
export function ZuletztWidget() {
  const zustand = useBoardStore((s) => s.zustand);
  const jetzt = useJetzt(15_000);   // „vor x Min.“ – alle 15 Sekunden reicht
  const neueste = useMemo(() => [...(zustand?.orte ?? [])].sort((a, b) => b.erstelltAm.localeCompare(a.erstelltAm)).slice(0, ANZAHL), [zustand]);
  if (!zustand) return <p className="text-sm text-text-muted" data-testid="widget-laedt">Lädt …</p>;
  if (neueste.length === 0) return <p className="flex h-full items-center justify-center text-sm text-text-muted" data-testid="zuletzt-leer">Noch nichts gespeichert</p>;
  return (
    <ol className="flex h-full min-h-0 flex-col gap-[0.35em] overflow-hidden karte-schrift" data-testid="zuletzt">
      {neueste.map((o) => (
        <li key={o.id} className="flex min-w-0 items-baseline gap-[0.6em] rounded-md bg-surface px-[0.6em] py-[0.3em]" style={{ borderLeft: `0.25em solid ${DIMENSION_FARBE[o.dimension]}` }} data-testid="zuletzt-zeile">
          <span className="shrink-0 text-[0.75em] text-text-muted">{vorZeit(o.erstelltAm, jetzt)}</span>
          <span className="min-w-0 truncate"><b>{o.erstelltVon || "Jemand"}</b> <span className="text-text-muted">→</span> {o.name}</span>
        </li>
      ))}
    </ol>
  );
}
