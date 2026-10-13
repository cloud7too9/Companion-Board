/* ============================================================================
   nbt.js  ·  NBT in Little Endian lesen (Bedrock)
   ----------------------------------------------------------------------------
   Bedrock speichert level.dat, Block-Entities, Lebewesen, Spieler und globale
   Einträge (portals, …) als NBT mit Little Endian. Ohne Abhängigkeiten, kein
   DOM: genutzt von biom-dekoder.js (level.dat) und welt-funde.js im Worker und
   in Node. Format: Minecraft Wiki „NBT format“ (Bedrock edition).

   Werte: Byte, Short, Int, Float, Double → Zahl · Long → BigInt · String →
   Text · Liste → Array · Compound → Objekt · Byte-, Int- und Long-Array →
   Uint8Array, Int32Array, BigInt64Array (Kopien, der Puffer der Datei kann frei werden).
   ========================================================================== */

export const NBT = Object.freeze({ ENDE: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTES: 7, STRING: 8, LISTE: 9, COMPOUND: 10, INTS: 11, LONGS: 12 });
const MAX_TIEFE = 512;   // kaputte oder böswillige Daten sollen den Stapel nicht sprengen
const text = new TextDecoder();

/** Ein Wurzel-Tag ab Position start → { typ, name, wert, ende }; wirft bei kaputtem NBT */
export function nbtLesen(bytes, start = 0) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = start;
  const pruefen = (n) => { if (n < 0 || o + n > bytes.length) throw new Error("NBT ist abgeschnitten"); };
  const u8 = () => { pruefen(1); return dv.getUint8(o++); };
  const int = () => { pruefen(4); const v = dv.getInt32(o, true); o += 4; return v; };
  const name = () => { pruefen(2); const n = dv.getUint16(o, true); o += 2; pruefen(n); const s = text.decode(bytes.subarray(o, o + n)); o += n; return s; };
  const feld = (n, lesen) => { pruefen(n); const v = lesen(o); o += n; return v; };

  function wert(typ, tiefe) {
    switch (typ) {
      case NBT.BYTE: return feld(1, (p) => dv.getInt8(p));
      case NBT.SHORT: return feld(2, (p) => dv.getInt16(p, true));
      case NBT.INT: return feld(4, (p) => dv.getInt32(p, true));
      case NBT.LONG: return feld(8, (p) => dv.getBigInt64(p, true));
      case NBT.FLOAT: return feld(4, (p) => dv.getFloat32(p, true));
      case NBT.DOUBLE: return feld(8, (p) => dv.getFloat64(p, true));
      case NBT.STRING: return name();
      case NBT.BYTES: { const n = int(); pruefen(n); const v = bytes.slice(o, o + n); o += n; return v; }
      case NBT.INTS: { const n = int(); pruefen(n * 4); const v = new Int32Array(n); for (let i = 0; i < n; i += 1) v[i] = dv.getInt32(o + i * 4, true); o += n * 4; return v; }
      case NBT.LONGS: { const n = int(); pruefen(n * 8); const v = new BigInt64Array(n); for (let i = 0; i < n; i += 1) v[i] = dv.getBigInt64(o + i * 8, true); o += n * 8; return v; }
      case NBT.LISTE: {
        if (tiefe > MAX_TIEFE) throw new Error("NBT ist zu tief verschachtelt");
        const elem = u8(), n = int();
        if (n < 0) throw new Error("NBT-Liste mit negativer Länge");
        if (n > 0 && elem === NBT.ENDE) throw new Error("NBT-Liste ohne Typ");
        const liste = [];
        for (let i = 0; i < n; i += 1) liste.push(wert(elem, tiefe + 1));
        return liste;
      }
      case NBT.COMPOUND: {
        if (tiefe > MAX_TIEFE) throw new Error("NBT ist zu tief verschachtelt");
        const obj = {};
        for (;;) {
          const t = u8();
          if (t === NBT.ENDE) return obj;
          const n = name();
          // defineProperty statt Zuweisung: ein Schlüssel „__proto__“ bleibt ein gewöhnliches Feld
          Object.defineProperty(obj, n, { value: wert(t, tiefe + 1), enumerable: true, writable: true, configurable: true });
        }
      }
      default: throw new Error(`Unbekannter NBT-Typ ${typ}`);
    }
  }

  const typ = u8();
  if (typ === NBT.ENDE) throw new Error("NBT ohne Inhalt");
  const n = name();
  return { typ, name: n, wert: wert(typ, 0), ende: o };
}

/** Mehrere Wurzel-Compounds hintereinander (so liegen Block-Entities eines Chunks) → [Objekt] */
export function nbtAlleLesen(bytes) {
  const liste = [];
  let o = 0;
  while (o < bytes.length) {
    const { wert, ende } = nbtLesen(bytes, o);
    liste.push(wert);
    o = ende;
  }
  return liste;
}

/** level.dat: int32 Version, int32 Länge, danach ein Compound → Objekt */
export function levelDatNbt(bytes) {
  if (bytes.length < 9) throw new Error("level.dat ist abgeschnitten");
  const { typ, wert } = nbtLesen(bytes, 8);
  if (typ !== NBT.COMPOUND) throw new Error("level.dat beginnt nicht mit einem Compound");
  return wert;
}
