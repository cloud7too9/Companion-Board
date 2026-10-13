import { useBoardStore } from "../../karten/model/board.store";

/**
 * Mit dem Handy beitreten (Bauplan „Sitzung“, S3): QR-Code auf die Anmeldeseite (`beitrittsUrl` aus
 * GET /api/anzeige, SVG von GET /api/anzeige/qr), dazu die Adresse. Eine Board-PIN gibt es nicht mehr
 * (Bauplan „Anmeldung“): angemeldet wird dort mit Konto und Passwort. Nur, wenn die Einstellung
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
      <div className="text-[0.75em] uppercase tracking-wide text-text-muted">Anmelden</div>
      <b className="w-full truncate text-center text-[1.1em]" title={beitritt.beitrittsUrl} data-testid="adresse">{beitritt.adresse.replace(/^https?:\/\//, "")}</b>
    </div>
  );
}
