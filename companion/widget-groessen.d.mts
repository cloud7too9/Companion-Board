// Typen zu widget-groessen.mjs für das Dashboard (companion/widgets, TypeScript).
// Die Werte selbst stehen nur in der .mjs-Datei.

export interface Groessenstufe {
  name: string;
  breite: number;
  hoehe: number;
  informationsumfang: string;
}

export interface WidgetGroesse {
  stufen: Groessenstufe[];
  vollbild?: boolean;
}

export interface Rechteck {
  x: number;
  y: number;
  w: number;
  h: number;
  id?: string;
}

export interface Grenzen {
  mindest?: { breite: number; hoehe: number };
  maximal?: { breite: number; hoehe: number };
}

export type PasstGrund = "stufe" | "rand" | "belegt";
export interface PasstErgebnis {
  passt: boolean;
  grund?: PasstGrund;
}

export const RASTER_SPALTEN: 32;
export const STANDARD_REIHEN: number;
export const WIDGET_GROESSEN: Readonly<Record<string, WidgetGroesse>>;

export function stufeVon(typ: string, name?: string): Groessenstufe | null;
export function rechteck(instanz: { id: string; typ: string; stufe?: string; x: number; y: number }): (Rechteck & { id: string }) | null;
export function rechtecke(instanzen: { id: string; typ: string; stufe?: string; x: number; y: number }[]): (Rechteck & { id: string })[];
export function belegungBauen(items: Rechteck[], reihen: number, ohneId?: string, spalten?: number): Uint8Array;
export function passt(kandidat: Rechteck, items: Rechteck[], reihen: number, grenzen?: Grenzen, spalten?: number): PasstErgebnis;
export function ersteFreieStelle(belegt: Rechteck[], reihen: number, stufen: Groessenstufe[], spalten?: number): { x: number; y: number; stufe: string } | null;
