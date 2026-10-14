import { useEffect, useState } from "react";
import type { Dimension, Kategorie, Ort } from "../anzeige.types";

export const DIMENSIONEN: { wert: Dimension; label: string }[] = [
  { wert: "oberwelt", label: "Oberwelt" },
  { wert: "nether", label: "Nether" },
  { wert: "ende", label: "End" },
];

const KATEGORIEN: { wert: Kategorie; label: string }[] = [
  { wert: "basis", label: "Basis" },
  { wert: "farm", label: "Farm" },
  { wert: "portal", label: "Portal" },
  { wert: "dorf", label: "Dorf" },
  { wert: "struktur", label: "Struktur" },
  { wert: "ressource", label: "Ressource" },
  { wert: "sonstiges", label: "Sonstiges" },
];

export const dimensionLabel = (d: Dimension) => DIMENSIONEN.find((x) => x.wert === d)?.label ?? d;
export const kategorieLabel = (k: Kategorie) => KATEGORIEN.find((x) => x.wert === k)?.label ?? k;

/** Akzentfarbe je Dimension (wie die Dimensions-Themes der Companion: Oberwelt grün, Nether rot, End violett) */
export const DIMENSION_FARBE: Record<Dimension, string> = { oberwelt: "#2ed47e", nether: "#e0413c", ende: "#a060ff" };

/** Oberwelt ↔ Nether (Faktor 8). Das End hat kein Gegenstück. */
export function umrechnen(p: Pick<Ort, "x" | "z" | "dimension">): { x: number; z: number; dimension: Dimension } | null {
  if (p.dimension === "oberwelt") return { x: Math.floor(p.x / 8), z: Math.floor(p.z / 8), dimension: "nether" };
  if (p.dimension === "nether") return { x: p.x * 8, z: p.z * 8, dimension: "oberwelt" };
  return null;
}

/** Seed kurz wie in der Companion: „68891…0698“ */
export const kurzSeed = (s: string) => (s.length > 12 ? `${s.slice(0, 5)}…${s.slice(-4)}` : s);

export const vorZeit = (iso: string, jetzt: number) => {
  const s = Math.max(0, Math.round((jetzt - Date.parse(iso)) / 1000));
  if (Number.isNaN(s)) return "";
  if (s < 60) return "gerade eben";
  if (s < 3600) return `vor ${Math.round(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} Std.`;
  return new Date(iso).toLocaleDateString("de-DE");
};

const kategorieIndex = (k: Kategorie) => KATEGORIEN.findIndex((x) => x.wert === k);
/** Wie auf der alten Anzeige: nach Kategorie, dann nach Name */
export const sortieren = (a: Ort, b: Ort) => kategorieIndex(a.kategorie) - kategorieIndex(b.kategorie) || a.name.localeCompare(b.name, "de");

/** „Neu“: in den letzten 90 Sekunden angelegt oder geändert */
export const NEU_DAUER_MS = 90_000;
export const istNeu = (o: Ort, jetzt: number) => jetzt - Date.parse(o.geaendertAm) < NEU_DAUER_MS;

/** Aktuelle Zeit, alle `intervall` ms neu (Uhr im Kopf, „vor x Min.“, „Neu“) – am Fernseher so selten wie möglich */
export function useJetzt(intervall = 1000): number {
  const [jetzt, setJetzt] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setJetzt(Date.now()), intervall);
    return () => clearInterval(t);
  }, [intervall]);
  return jetzt;
}
