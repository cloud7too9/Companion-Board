// Sperre nach Fehlversuchen (Passwort, PIN, Zugangs-Code): nach `max` falschen Versuchen je Schlüssel
// eine Weile warten. Schlüssel sind der Anzeigename (Passwort), das Gerät (PIN) oder die Adresse des Geräts.
// Hinter dem Tunnel ist die Adresse die aus CF-Connecting-IP (clientIp in server.js), sonst lägen alle Geräte
// auf 127.0.0.1 in einer Sperre. Alle Sperren räumen sich alle 10 Minuten selbst auf: Abgelaufene Sperren und
// alte Fehlversuche fallen weg, sonst wüchse die Liste mit jedem vertippten Namen.

const ALLE = new Set();
setInterval(() => { for (const s of ALLE) s.aufraeumen(); }, 10 * 60_000).unref();

/**
 * @param {{ max?: number, dauerMs?: number, jetzt?: () => number, name?: string }} [optionen]
 *   max: Fehlversuche bis zur Sperre, dauerMs: Länge der Sperre, name: für die Meldung im Log, wenn sie greift
 */
export function fehlversuchSperre({ max = 5, dauerMs = 60_000, jetzt = Date.now, name = '' } = {}) {
  const eintraege = new Map(); // Schlüssel → { anzahl, bis, zuletzt }

  const sperre = {
    /** Restliche Sperrzeit in Sekunden, 0 = nicht gesperrt */
    gesperrt(schluessel) {
      const e = eintraege.get(schluessel);
      if (!e?.bis) return 0;
      const rest = e.bis - jetzt();
      if (rest > 0) return Math.ceil(rest / 1000);
      eintraege.delete(schluessel);
      return 0;
    },
    fehlschlag(schluessel) {
      const e = eintraege.get(schluessel) ?? { anzahl: 0, bis: 0, zuletzt: 0 };
      e.anzahl += 1;
      e.zuletzt = jetzt();
      if (e.anzahl >= max) {
        e.anzahl = 0;
        e.bis = jetzt() + dauerMs;
        if (name) console.warn(`Sperre „${name}“: ${schluessel} für ${Math.round(dauerMs / 1000)} s nach ${max} Fehlversuchen`);
      }
      eintraege.set(schluessel, e);
    },
    erfolg(schluessel) {
      eintraege.delete(schluessel);
    },
    /** Abgelaufene Sperren und Fehlversuche, die länger als 10 × dauerMs zurückliegen, entfernen */
    aufraeumen() {
      const t = jetzt();
      for (const [k, e] of eintraege) if ((e.bis || 0) <= t && t - e.zuletzt > dauerMs * 10) eintraege.delete(k);
    },
    get groesse() { return eintraege.size; },
  };
  ALLE.add(sperre);
  return sperre;
}

/**
 * Höchstens `max` Anfragen je Schlüssel in `fensterMs` (z. B. Registrierungen je Adresse).
 * zaehlen(schluessel) zählt die Anfrage → 0 oder die Wartezeit in Sekunden, wenn die Grenze überschritten ist.
 */
export function anfrageGrenze({ max, fensterMs, jetzt = Date.now, name = '' }) {
  const eintraege = new Map(); // Schlüssel → { start, anzahl }
  const grenze = {
    zaehlen(schluessel) {
      const t = jetzt();
      let e = eintraege.get(schluessel);
      if (!e || t - e.start >= fensterMs) eintraege.set(schluessel, e = { start: t, anzahl: 0 });
      e.anzahl += 1;
      if (e.anzahl <= max) return 0;
      if (name && e.anzahl === max + 1) console.warn(`Grenze „${name}“: ${schluessel} hat ${max} Anfragen erreicht`);
      return Math.ceil((e.start + fensterMs - t) / 1000);
    },
    aufraeumen() {
      const t = jetzt();
      for (const [k, e] of eintraege) if (t - e.start >= fensterMs) eintraege.delete(k);
    },
    get groesse() { return eintraege.size; },
  };
  ALLE.add(grenze);
  return grenze;
}
