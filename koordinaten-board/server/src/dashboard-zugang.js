// Dashboard-Zugänge (Bauplan „Anmeldung und Dashboard-Zugang“, L4): Anzeige-Geräte (TV, Tablet) melden sich nicht mit
// einem Konto an, sondern mit einem Zugangs-Code und einer eigenen Dashboard-PIN. Ein Konto erzeugt den Code in der
// Companion (gültig 20 Minuten … dauerhaft, GUELTIGKEITEN). Am Anzeige-Gerät: Code → Ticket (5 Minuten) →
// Dashboard-PIN → Anzeige-Token; danach wählt es sein Layout (eine der Anzeigen). Layout und Raster gehören dem
// Gerät (AN4, Max 14.10.2026): Eine freie Anzeige übernimmt es, eine schon von einem anderen Gerät gewählte
// bekommt es als Kopie („Board 2“). Nach über OFFLINE_MINUTEN.anzeige ohne Kontakt fragt es wieder nach der
// Dashboard-PIN. Ein abgelaufener Code schaltet keine neuen Geräte frei,
// angemeldete laufen weiter; Widerrufen löscht den Zugang und meldet alle seine Anzeigen ab (AN5).
// Codes liegen im Klartext (die Companion zeigt sie), die Dashboard-PIN nur als scrypt-Hash.
import { randomInt } from 'node:crypto';
import { fehlversuchSperre } from './sperre.js';
import { AnmeldeFehler, pinHashen, pinPasst } from './identitaet.js';
import { regeln } from './regeln.js';
import { signierer } from './signatur.js';

const { KONTO_PIN, ZUGANGS_CODE, CODE_ZEICHEN, CODE_LAENGE, OFFLINE_MINUTEN, gueltigkeitPruefen } = regeln;
/** So lange gilt das Ticket zwischen Code und Dashboard-PIN */
const TICKET_MS = 5 * 60_000;
/** Kontakt eines Anzeige-Geräts höchstens so oft in daten.db (wie bei den Konten) */
const KONTAKT_SPEICHERN_MS = 60_000;
/** Bereich eines Widget-Typs (Teil vor dem Punkt) → Name für die Layout-Auswahl */
const BEREICH_NAMEN = { karte: 'Karte', sammelobjekte: 'Sammelobjekte', portale: 'Portale', banner: 'Banner', ruestung: 'Rüstung',
  handbuch: 'Handbuch', bauplaene: 'Baupläne', board: 'Board' };

const fehler = (status, text) => { throw new AnmeldeFehler(status, text); };

/** Zufälliger Zugangs-Code: CODE_LAENGE Zeichen aus CODE_ZEICHEN, gleichverteilt (randomInt ohne Modulo-Verzerrung) */
export function neuerCode() {
  let code = '';
  for (let i = 0; i < CODE_LAENGE; i += 1) code += CODE_ZEICHEN[randomInt(CODE_ZEICHEN.length)];
  return code;
}

/**
 * @param {{ daten: import('./daten.js').Daten, geheim: string, jetzt?: () => number }} optionen
 */
