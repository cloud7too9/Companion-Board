import { describe, expect, it } from "vitest";
import { SITZUNG_LAYER } from "../features/workspace/model/widget-struktur";
import { useWorkspaceStore } from "../features/workspace/model/workspace.store";
import { parsePersistedWorkspace } from "../features/workspace/lib/storage";
import { SCHEMA_VERSION } from "../features/workspace/lib/storage";

const layoutMitSitzung = () => ({
  version: SCHEMA_VERSION,
  layers: [
    { id: SITZUNG_LAYER, name: "Sitzung", instanzen: [
      { id: "s1", typ: "portale.verbindung", stufe: "standard", x: 0, y: 0, quelle: "p_1", von: "Max", farbe: "#3fb950", herkunft: "portal:p_1", titel: "Hof" },
    ] },
    { id: "l1", name: "Start", instanzen: [{ id: "w1", typ: "sammelobjekte.status", stufe: "standard", x: 0, y: 0 }] },
  ],
  activeLayerId: SITZUNG_LAYER,
});

describe("Sitzungs-Layer im Dashboard (Bauplan Sitzung, S2)", () => {
  it("behält von und Farbe der Sitzungs-Widgets, lässt Unbekanntes weg", () => {
    const daten = parsePersistedWorkspace(layoutMitSitzung());
    expect(daten?.activeLayerId).toBe(SITZUNG_LAYER);
    const [s1] = daten!.layers[0].instanzen;
    expect(s1).toEqual({ id: "s1", typ: "portale.verbindung", stufe: "standard", x: 0, y: 0, quelle: "p_1", von: "Max", farbe: "#3fb950" });
  });

  it("in die Sitzung kommt man nur über „Aufs Board“: kein Hinzufügen, Duplizieren, Umbenennen, Löschen", () => {
    const daten = parsePersistedWorkspace(layoutMitSitzung())!;
    useWorkspaceStore.setState({ layers: daten.layers, activeLayerId: SITZUNG_LAYER, reihen: 18, reihenGemessen: true });
    const s = useWorkspaceStore.getState();
    expect(s.addItem("sammelobjekte.status")).toBe(false);
    expect(s.duplicateItem("s1")).toBe(false);
    expect(s.renameLayer(SITZUNG_LAYER, "Meins")).toBe(false);
    expect(s.removeLayer(SITZUNG_LAYER)).toBe(false);
    // Verschieben, Stufe und Entfernen einzelner Widgets gehen weiter (Anordnen am Handy)
    expect(s.moveItem("s1", 4, 2)).toBe(true);
    s.removeItem("s1");
    expect(useWorkspaceStore.getState().layers[0].instanzen).toHaveLength(0);
    // Auf einem normalen Layer bleibt alles erlaubt
    s.setActiveLayer("l1");
    expect(useWorkspaceStore.getState().addItem("banner.banner", "b_1")).toBe(true);
    expect(useWorkspaceStore.getState().renameLayer("l1", "Wohnzimmer")).toBe(true);
  });
});
