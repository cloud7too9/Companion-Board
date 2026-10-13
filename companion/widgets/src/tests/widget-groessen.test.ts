import { describe, expect, it } from "vitest";
import { WIDGET_GROESSEN, ersteFreieStelle, passt, RASTER_SPALTEN } from "../../../widget-groessen.mjs";
import { WIDGET_TYPEN } from "../features/workspace/model/widget-register";
import { useWorkspaceStore } from "../features/workspace/model/workspace.store";

describe("Größen gemeinsam mit dem Server (companion/widget-groessen.mjs, Bauplan Sitzung)", () => {
  it("jeder Typ im Register nimmt seine Stufen aus der gemeinsamen Datei", () => {
    for (const t of WIDGET_TYPEN) {
      expect(WIDGET_GROESSEN[t.id], t.id).toBeDefined();
      expect(t.vertrag.stufen).toEqual(WIDGET_GROESSEN[t.id].stufen);
      expect(Boolean(t.vertrag.vollbild)).toBe(Boolean(WIDGET_GROESSEN[t.id].vollbild));
    }
  });

  it("erste freie Stelle: zeilenweise von oben links, Rand und belegte Zellen beachtet", () => {
    const stufen = WIDGET_GROESSEN["sammelobjekte.status"].stufen; // 4×3
    expect(ersteFreieStelle([], 18, stufen)).toEqual({ x: 0, y: 0, stufe: "standard" });
    expect(ersteFreieStelle([{ id: "a", x: 0, y: 0, w: RASTER_SPALTEN - 4, h: 3 }], 18, stufen)).toEqual({ x: 28, y: 0, stufe: "standard" });
    expect(ersteFreieStelle([{ id: "a", x: 0, y: 0, w: 32, h: 16 }], 18, stufen)).toBeNull();
    expect(passt({ x: 30, y: 0, w: 4, h: 3 }, [], 18)).toEqual({ passt: false, grund: "rand" });
  });

  it("addItem im Store legt an derselben Stelle an wie die gemeinsame Suche", () => {
    useWorkspaceStore.setState({ layers: [{ id: "l", name: "L", instanzen: [] }], activeLayerId: "l", reihen: 18, reihenGemessen: true });
    const s = useWorkspaceStore.getState();
    expect(s.addItem("sammelobjekte.status")).toBe(true);
    expect(s.addItem("karte.einzelkoordinate", "i_1")).toBe(true);
    const [a, b] = useWorkspaceStore.getState().layers[0].instanzen;
    expect([a.x, a.y]).toEqual([0, 0]);
    expect([b.x, b.y]).toEqual([4, 0]);
  });
});
