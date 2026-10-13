import { useBoardStore } from "../../karten/model/board.store";

/**
 * Mit dem Handy beitreten (Bauplan „Sitzung“, S3): QR-Code auf die Companion (`beitrittsUrl` aus
 * GET /api/anzeige, SVG von GET /api/anzeige/qr), dazu Adresse und PIN. Nur, wenn die Einstellung
 * „QR-Code zeigen“ an ist – sonst sagt das Widget das.
 */
export function BeitretenWidget() {
  const beitritt = useBoardStore((s) => s.beitritt);
  const qrSvg = useBoardStore((s) => s.qrSvg);
  const qrZeigen = useBoardStore((s) => s.zustand?.einstellungen.qrZeigen ?? true);

  if (!qrZeigen) {
    return <p className="flex h-full items-center justify-center text-center text-sm text-text-muted" data-testid="qr-aus">QR-Code ausgeblendet (Board → „QR-Code zum Beitreten zeigen“)</p>;
  }
  if (!beitritt) return <p className="text-sm text-text-muted" data-testid="widget-laedt">Lädt …</p>;
  return (
    <div className="flex h-full min-h-0 flex-col items-center gap-[0.5em] karte-schrift" data-testid="beitreten">
      <div className="min-h-0 flex-1 [&>svg]:h-full [&>svg]:w-auto [&>svg]:max-w-full [&>svg]:rounded-md [&>svg]:bg-white [&>svg]:p-[0.3em]" data-testid="qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
      <div className="w-full truncate text-center text-[0.75em] text-text-muted" title={beitritt.beitrittsUrl}>{beitritt.adresse.replace(/^https?:\/\//, "")}</div>
      <div className="flex items-baseline gap-[0.5em]">
        <span className="text-[0.75em] uppercase tracking-wide text-text-muted">PIN</span>
        <b className="text-[1.5em] tabular-nums tracking-[0.15em]" data-testid="pin">{beitritt.pin}</b>
      </div>
    </div>
  );
}