export function dashboardZugang({ daten, geheim, jetzt = Date.now }) {
  const tickets = signierer(geheim, 'ticket');
  const anzeigeTokens = signierer(geheim, 'anzeige');
  const iso = (ms = jetzt()) => new Date(ms).toISOString();
  // Gegen Durchprobieren: Code je Adresse, Dashboard-PIN je Zugang (Freischalten) bzw. je Anzeige-Gerät
  const codeSperre = fehlversuchSperre({ jetzt, name: 'Zugangs-Code je Adresse' });
  const pinSperre = fehlversuchSperre({ jetzt, name: 'Dashboard-PIN' });
  const kontakte = new Map();   // anzeigeGeraetId → letzter Kontakt in ms

  const gueltig = (z) => z.gueltigBis === null || Date.parse(z.gueltigBis) > jetzt();
  const gesperrt = (sperre, schluessel) => {
    const rest = sperre.gesperrt(schluessel);
    if (rest) fehler(429, `Zu viele Fehlversuche – bitte ${rest} s warten`);
  };

  /** Layout-Auswahl: je Anzeige Name, enthaltene Bereiche, Zahl der Widgets (ohne die Sitzung) und ob ein anderes
      Gerät sie schon zeigt (dann bekommt dieses eine Kopie) */
  function layouts(geraet) {
    const belegt = new Set(daten.anzeigeGeraeteListe().filter((a) => a.id !== geraet.id && a.anzeigeId).map((a) => a.anzeigeId));
    return daten.anzeigenListe().map((a) => {
      const { layout } = daten.anzeigeLayout(a.id);
      const instanzen = (layout?.layer ?? []).filter((l) => l.id !== 'sitzung').flatMap((l) => l.instanzen);
      const bereiche = [...new Set(instanzen.map((i) => BEREICH_NAMEN[i.typ.split('.')[0]]).filter(Boolean))];
      return { id: a.id, name: a.name, inhalt: layout ? bereiche.join(', ') || 'leer' : 'Standard-Layout', widgets: layout ? instanzen.length : null,
        belegt: belegt.has(a.id) };
    });
  }

  const letzterKontakt = (g) => Math.max(kontakte.get(g.id) ?? 0, Date.parse(g.letzterKontakt) || 0);

  return {
    neuerCode,

    /** Code generieren (Konto): Gültigkeit in Minuten oder null (dauerhaft) und eigene Dashboard-PIN */
    async erzeugen(nutzer, { minuten, pin } = {}) {
      const f = gueltigkeitPruefen(minuten);
      if (f) fehler(400, f);
      if (!KONTO_PIN.test(String(pin ?? ''))) fehler(400, 'Die Dashboard-PIN hat 4 bis 8 Ziffern');
      const pinHash = await pinHashen(pin);
      let code;
      do code = neuerCode(); while (daten.zugangMitCode(code));
      const t = jetzt();
      const z = daten.zugangAnlegen({ code, pinHash, erstelltVon: nutzer.id, erstelltAm: iso(t), gueltigBis: minuten === null ? null : iso(t + minuten * 60_000) });
      return { id: z.id, code: z.code, erstelltAm: z.erstelltAm, gueltigBis: z.gueltigBis };
    },

    /** Erzeugte Codes, neueste zuerst: Gültigkeit, Ersteller, Zahl der angemeldeten Anzeigen */
    liste() {
      const geraete = daten.anzeigeGeraeteListe();
      return daten.zugaengeListe().map((z) => ({
        id: z.id, code: z.code, erstelltAm: z.erstelltAm, gueltigBis: z.gueltigBis, gueltig: gueltig(z),
        von: (z.erstelltVon && daten.benutzer(z.erstelltVon)?.anzeigename) || 'unbekannt',
        anzeigen: geraete.filter((a) => a.zugangId === z.id).length,
      }));
    },

    /** Widerrufen → IDs der abgemeldeten Anzeige-Geräte (ihre Live-Verbindung schließt server.js) */
    widerrufen(id) {
      const weg = daten.zugangWiderrufen(id);
      for (const a of weg) kontakte.delete(a);
      return weg;
    },

    /** Schritt 1 am Anzeige-Gerät: Code prüfen → Ticket für die Dashboard-PIN */
    codePruefen(code, ip) {
      gesperrt(codeSperre, ip);
      if (!ZUGANGS_CODE.test(String(code ?? ''))) fehler(400, 'Der Zugangs-Code hat genau 5 Zeichen');
      const z = daten.zugangMitCode(code);
      if (!z) {
        codeSperre.fehlschlag(ip);
        fehler(401, 'Der Zugangs-Code stimmt nicht. Achte auf Groß- und Kleinschreibung.');
      }
      codeSperre.erfolg(ip);
      if (!gueltig(z)) fehler(410, 'Dieser Code ist abgelaufen. Erzeug in der Companion unter Board einen neuen.');
      return { ticket: tickets.erstellen({ z: z.id, bis: jetzt() + TICKET_MS }) };
    },

    /** Schritt 2: Ticket + Dashboard-PIN → Anzeige-Gerät und sein Token */
    async freischalten({ ticket, pin } = {}) {
      const t = tickets.lesen(ticket);
      if (!t?.z || !(t.bis > jetzt())) fehler(401, 'Bitte den Zugangs-Code noch einmal eingeben');
      const z = daten.zugang(t.z);
      if (!z) fehler(410, 'Dieser Zugang wurde widerrufen');
      if (!gueltig(z)) fehler(410, 'Dieser Code ist inzwischen abgelaufen');
      gesperrt(pinSperre, `zugang:${z.id}`);
      if (!KONTO_PIN.test(String(pin ?? '')) || !(await pinPasst(pin, z.pinHash))) {
        pinSperre.fehlschlag(`zugang:${z.id}`);
        fehler(401, 'Falsche Dashboard-PIN');
      }
      pinSperre.erfolg(`zugang:${z.id}`);
      const a = daten.anzeigeGeraetAnlegen({ zugangId: z.id, letzterKontakt: iso() });
      kontakte.set(a.id, jetzt());
      return { anzeigeToken: anzeigeTokens.erstellen({ a: a.id, z: z.id }) };
    },

    /** Anzeige-Gerät hinter einem Token → { id, zugangId, anzeigeId, letzterKontakt } oder null (abgemeldet, widerrufen, fremd) */
    ausToken(token) {
      const t = anzeigeTokens.lesen(token);
      if (!t?.a || !t?.z) return null;
      const a = daten.anzeigeGeraet(t.a);
      return a && a.zugangId === t.z && daten.zugang(t.z) ? a : null;
    },

    /** Dashboard-PIN nötig? → null oder „offline:<Minuten>“; VOR dem Vermerken des Kontakts fragen (wie bei den Konten) */
    pinGrund(geraet) {
      const minuten = (jetzt() - letzterKontakt(geraet)) / 60_000;
      return minuten > OFFLINE_MINUTEN.anzeige ? `offline:${Math.floor(minuten)}` : null;
    },

    /** Kontakt vermerken: im Speicher sofort, in daten.db höchstens einmal pro Minute */
    kontakt(geraet) {
      const t = jetzt();
      kontakte.set(geraet.id, t);
      const a = daten.anzeigeGeraet(geraet.id);
      if (a && t - (Date.parse(a.letzterKontakt) || 0) >= KONTAKT_SPEICHERN_MS) daten.anzeigeGeraetAendern(a.id, { letzterKontakt: iso(t) });
    },

    /** GET /api/dashboard/sitzung: PIN nötig, oder das gewählte Layout und die Auswahl */
    sitzung(geraet) {
      const grund = this.pinGrund(geraet);
      if (grund) return { pinNoetig: true, offline: Number(grund.split(':')[1]) };
      this.kontakt(geraet);
      const auswahl = layouts(geraet);
      // Ist die gewählte Anzeige inzwischen gelöscht, wählt das Gerät neu
      const anzeigeId = auswahl.some((l) => l.id === geraet.anzeigeId) ? geraet.anzeigeId : null;
      return { pinNoetig: false, anzeigeId, layouts: auswahl };
    },

    /** Dashboard-PIN am angemeldeten Gerät (nach über 15 Minuten ohne Kontakt) */
    async pinBestaetigen(geraet, pin) {
      gesperrt(pinSperre, `anzeige:${geraet.id}`);
      const z = daten.zugang(geraet.zugangId);
      if (!KONTO_PIN.test(String(pin ?? '')) || !(await pinPasst(pin, z?.pinHash))) {
        pinSperre.fehlschlag(`anzeige:${geraet.id}`);
        fehler(401, 'Falsche Dashboard-PIN');
      }
      pinSperre.erfolg(`anzeige:${geraet.id}`);
      kontakte.set(geraet.id, jetzt());
      daten.anzeigeGeraetAendern(geraet.id, { letzterKontakt: iso() });
      return { ok: true };
    },

    /** Layout wählen (AN4): eine freie Anzeige übernehmen, eine belegte kopieren → { anzeigeId, kopie } */
    layoutWaehlen(geraet, anzeigeId) {
      daten.anzeige(anzeigeId);   // 404, wenn es sie nicht gibt
      this.kontakt(geraet);
      if (geraet.anzeigeId === anzeigeId) return { anzeigeId, kopie: false };
      const belegt = daten.anzeigeGeraeteListe().some((a) => a.id !== geraet.id && a.anzeigeId === anzeigeId);
      const ziel = belegt ? daten.anzeigeKopieren(anzeigeId).id : anzeigeId;
      daten.anzeigeGeraetAendern(geraet.id, { anzeigeId: ziel });
      return { anzeigeId: ziel, kopie: belegt };
    },

    abmelden(geraet) {
      daten.anzeigeGeraetEntfernen(geraet.id);
      kontakte.delete(geraet.id);
    },
  };
}
