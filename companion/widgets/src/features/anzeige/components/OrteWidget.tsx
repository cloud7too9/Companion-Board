import { useMemo } from "react";
import { zahl } from "../../karten/lib/zahl";
import { useBoardStore } from "../../karten/model/board.store";
import type { Ort } from "../anzeige.types";
import { DIMENSIONEN, DIMENSION_FARBE, dimensionLabel, istNeu, kategorieLabel, sortieren, umrechnen, useJetzt } from "../lib/anzeige-hilfen";
import { KategorieIcon, OrtIcon } from "./OrtIcon";

const MAX_ANGEHEFTET = 6;

/** „X 40 · Y 89 · Z −19“ */
function Koordinaten({ o }: { o: Ort }) {
  return (
    <span className="whitespace-nowrap font-semibold tabular-nums" data-testid="koordinaten">
      X {zahl(o.x)}{o.y !== null && <> · Y {zahl(o.y)}</>} · Z {zahl(o.z)}
    </span>
  );
}

/** „⟷ Nether 26 / −49“ */
function PortalChip({ o }: { o: Ort }) {
  const u = umrechnen(o);
  if (!u) return null;
  return (
    <span className="whitespace-nowrap text-text-muted" data-testid="portal-chip">
      <span className="text-accent">⟷</span> {dimensionLabel(u.dimension)} <b className="tabular-nums">{zahl(u.x)} / {zahl(u.z)}</b>
    </span>
  );
}

function Neu() {
  return <span className="rounded-full bg-accent/20 px-[0.5em] text-[0.65em] font-bold uppercase leading-[1.6] text-accent" data-testid="neu">Neu</span>;
}

function Zeile({ o, jetzt }: { o: Ort; jetzt: number }) {
  return (
    <div
      className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-[0.6em] gap-y-[0.1em] rounded-md border border-border bg-surface px-[0.6em] py-[0.35em]"
      data-testid="ort-zeile"
      data-ort-id={o.id}
    >
      <span className="row-span-2 grid h-[2.1em] w-[2.1em] place-items-center rounded-md bg-accent/15 text-accent">
        <OrtIcon typ={o.typ} kategorie={o.kategorie} />
      </span>
      <span className="flex min-w-0 items-center gap-[0.5em]">
        <b className="truncate" data-testid="ort-name">{o.name}</b>
        {istNeu(o, jetzt) && <Neu />}
        <span className="ml-auto shrink-0 text-[0.75em] text-text-muted">{o.typ || kategorieLabel(o.kategorie)}</span>
      </span>
      <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-[1em] text-[0.85em]">
        <Koordinaten o={o} />
        <PortalChip o={o} />
      </span>
    </div>
  );
}

/**
 * Orte der aktiven Welt (Bauplan „Sitzung“, S3): angeheftete Orte groß oben, darunter je Dimension
 * eine Spalte mit Kennblock, Koordinaten, Umrechnung und „Neu“ – wie die alte Anzeige, aus `zustand`.
 */
export function OrteWidget({ gross = false }: { gross?: boolean }) {
  const zustand = useBoardStore((s) => s.zustand);
  const jetzt = useJetzt(5000);   // „Neu“ (90 s) – alle 5 Sekunden reicht
  const orte = useMemo(() => zustand?.orte ?? [], [zustand]);
  const angeheftet = useMemo(() => orte.filter((o) => o.angeheftet).sort(sortieren).slice(0, MAX_ANGEHEFTET), [orte]);
  const angeheftetIds = new Set(angeheftet.map((o) => o.id));

  if (!zustand) return <p className="text-sm text-text-muted" data-testid="widget-laedt">Lädt …</p>;
  if (orte.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-text-muted" data-testid="orte-leer">
        <KategorieIcon name="kompass" groesse={32} />
        <b className="text-text">Noch keine Orte gespeichert</b>
        <span className="text-[0.85em]">QR-Code scannen, PIN eingeben und einen Seed-Map-Screenshot hochladen.</span>
      </div>
    );
  }

  return (
    <div className={["flex h-full min-h-0 flex-col gap-[0.6em]", gross ? "text-base" : "karte-schrift"].join(" ")} data-testid="orte">
      {angeheftet.length > 0 && (
        <div className="grid shrink-0 grid-cols-[repeat(auto-fill,minmax(14em,1fr))] gap-[0.6em]" data-testid="angeheftet">
          {angeheftet.map((o) => (
            <article key={o.id} className="rounded-md border border-border bg-surface-raised p-[0.6em]" style={{ borderLeft: `0.3em solid ${DIMENSION_FARBE[o.dimension]}` }} data-ort-id={o.id}>
              <div className="flex items-center gap-[0.6em]">
                <span className="grid h-[2.4em] w-[2.4em] shrink-0 place-items-center rounded-md bg-accent/15 text-accent"><OrtIcon typ={o.typ} kategorie={o.kategorie} groesse={22} /></span>
                <div className="min-w-0">
                  <div className="flex items-center gap-[0.5em] font-bold"><span className="truncate" data-testid="ort-name">{o.name}</span>{istNeu(o, jetzt) && <Neu />}</div>
                  <div className="truncate text-[0.8em] text-text-muted">{dimensionLabel(o.dimension)} · {o.typ || kategorieLabel(o.kategorie)}</div>
                </div>
              </div>
              <div className="mt-[0.4em] flex flex-wrap items-center justify-between gap-[0.6em] text-[0.95em]"><Koordinaten o={o} /><PortalChip o={o} /></div>
            </article>
          ))}
        </div>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-[0.6em]">
        {DIMENSIONEN.map((d) => {
          const liste = orte.filter((o) => o.dimension === d.wert && !angeheftetIds.has(o.id)).sort(sortieren);
          return (
            <section key={d.wert} className="flex min-h-0 flex-col rounded-md border border-border bg-surface-muted" data-dimension={d.wert} data-testid="dimension-spalte">
              <header className="flex shrink-0 items-center gap-[0.5em] px-[0.6em] py-[0.4em] text-[0.9em] font-semibold">
                <span aria-hidden="true" className="h-[0.6em] w-[0.6em] rounded-full" style={{ background: DIMENSION_FARBE[d.wert] }} />
                {d.label}
                <span className="ml-auto tabular-nums text-text-muted">{liste.length}</span>
              </header>
              <div className="flex min-h-0 flex-1 flex-col gap-[0.4em] overflow-hidden px-[0.5em] pb-[0.5em]">
                {liste.length === 0
                  ? <p className="py-[0.6em] text-center text-[0.85em] text-text-muted">Keine weiteren Orte</p>
                  : liste.map((o) => <Zeile key={o.id} o={o} jetzt={jetzt} />)}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
