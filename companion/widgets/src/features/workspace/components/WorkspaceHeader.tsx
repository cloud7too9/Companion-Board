import { Button } from "../../../shared/ui/Button";
import { selectActiveLayer, useWorkspaceStore } from "../model/workspace.store";
import { RASTER_SPALTEN } from "../lib/raster";
import { LayerSwitcher } from "./LayerSwitcher";
import { useBoardStore } from "../../karten/model/board.store";
import { kurzSeed, useJetzt } from "../../anzeige/lib/anzeige-hilfen";

/** Uhr der Anzeige (Stunden:Minuten), wie auf der alten Anzeige */
function Uhr() {
  const jetzt = useJetzt(5000);   // zeigt nur Stunden und Minuten
  return (
    <span className="tabular-nums text-sm font-semibold sm:text-base" data-testid="uhr">
      {new Date(jetzt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
    </span>
  );
}

/** Verbunden-Punkt: grün, solange /ws offen ist */
function Verbindung({ verbunden }: { verbunden: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-text-muted" title={verbunden ? "Mit dem Board verbunden" : "Keine Verbindung zum Board"}
      data-testid="verbunden" data-verbunden={verbunden}>
      <span aria-hidden="true" className={["h-2 w-2 rounded-full", verbunden ? "bg-accent shadow-[0_0_6px] shadow-accent" : "bg-danger"].join(" ")} />
      <span className="hidden sm:inline">{verbunden ? "Verbunden" : "Getrennt"}</span>
    </span>
  );
}

export function WorkspaceHeader() {
  const editMode = useWorkspaceStore((s) => s.editMode);
  const setEditMode = useWorkspaceStore((s) => s.setEditMode);
  const openAddPanel = useWorkspaceStore((s) => s.openAddPanel);
  const resetActiveLayer = useWorkspaceStore((s) => s.resetActiveLayer);
  const activeLayerName = useWorkspaceStore((s) => selectActiveLayer(s).name);
  const reihen = useWorkspaceStore((s) => s.reihen);
  const modus = useBoardStore((s) => s.modus);
  const anzeige = useBoardStore((s) => s.anzeige);
  const nurAnzeige = useWorkspaceStore((s) => s.nurAnzeige);
  const zustand = useBoardStore((s) => s.zustand);
  const verbunden = useBoardStore((s) => s.verbunden);
  const nichtErreichbar = useBoardStore((s) => s.nichtErreichbar);

  // Jede Bildschirmgröße zeigt dasselbe Raster mit 32 Spalten – Bearbeiten
  // geht überall, per Knopf oder langem Drücken auf die Kopfzeile. Am Board
  // (nurAnzeige) nicht: Dort wird am Handy angeordnet.
  const showEditButton = !editMode && !nurAnzeige;

  return (
    <header className="border-b border-border bg-surface-muted">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {nurAnzeige ? (
            // Kopf der Anzeige (Bauplan „Sitzung“, S3): Titel der Welt, Seed und Anzahl der Orte
            <>
              <h1 className="truncate text-base font-semibold sm:text-lg" data-testid="anzeige-titel">{zustand?.einstellungen.titel || "Dashboard"}</h1>
              {zustand?.welt && (
                <span className="text-[11px] text-text-muted" data-testid="anzeige-welt">
                  Seed {kurzSeed(zustand.welt.seed)} · {zustand.orte.length} {zustand.orte.length === 1 ? "Ort" : "Orte"}
                </span>
              )}
            </>
          ) : (
            <h1 className="text-base font-semibold sm:text-lg">Dashboard</h1>
          )}
          {nurAnzeige ? (
            <span className="truncate text-sm text-text-muted" data-testid="layer-name">{activeLayerName}</span>
          ) : (
            <LayerSwitcher />
          )}
          {nurAnzeige && anzeige && (
            <span
              className="rounded-full border border-border px-2 py-0.5 text-[11px] leading-4 text-text-muted"
              title="Diese Anzeige – ihr Layout ordnet man am Handy an"
              data-testid="anzeige-name"
            >
              Anzeige {anzeige.name}
            </span>
          )}
          <span
            className="rounded-full border border-border px-2 py-0.5 text-[11px] leading-4 text-text-muted"
            title={`Raster: ${RASTER_SPALTEN} Spalten × ${reihen} Reihen, quadratische Zellen`}
            data-testid="raster-badge"
          >
            {RASTER_SPALTEN}×{reihen}
          </span>
          {modus === "beispiel" && (
            <span
              className="rounded-full border border-border px-2 py-0.5 text-[11px] leading-4 text-text-muted"
              title="Kein Board erreichbar – die Widgets zeigen feste Beispielkarten"
              data-testid="beispielkarten"
            >
              Beispielkarten
            </span>
          )}
          {nichtErreichbar && (
            <span
              className="rounded-full border border-border px-2 py-0.5 text-[11px] leading-4 text-text-muted"
              title="Das Board antwortet gerade nicht – die Anzeige versucht es weiter"
              data-testid="nicht-erreichbar"
            >
              Board nicht erreichbar · neuer Versuch läuft
            </span>
          )}
        </div>
        {nurAnzeige && modus !== "pruefen" && (
          <div className="flex items-center gap-3">
            {modus === "board" && <Verbindung verbunden={verbunden} />}
            <Uhr />
          </div>
        )}
        {(editMode || showEditButton) && (
          <div className="flex flex-wrap items-center gap-2">
            {editMode ? (
              <>
                <Button variant="ghost" onClick={openAddPanel}>
                  <span aria-hidden="true">+</span>
                  <span className="hidden sm:inline">Widget hinzufügen</span>
                  <span className="sm:hidden">Widget</span>
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Layer „${activeLayerName}“ zurücksetzen?`)) resetActiveLayer();
                  }}
                >
                  Zurücksetzen
                </Button>
                <Button variant="primary" onClick={() => setEditMode(false)}>
                  <span className="hidden sm:inline">Bearbeitung beenden</span>
                  <span className="sm:hidden">Fertig</span>
                </Button>
              </>
            ) : (
              <Button variant="ghost" onClick={() => setEditMode(true)}>
                Bearbeiten
              </Button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
