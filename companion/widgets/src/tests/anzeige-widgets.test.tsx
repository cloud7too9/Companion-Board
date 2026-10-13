import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useBoardStore } from "@/features/karten/model/board.store";
import { LokalesWidget, istLokalesWidget } from "@/features/anzeige/lokale-widgets";
import { beispielZustand, BEISPIEL_BEITRITT, BEISPIEL_QR } from "@/features/anzeige/lib/beispiel-zustand";
import { istNeu, kurzSeed, umrechnen, vorZeit } from "@/features/anzeige/lib/anzeige-hilfen";
import { WIDGET_TYPEN } from "@/features/workspace/model/widget-register";
import { zahl } from "@/features/karten/lib/zahl";

// Widgets der Anzeige (Bauplan „Sitzung“, S3): rendern aus dem Zustand im Store, ohne Karte vom Server
describe("Widgets der Anzeige", () => {
  beforeEach(() => useBoardStore.setState({ zustand: null, teilnehmer: [], beitritt: null, qrSvg: "" }));

  it("die vier Typen sind lokal und stehen im Register", () => {
    for (const id of ["karte.orte", "board.beitreten", "board.spieler", "board.zuletzt"]) {
      expect(istLokalesWidget(id), id).toBe(true);
      expect(WIDGET_TYPEN.some((t) => t.id === id), id).toBe(true);
    }
    expect(istLokalesWidget("karte.gesamtkarte")).toBe(false);
  });

  it("ohne Zustand: lädt", () => {
    render(<LokalesWidget typ="karte.orte" />);
    expect(screen.getByTestId("widget-laedt")).toBeTruthy();
  });

  it("Orte: angeheftet oben, je Dimension eine Spalte mit Koordinaten und Umrechnung", () => {
    useBoardStore.setState({ zustand: beispielZustand() });
    const { container } = render(<LokalesWidget typ="karte.orte" />);
    expect(container.querySelector('[data-testid="angeheftet"]')?.textContent).toContain("Hauptbasis");
    const spalten = [...container.querySelectorAll('[data-testid="dimension-spalte"]')].map((s) => s.getAttribute("data-dimension"));
    expect(spalten).toEqual(["oberwelt", "nether", "ende"]);
    // Hauptbasis ist angeheftet → nicht noch einmal in der Spalte
    const zeilen = [...container.querySelectorAll('[data-testid="ort-zeile"]')].map((z) => z.getAttribute("data-ort-id"));
    expect(zeilen).not.toContain("b1");
    const festung = container.querySelector('[data-ort-id="b5"]')!;
    expect(festung.textContent).toContain("X −200 · Y 70 · Z 96");
    expect(festung.querySelector('[data-testid="portal-chip"]')?.textContent).toContain("Oberwelt");
    // End City: keine Umrechnung
    expect(container.querySelector('[data-ort-id="b7"] [data-testid="portal-chip"]')).toBeNull();
    // Stronghold ohne Y
    expect(container.querySelector('[data-ort-id="b3"] [data-testid="koordinaten"]')?.textContent).toBe(`X ${zahl(1824)} · Z ${zahl(-96)}`);
  });

  it("Orte: leere Welt", () => {
    useBoardStore.setState({ zustand: { ...beispielZustand(), orte: [] } });
    render(<LokalesWidget typ="karte.orte" />);
    expect(screen.getByTestId("orte-leer").textContent).toContain("Noch keine Orte gespeichert");
  });

  it("Beitreten: QR-Code, Adresse und PIN; ausgeblendet per Einstellung", () => {
    useBoardStore.setState({ zustand: beispielZustand(), beitritt: BEISPIEL_BEITRITT, qrSvg: BEISPIEL_QR });
    const { container, unmount } = render(<LokalesWidget typ="board.beitreten" />);
    expect(container.querySelector('[data-testid="qr"] svg')).toBeTruthy();
    expect(screen.getByTestId("pin").textContent).toBe("000000");
    expect(screen.getByTestId("beitreten").textContent).toContain("mainhubv1.com");
    unmount();
    const z = beispielZustand();
    useBoardStore.setState({ zustand: { ...z, einstellungen: { ...z.einstellungen, qrZeigen: false } } });
    render(<LokalesWidget typ="board.beitreten" />);
    expect(screen.getByTestId("qr-aus")).toBeTruthy();
  });

  it("Spieler: Chips der Teilnehmer, sonst Hinweis", () => {
    const { unmount } = render(<LokalesWidget typ="board.spieler" />);
    expect(screen.getByTestId("spieler-leer")).toBeTruthy();
    unmount();
    useBoardStore.setState({ teilnehmer: ["Max", "Lena"] });
    render(<LokalesWidget typ="board.spieler" />);
    expect(screen.getAllByTestId("spieler-chip").map((c) => c.textContent)).toEqual(["Max", "Lena"]);
  });

  it("Zuletzt: neueste zuerst, mit Urheber", () => {
    useBoardStore.setState({ zustand: beispielZustand() });
    render(<LokalesWidget typ="board.zuletzt" />);
    const zeilen = screen.getAllByTestId("zuletzt-zeile").map((z) => z.textContent);
    expect(zeilen[0]).toContain("Max → Nether Fortress");
    expect(zeilen[1]).toContain("Lena → Stronghold");
  });
});

describe("Hilfen der Anzeige", () => {
  it("Umrechnung Oberwelt ↔ Nether, End ohne", () => {
    expect(umrechnen({ x: 260, z: -420, dimension: "oberwelt" })).toEqual({ x: 32, z: -53, dimension: "nether" });
    expect(umrechnen({ x: -200, z: 96, dimension: "nether" })).toEqual({ x: -1600, z: 768, dimension: "oberwelt" });
    expect(umrechnen({ x: 1, z: 1, dimension: "ende" })).toBeNull();
  });

  it("Seed kurz, Zeit relativ, „Neu“ nur 90 Sekunden", () => {
    expect(kurzSeed("6889192652397090698")).toBe("68891…0698");
    const jetzt = Date.parse("2026-10-13T12:00:00Z");
    expect(vorZeit("2026-10-13T11:59:30Z", jetzt)).toBe("gerade eben");
    expect(vorZeit("2026-10-13T11:45:00Z", jetzt)).toBe("vor 15 Min.");
    const ort = beispielZustand(jetzt).orte[0];
    expect(istNeu({ ...ort, geaendertAm: "2026-10-13T11:59:00Z" }, jetzt)).toBe(true);
    expect(istNeu({ ...ort, geaendertAm: "2026-10-13T11:58:00Z" }, jetzt)).toBe(false);
  });
});
