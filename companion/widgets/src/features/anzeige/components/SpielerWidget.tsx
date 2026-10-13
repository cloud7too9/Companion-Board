import { useBoardStore } from "../../karten/model/board.store";

/** Wer gerade mit dem Handy am Board ist (`teilnehmer` über /ws), Bauplan „Sitzung“, S3 */
export function SpielerWidget() {
  const teilnehmer = useBoardStore((s) => s.teilnehmer);
  if (teilnehmer.length === 0) {
    return <p className="flex h-full items-center justify-center text-center text-sm text-text-muted" data-testid="spieler-leer">Niemand ist gerade mit dem Handy verbunden</p>;
  }
  return (
    <div className="flex flex-wrap content-start gap-[0.5em] karte-schrift" data-testid="spieler">
      {teilnehmer.map((n) => (
        <span key={n} className="flex items-center gap-[0.5em] rounded-full border border-border bg-surface-raised px-[0.8em] py-[0.35em] font-semibold" data-testid="spieler-chip">
          <span aria-hidden="true" className="h-[0.5em] w-[0.5em] rounded-full bg-accent shadow-[0_0_6px] shadow-accent" />
          {n}
        </span>
      ))}
    </div>
  );
}
