import { BeitretenWidget } from "./components/BeitretenWidget";
import { OrteWidget } from "./components/OrteWidget";
import { SpielerWidget } from "./components/SpielerWidget";
import { ZuletztWidget } from "./components/ZuletztWidget";

/**
 * Widgets, die die Anzeige selbst aus ihrem Zustand rendert (Bauplan „Sitzung“, S3) – ohne
 * Karte von GET /api/widgets. Sie ersetzen die Blöcke der alten Anzeige (/anzeige).
 */
const LOKALE_WIDGETS: Record<string, (p: { gross: boolean }) => JSX.Element> = {
  "karte.orte": ({ gross }) => <OrteWidget gross={gross} />,
  "board.beitreten": () => <BeitretenWidget />,
  "board.spieler": () => <SpielerWidget />,
  "board.zuletzt": () => <ZuletztWidget />,
};

export const istLokalesWidget = (typ: string) => Object.hasOwn(LOKALE_WIDGETS, typ);

export function LokalesWidget({ typ, gross = false }: { typ: string; gross?: boolean }) {
  const Komponente = LOKALE_WIDGETS[typ];
  return (
    // data-testid „karte“ wie bei Karten vom Board: ein Widget mit Inhalt
    <div className="h-full min-h-0" data-testid="karte" data-lokal={typ}>
      {Komponente ? <Komponente gross={gross} /> : <p className="text-sm text-text-muted">Unbekanntes Widget</p>}
    </div>
  );
}
