// Identität (Bauplan „Anmeldung und Dashboard-Zugang“, L2): Konten mit Passwort und PIN statt der Board-PIN.
// Ablauf: Auf der Anmeldeseite meldet man sich mit Anzeigename + Passwort an (oder registriert sich). Das legt
// ein Gerät an und gibt ein Token als Geräteschlüssel zurück (HMAC-signiert { b, g, f }). Danach reicht die PIN –
// verlangt nach über OFFLINE_MINUTEN.konto ohne Kontakt zum Board und nach einem PIN-Wechsel auf einem anderen
// Gerät (L5). Neue Konten gelten erst, wenn ein freigegebenes Konto sie freigibt (L19); das erste Konto gilt
// sofort, weil es sonst niemanden gäbe, der freigeben könnte (⚠ AN14). Alle Einträge hängen an der Benutzer-ID
// (erstellerId), nie am Namen. Das Modul kennt vom Board nur die Daten-Schnittstelle (benutzer…, geraet…, konto…).
import { createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { fehlversuchSperre } from './sperre.js';
import { regeln } from './regeln.js';

const { KONTO_PIN, OFFLINE_MINUTEN, kontoPruefen, anzeigenameSauber } = regeln;
const scryptAsync = promisify(scrypt);
const FARBEN = ['#00e5ff', '#7cff6b', '#ffd23f', '#b98cff', '#ff9f43', '#4dabff'];
/** Den Kontakt eines Geräts zählt jede Anfrage im Speicher; in daten.db landet er höchstens einmal pro Minute,
    sonst bekäme die Zeile bei jeder Anfrage eine neue Version und einen Eintrag in `aenderungen` */
const KONTAKT_SPEICHERN_MS = 60_000;
/** Immer dieselbe Meldung: verrät nicht, ob es den Anzeigenamen gibt */
const ANMELDUNG_FALSCH = 'Anzeigename oder Passwort stimmt nicht';

export class AnmeldeFehler extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fehler = (status, text) => { throw new AnmeldeFehler(status, text); };

/** Passwort, PIN und Dashboard-PIN nur gehasht speichern: scrypt mit eigenem Salz je Wert */
export async function pinHashen(geheimnis) {
  const salz = randomBytes(16);
  const hash = await scryptAsync(String(geheimnis), salz, 32);
  return `scrypt:${salz.toString('base64')}:${hash.toString('base64')}`;
}

export async function pinPasst(geheimnis, gespeichert) {
  const [art, salz, hash] = String(gespeichert ?? '').split(':');
  if (art !== 'scrypt' || !salz || !hash) return false;
  const ist = await scryptAsync(String(geheimnis), Buffer.from(salz, 'base64'), 32);
  const soll = Buffer.from(hash, 'base64');
  return soll.length === ist.length && timingSafeEqual(soll, ist);
}

/** Hash zum Vergleichen, wenn es den Anzeigenamen nicht gibt: gleiche Rechenzeit wie bei einem echten Konto */
let leerHash = null;
const leerHashHolen = async () => (leerHash ??= await pinHashen(randomBytes(16).toString('hex')));

/**
 * @param {{ daten: import('./daten.js').Daten, geheim: string, jetzt?: () => number }} optionen
 *   geheim: Schlüssel für die Signatur der Tokens (bleibt über Neustarts erhalten)
 *   jetzt: Uhr in ms (Tests stellen sie vor, um „30 Minuten offline“ zu prüfen)
 */
export function identitaet({ daten, geheim, jetzt = Date.now }) {
  const signieren = (x) => createHmac('sha256', geheim).update(x).digest('base64url');
  const iso = () => new Date(jetzt()).toISOString();
  // Gegen Durchprobieren: Passwort je Anzeigename, PIN je Gerät, Passwort beim Zurücksetzen je Konto
  const passwortSperre = fehlversuchSperre({ jetzt });
  const pinSperre = fehlversuchSperre({ jetzt });
  const resetSperre = fehlversuchSperre({ jetzt });
  /** geraetId → letzter Kontakt in ms (jede Anfrage, jeder Herzschlag) */
  const kontakte = new Map();

  function tokenErstellen(inhalt) {
    const teil = Buffer.from(JSON.stringify(inhalt)).toString('base64url');
    return `${teil}.${signieren(teil)}`;
  }

  function tokenLesen(token) {
    if (typeof token !== 'string' || !token.includes('.')) return null;
    const [teil, signatur] = token.split('.');
    const erwartet = Buffer.from(signieren(teil));
    const erhalten = Buffer.from(signatur ?? '');
    if (erwartet.length !== erhalten.length || !timingSafeEqual(erwartet, erhalten)) return null;
    try {
      return JSON.parse(Buffer.from(teil, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
  }

  /** Wer steckt hinter einem Token? { id, name, echterName, farbe, geraetId, freigegeben } – null bei unbekanntem Gerät */
  function ausToken(token) {
    const t = tokenLesen(token);
    if (!t?.b || !t?.g) return null;
    const b = daten.benutzerVonGeraet(t.g);
    if (!b || b.id !== t.b) return null;
    return { id: b.id, name: b.anzeigename, echterName: b.echterName, farbe: t.f ?? FARBEN[0], geraetId: t.g, freigegeben: Boolean(b.freigegebenAm) };
  }

  /** Letzter Kontakt in ms: aus dem Speicher oder – nach einem Neustart – aus daten.db */
  const letzterKontakt = (g) => Math.max(kontakte.get(g.id) ?? 0, Date.parse(g.letzterKontakt) || 0);

  /** PIN nötig? → null, „pinwechsel“ oder „offline:<Minuten>“. Wird VOR dem Vermerken des Kontakts gefragt,
      sonst wäre ein Gerät nie „offline“ (Bauplan, Kapitel 5.1). */
  function pinGrund(nutzer) {
    const g = daten.geraet(nutzer.geraetId), b = daten.benutzer(nutzer.id);
    if (!g || !b) return null;
    if ((Date.parse(g.pinBestaetigtAm) || 0) < (Date.parse(b.pinGeaendertAm) || 0)) return 'pinwechsel';
    const minuten = (jetzt() - letzterKontakt(g)) / 60_000;
    return minuten > OFFLINE_MINUTEN.konto ? `offline:${Math.floor(minuten)}` : null;
  }

  /** Kontakt vermerken: im Speicher sofort, in daten.db höchstens einmal pro Minute */
  function kontakt(nutzer) {
    const t = jetzt();
    kontakte.set(nutzer.geraetId, t);
    const g = daten.geraet(nutzer.geraetId);
    if (g && t - (Date.parse(g.letzterKontakt) || 0) >= KONTAKT_SPEICHERN_MS) {
      daten.geraetAendern(g.id, { letzterKontakt: new Date(t).toISOString() });
    }
  }

  /** Neues Gerät für ein Konto → Token und was die Anmeldeseite braucht */
  function geraetFuer(b) {
    const g = daten.geraetAnlegen(b.id, iso());
    kontakte.set(g.id, jetzt());
    return {
      token: tokenErstellen({ b: b.id, g: g.id, f: FARBEN[randomInt(FARBEN.length)] }),
      id: b.id, name: b.anzeigename, freigegeben: Boolean(b.freigegebenAm),
    };
  }

  return {
    ausToken,
    pinGrund,
    kontakt,

    /** IdentitaetsAnbieter: Wer stellt diese Anfrage? (Bearer-Token) */
    werBistDu(req) {
      const kopf = req.headers.authorization ?? '';
      return kopf.startsWith('Bearer ') ? ausToken(kopf.slice(7)) : null;
    },

    /** GET /api/ich: wer, ob freigegeben, ob die PIN fehlt. Kontakt zählt nur ohne PIN-Pflicht. */
    ich(nutzer) {
      const grund = pinGrund(nutzer);
      if (!grund) kontakt(nutzer);
      return {
        benutzer: { id: nutzer.id, anzeigename: nutzer.name, echterName: nutzer.echterName, farbe: nutzer.farbe },
        freigegeben: nutzer.freigegeben, pinNoetig: Boolean(grund), grund,
      };
    },

    /** Erste Anmeldung auf einem Gerät: Anzeigename + Passwort → { token, id, name, freigegeben } */
    async anmelden({ anzeigename, passwort }) {
      const name = anzeigenameSauber(anzeigename);
      const schluessel = name.toLocaleLowerCase('de');
      const rest = passwortSperre.gesperrt(schluessel);
      if (rest) fehler(429, `Zu viele Fehlversuche – bitte ${rest} s warten`);
      const b = name ? daten.benutzerMitName(name) : null;
      const passt = await pinPasst(String(passwort ?? ''), b?.passwortHash ?? await leerHashHolen());
      if (!b || !passt) {
        passwortSperre.fehlschlag(schluessel);
        fehler(401, ANMELDUNG_FALSCH);
      }
      passwortSperre.erfolg(schluessel);
      return geraetFuer(b);
    },

    /** Neues Konto + Gerät. Es wartet auf Freigabe, außer es ist das erste (⚠ AN14). */
    async registrieren(body = {}) {
      const f = kontoPruefen(body);
      if (f) fehler(400, f);
      const b = daten.benutzerAnlegen({
        echterName: String(body.echterName).trim(), anzeigename: anzeigenameSauber(body.anzeigename),
        passwortHash: await pinHashen(body.passwort), pinHash: await pinHashen(body.pin), am: iso(),
      });
      return geraetFuer(b);
    },

    /** Richtige PIN: Gerät gilt wieder (pinBestaetigtAm, letzterKontakt) */
    async pinBestaetigen(nutzer, pin) {
      const rest = pinSperre.gesperrt(nutzer.geraetId);
      if (rest) fehler(429, `Zu viele falsche PINs – bitte ${rest} s warten`);
      const b = daten.benutzer(nutzer.id);
      if (!KONTO_PIN.test(String(pin ?? '')) || !(await pinPasst(pin, b.pinHash))) {
        pinSperre.fehlschlag(nutzer.geraetId);
        fehler(401, `Falsche PIN für ${b.anzeigename}`);
      }
      pinSperre.erfolg(nutzer.geraetId);
      const t = iso();
      kontakte.set(nutzer.geraetId, jetzt());
      daten.geraetAendern(nutzer.geraetId, { pinBestaetigtAm: t, letzterKontakt: t });
      return { ok: true };
    },

    /** PIN vergessen: mit dem Passwort eine neue setzen. Dieses Gerät gilt sofort, alle anderen fragen nach der neuen PIN. */
    async pinZuruecksetzen(nutzer, { passwort, neuePin } = {}) {
      if (!KONTO_PIN.test(String(neuePin ?? ''))) fehler(400, 'Deine PIN hat 4 bis 8 Ziffern');
      const rest = resetSperre.gesperrt(nutzer.id);
      if (rest) fehler(429, `Zu viele Fehlversuche – bitte ${rest} s warten`);
      const b = daten.benutzer(nutzer.id);
      if (!(await pinPasst(String(passwort ?? ''), b.passwortHash))) {
        resetSperre.fehlschlag(nutzer.id);
        fehler(401, 'Das Passwort stimmt nicht');
      }
      resetSperre.erfolg(nutzer.id);
      const t = iso();
      daten.benutzerAendern(b.id, { pinHash: await pinHashen(neuePin), pinGeaendertAm: t });
      kontakte.set(nutzer.geraetId, jetzt());
      daten.geraetAendern(nutzer.geraetId, { pinBestaetigtAm: t, letzterKontakt: t });
      return { ok: true };
    },

    /** Auf diesem Gerät abmelden: das Gerät verschwindet, sein Token gilt nicht mehr */
    abmelden(nutzer) {
      daten.geraetEntfernen(nutzer.geraetId);
      kontakte.delete(nutzer.geraetId);
    },

    konten: () => daten.kontenListe(),
    freigeben: (nutzer, id) => daten.kontoFreigeben(id, nutzer.id, iso()),
    ablehnen: (nutzer, id) => daten.kontoAblehnen(id),
  };
}
