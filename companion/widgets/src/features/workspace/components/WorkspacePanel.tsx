import type { PointerEvent as ReactPointerEvent } from "react";
import type { WidgetInstanz } from "../model/widget-struktur";
import type { PixelRect } from "../lib/layout-utils";
import { widgetTyp } from "../model/widget-register";
import { stufeVon } from "../model/widget-vertrag";
import { WidgetInhalt } from "./WidgetInhalt";
import { PanelToolbar } from "./PanelToolbar";
import { WidgetGehaeuse } from "./WidgetGehaeuse";
import { useKarte } from "../../karten/hooks/useKarte";
import { Fehlergrenze, WIDGET_FEHLER } from "../../../shared/ui/Fehlergrenze";
import { LokalesWidget, istLokalesWidget } from "../../anzeige/lokale-widgets";

interface Props {
  instanz: WidgetInstanz;
  rect: PixelRect;
  editMode: boolean;
  /** Verschieben/Skalieren erlaubt (Bearbeitungsmodus im Desktop-Raster). */
  arrangeable: boolean;
  selected: boolean;
  /** Nur Gehäuse (Rahmen, Titel, Theme) ohne Inhalt – beim Anordnen am Handy */
  leer?: boolean;
  /** Kopfzeile: startet Verschieben (Bearbeitungszustand, Desktop) oder langes Drücken. */
  onHeaderPointerDown: (e: ReactPointerEvent, id: string) => void;
  onResizePointerDown: (e: ReactPointerEvent, id: string) => void;
}

/**
 * Ein Widget an seiner Stelle im Raster: das Gehäuse mit dem Inhalt, im
 * Bearbeiten-Modus dazu Stufe, Werkzeuge und der Griff für die Größenstufe.
 */
export function WorkspacePanel({
  instanz: item,
  rect,
  editMode,
  arrangeable,
  selected,
  leer = false,
  onHeaderPointerDown,
  onResizePointerDown,
}: Props) {
  const typ = widgetTyp(item.typ);
  const stufe = typ && stufeVon(typ.vertrag, item.stufe);
  const lokal = istLokalesWidget(item.typ);   // Widgets der Anzeige rendern aus dem Zustand, ohne Karte vom Server (S3)
  const antwort = useKarte(leer || lokal ? "" : item.typ, item.quelle);   // leer: keine Karte laden
  return (
    <div
      data-panel-id={item.id}
      data-typ={item.typ}
      style={{
        position: "absolute",
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }}
    >
      <WidgetGehaeuse
        typ={typ}
        zustand={editMode ? (selected ? "ausgewaehlt" : "bearbeiten") : "normal"}
        leer={leer}
        themeZustand={{ dimension: antwort?.karte?.dimension }}
        kopfProps={{
          className: ["long-press-target", arrangeable ? "cursor-move touch-none" : ""].join(" "),
          onPointerDown: (e) => onHeaderPointerDown(e, item.id),
          onContextMenu: (e) => e.preventDefault(),
        }}
        kopfZusatz={!leer && (
          <>
            {item.von && (
              // Sitzungs-Widget (Bauplan „Sitzung“): wer es aufs Board gelegt hat, in der Farbe des Spielers
              <span
                className="ml-auto flex shrink-0 items-center gap-1 rounded-full border border-border px-1.5 text-[10px] leading-4 text-text-muted"
                data-testid="von"
                title={`Aufs Board gelegt von ${item.von}`}
              >
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: item.farbe || "currentColor" }} />
                {item.von}
              </span>
            )}
            {editMode && (
              <>
                <span
                  className={["shrink-0 rounded-full border border-border px-1.5 text-[10px] leading-4 text-text-muted", item.von ? "" : "ml-auto"].join(" ")}
                  data-testid="stufe"
                  title="Größenstufe · Breite × Höhe in Zellen"
                >
                  {item.stufe} · {stufe?.breite}×{stufe?.hoehe}
                </span>
                <PanelToolbar panelId={item.id} typ={item.typ} />
              </>
            )}
          </>
        )}
      >
        {leer ? undefined : (
          <Fehlergrenze ersatz={WIDGET_FEHLER} neuVersuchen={antwort}>
            {lokal ? <LokalesWidget typ={item.typ} /> : <WidgetInhalt instanz={item} antwort={antwort} />}
          </Fehlergrenze>
        )}
      </WidgetGehaeuse>
      {arrangeable && (
        <div
          role="button"
          aria-label="Größe ändern (nächste Stufe)"
          title="Tippen: nächste Größenstufe · Ziehen: Stufe wählen"
          onPointerDown={(e) => onResizePointerDown(e, item.id)}
          className="absolute bottom-1 right-1 h-4 w-4 cursor-nwse-resize touch-none rounded-sm border border-border-strong bg-surface-raised"
        />
      )}
    </div>
  );
}
