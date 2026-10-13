/**
 * Register aller Widget-Typen der Companion (planung/bauplaene/Bauplan-Widget-Inhalte.md).
 * Typ-IDs bleiben stabil: Eine spätere Zusammenlegung (Kandidat „Einzeleintrag“)
 * darf gespeicherte Instanzen nicht brechen.
 *
 * Typen mit Quelle sind mehrfach: Jede Instanz zeigt ihre eigene Koordinate,
 * ihr Banner, ihr Set … Die Größenstufen kommen aus companion/widget-groessen.mjs,
 * gemeinsam mit dem Server (Bauplan „Sitzung“): Der Server rechnet damit die erste
 * freie Stelle für „Aufs Board“. Die Stufen sind Platzhalter, bis die Planungsrunde A7
 * die Größen festlegt.
 */
import { vertragRegistrieren, stufeVon } from "./widget-vertrag";
import { BEREICHE, type BereichId, type WidgetInstanz, type WidgetTyp } from "./widget-struktur";
import type { Rect } from "../lib/layout-utils";
import { WIDGET_GROESSEN } from "../../../../../widget-groessen.mjs";

type Extra = Pick<WidgetTyp, "zusatzinhalte" | "optional" | "quelle">;

/** Typ registrieren; Stufen und Vollbild aus der gemeinsamen Größen-Datei, mit `quelle` ist er mehrfach */
function typ(id: string, bereich: BereichId, name: string, extra: Extra = {}): WidgetTyp {
  const g = WIDGET_GROESSEN[id];
  if (!g) throw new Error(`Widget „${id}“: keine Größenstufen in widget-groessen.mjs`);
  const stufen = g.stufen;
  const mindest = { breite: Math.min(...stufen.map((s) => s.breite)), hoehe: Math.min(...stufen.map((s) => s.hoehe)) };
  const maximal = { breite: Math.max(...stufen.map((s) => s.breite)), hoehe: Math.max(...stufen.map((s) => s.hoehe)) };
  if (!BEREICHE.some((b) => b.id === bereich)) throw new Error(`Widget „${id}“: unbekannter Bereich ${bereich}`);
  return { id, bereich, name, vertrag: vertragRegistrieren(id, { stufen, mindest, maximal, vollbild: g.vollbild }), mehrfach: Boolean(extra.quelle), ...extra };
}

/** Alle 13 Typen aus dem Bauplan, je Bereich in der Reihenfolge der Tabelle, plus Portal-Verbindung und die Widgets der Anzeige (Bauplan „Sitzung“) */
export const WIDGET_TYPEN: readonly WidgetTyp[] = [
  typ("karte.gesamtkarte", "karte", "Gesamtkarte"),
  typ("karte.einzelkoordinate", "karte", "Einzelkoordinate", { optional: true, quelle: "Koordinate" }),
  typ("karte.koordinatensammlung", "karte", "Koordinatensammlung", { optional: true, quelle: "Sammlung" }),
  typ("karte.orte", "karte", "Orte der Welt"),
  typ("sammelobjekte.gesamtauflistung", "sammelobjekte", "Alle Sammelobjekte"),
  typ("sammelobjekte.eigeneliste", "sammelobjekte", "Eigene Liste", { quelle: "Liste" }),
  typ("sammelobjekte.einzelobjekt", "sammelobjekte", "Einzelobjekt", { quelle: "Objekt" }),
  typ("sammelobjekte.status", "sammelobjekte", "Sammel-Fortschritt"),
  typ("portale.verbindungen", "portale", "Portalverbindungen",
    { zusatzinhalte: [{ abStufe: "groß", inhalt: "Tipps: Mindestabstand zwischen Portalen je Dimension" }] }),
  typ("portale.verbindung", "portale", "Portal-Verbindung", { quelle: "Verbindung" }),
  typ("handbuch.eintrag", "handbuch", "Handbuch-Eintrag", { quelle: "Eintrag" }),
  typ("handbuch.materialliste", "handbuch", "Materialliste", { quelle: "Liste" }),
  typ("bauplaene.bauplan", "bauplaene", "Bauplan", { quelle: "Bauplan" }),
  typ("banner.banner", "banner", "Banner", { quelle: "Banner" }),
  typ("ruestung.set", "ruestung", "Rüstungs-Set", { quelle: "Set" }),
  // Widgets der Anzeige (Bauplan „Sitzung“, S3), gerendert aus dem Zustand des Boards
  typ("board.beitreten", "board", "Beitreten"),
  typ("board.spieler", "board", "Spieler"),
  typ("board.zuletzt", "board", "Zuletzt gespeichert"),
];

const NACH_ID = new Map(WIDGET_TYPEN.map((t) => [t.id, t]));
if (NACH_ID.size !== WIDGET_TYPEN.length) throw new Error("Widget-Typ-IDs müssen eindeutig sein");

export const widgetTyp = (id: string): WidgetTyp | undefined => NACH_ID.get(id);

/** Liegt auf dem Layer schon eine Instanz dieses Typs, der nicht mehrfach sein darf? */
export const schonDa = (instanzen: WidgetInstanz[], typId: string): boolean =>
  NACH_ID.get(typId)?.mehrfach === false && instanzen.some((i) => i.typ === typId);

/** Größe einer Instanz aus ihrer Stufe → Rechteck in Zellen (unbekannter Typ: null) */
export function instanzRect(i: WidgetInstanz): (Rect & { id: string }) | null {
  const t = NACH_ID.get(i.typ);
  if (!t) return null;
  const s = stufeVon(t.vertrag, i.stufe);
  return { id: i.id, x: i.x, y: i.y, w: s.breite, h: s.hoehe };
}

/** Rechtecke aller Instanzen mit bekanntem Typ */
export const instanzRects = (instanzen: WidgetInstanz[]) =>
  instanzen.map(instanzRect).filter((r): r is Rect & { id: string } => r !== null);
