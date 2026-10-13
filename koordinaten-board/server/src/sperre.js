// Sperre nach Fehlversuchen (Passwort, PIN, später Zugangs-Code): nach `max` falschen Versuchen je Schlüssel
// eine Weile warten. Schlüssel sind der Anzeigename (Passwort), das Gerät (PIN) oder die Adresse des Geräts.
// Hinter dem Tunnel ist die Adresse die aus CF-Connecting-IP (clientIp in server.js), sonst lägen alle Geräte
// auf 127.0.0.1 in einer Sperre.

/**
 * @param {{ max?: number, dauerMs?: number, jetzt?: () => number }} [optionen]
 *   max: Fehlversuche bis zur Sperre, dauerMs: Länge der Sperre
 */
export function fehlversuchSperre({ max = 5, dauerMs = 60_000, jetzt = Date.now } = {}) {
  const eintraege = new Map(); // ip → { anzahl, bis }

  return {
    /** Restliche Sperrzeit in Sekunden, 0 = nicht gesperrt */
    gesperrt(ip) {
      const e = eintraege.get(ip);
      if (!e?.bis) return 0;
      const rest = e.bis - jetzt();
      if (rest > 0) return Math.ceil(rest / 1000);
      eintraege.delete(ip);
      return 0;
    },
    fehlschlag(ip) {
      const e = eintraege.get(ip) ?? { anzahl: 0, bis: 0 };
      e.anzahl += 1;
      if (e.anzahl >= max) {
        e.anzahl = 0;
        e.bis = jetzt() + dauerMs;
      }
      eintraege.set(ip, e);
    },
    erfolg(ip) {
      eintraege.delete(ip);
    },
  };
}
