import type { WorkspaceLayout } from "./workspace.types";

/**
 * Start-Layer im Raster mit 32 Spalten; passt in 16 Reihen (16:9 am Fernseher). Seit Bauplan „Sitzung“ (S3)
 * ersetzt er die alte Anzeige: Gesamtkarte, Portalverbindungen, Sammel-Fortschritt, Spieler, Beitreten
 * (QR-Code) und die Orte je Dimension. Rechts unten bleibt Platz für ein weiteres Widget (8 × 6).
 */
export const DEFAULT_LAYOUT: WorkspaceLayout = {
  id: "workspace-default",
  name: "Start",
  instanzen: [
    { id: "w-gesamtkarte", typ: "karte.gesamtkarte", stufe: "standard", x: 0, y: 0 },
    { id: "w-portale", typ: "portale.verbindungen", stufe: "standard", x: 12, y: 0 },
    { id: "w-sammelstatus", typ: "sammelobjekte.status", stufe: "standard", x: 22, y: 0 },
    { id: "w-spieler", typ: "board.spieler", stufe: "standard", x: 26, y: 0 },
    { id: "w-beitreten", typ: "board.beitreten", stufe: "standard", x: 26, y: 4 },
    { id: "w-orte", typ: "karte.orte", stufe: "standard", x: 0, y: 8 },
  ],
};
