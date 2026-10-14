// Koordinaten-Board – der eine Server für Companion (Handys im WLAN) und Anzeige (im Raum):
// liefert die Companion aus, hält die gemeinsamen Daten (daten.json) und synchronisiert live.
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Daten, DatenFehler } from './daten.js';
import { identitaet, AnmeldeFehler } from './identitaet.js';
import { dashboardZugang } from './dashboard-zugang.js';
import QRCode from 'qrcode';
import { companionApi } from './companion-api.js';
import { anzeigeSicht } from './sicht.js';
import { COMPANION_ORDNER } from './regeln.js';
import { widgetKarte, widgetQuellen } from './widgets.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
// Lausch-Adresse: 0.0.0.0 lokal (Handys im WLAN erreichen den Server direkt). Auf dem Pi hinter cloudflared
// HOST=127.0.0.1, dann erreicht den Server nur noch der Tunnel (Umbau Phase 6).
const HOST = process.env.HOST ?? '0.0.0.0';
// Öffentliche Adresse für QR-Code, Anzeige-Link und Konsole (Umbau Phase 6: auf dem Pi die Netlify-Adresse).
// Ohne OEFFENTLICHE_URL gilt localhost; die LAN-Erkennung mit Adress-Lernen ist mit Phase 6 entfallen (E18).
const OEFFENTLICHE_URL = (process.env.OEFFENTLICHE_URL ?? `http://localhost:${PORT}`).replace(/\/$/, '');
// Seiten unter OEFFENTLICHE_URL, lokal wie auf Netlify (Bauplan „Anmeldung“, L3): / Anmeldeseite, /app/ Companion,
// /dashboard/ Anzeige. Der QR-Code zum Beitreten führt auf die Anmeldeseite (COMPANION_PFAD gibt es nicht mehr).
const BEITRITT_URL = `${OEFFENTLICHE_URL}/`;
const DATEN = path.resolve(process.env.DATEN_ORDNER ?? path.join(HIER, '..', 'daten'));
// Widget-Dashboard (companion/widgets, `npm run build` → dist/), ausgeliefert unter /dashboard: die Anzeige (Bauplan „Sitzung“, S4)
const DASHBOARD_DIST = path.join(COMPANION_ORDNER, 'widgets', 'dist');
// Seite der Companion, die unter /app/ ausgeliefert wird
const COMPANION_DATEI = process.env.COMPANION_DATEI ?? 'companion-prototyp.html';
// Anzeige nur mit Anzeige-Link (Anzeige + Schlüssel) oder Anzeige-Token (Zugangs-Code + Dashboard-PIN, Bauplan
// „Anmeldung“, L4), auch auf dem Board-Gerät selbst (Umbau Phase 1): hinter einem Tunnel käme sonst jede Anfrage
// aus dem Internet als „localhost“ herein.

// ---------- Signatur der Tokens (bleibt über Neustarts erhalten) ----------

async function dauerwertLaden(datei, erzeugen) {
  const pfad = path.join(DATEN, datei);
  try {
    return (await readFile(pfad, 'utf8')).trim();
  } catch {
    const wert = erzeugen();
    await writeFile(pfad, wert);
    return wert;
  }
}

await mkdir(DATEN, { recursive: true });
// Die Board-PIN (RAUM_PIN, pin.txt) ist weg (Bauplan „Anmeldung“, L15): angemeldet wird mit Konto und Passwort.
const GEHEIM = await dauerwertLaden('geheim.txt', () => randomBytes(32).toString('hex'));
// Uhr des Servers für PIN-Pflicht und Gültigkeit. Mit TEST_UHR=1 (nur Tests) stellt POST /api/test/uhr { minuten }
// sie vor – so lässt sich „über 30 Minuten offline“ prüfen, ohne zu warten.
let uhrVersatz = 0;
const jetzt = () => Date.now() + uhrVersatz;

/** Kommt die Verbindung vom Gerät selbst (loopback)? Gibt keine Rechte mehr; dort sitzt hinter dem Tunnel cloudflared. */
const istLokal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
/** Adresse des Geräts für Sperren. Hinter cloudflared (Umbau Phase 6) kommt jede Anfrage von
 *  127.0.0.1 und trägt die echte Adresse im Header CF-Connecting-IP. Der Header zählt nur von loopback, sonst
 *  könnte ein Handy im WLAN die Sperre mit einem erfundenen Header umgehen. */
function clientIp(req) {
  const kopf = req.headers['cf-connecting-ip'];
  if (istLokal(req) && typeof kopf === 'string' && kopf.trim()) return kopf.trim();
  return req.socket.remoteAddress;
}
/** Anzeige-Token: ?anzeigeToken=… (WebSocket, Links) oder Header „Authorization: Bearer …“ */
const anzeigeTokenVon = (req) => {
  if (typeof req.query?.anzeigeToken === 'string') return req.query.anzeigeToken;
  const kopf = req.headers.authorization ?? '';
  return kopf.startsWith('Bearer ') ? kopf.slice(7) : '';
};
/**
 * Darf diese Anfrage Anzeige sein? Mit gültigem Anzeige-Link (?anzeige=…&schluessel=…) oder mit dem Anzeige-Token
 * eines Anzeige-Geräts, das ein Layout gewählt hat und nicht über 15 Minuten offline war (sonst pinNoetig).
 * → { erlaubt, anzeige, geraet?, pinNoetig? }; nur ein erlaubtes Anzeige-Gerät zählt als Kontakt.
 */
const anzeigeZugang = (req) => {
  const { anzeige, schluessel } = req.query ?? {};
  if (anzeige) {
    const mitLink = daten.anzeigeMitSchluessel(String(anzeige), String(schluessel ?? ''));
    return { erlaubt: Boolean(mitLink), anzeige: mitLink };
  }
  const geraet = dash.ausToken(anzeigeTokenVon(req));
  if (!geraet) return { erlaubt: false, anzeige: null };
  if (dash.pinGrund(geraet)) return { erlaubt: false, anzeige: null, geraet, pinNoetig: true };
  const gewaehlt = daten.anzeigenListe().find((a) => a.id === geraet.anzeigeId);
  if (!gewaehlt) return { erlaubt: false, anzeige: null, geraet };   // noch kein Layout gewählt oder Anzeige gelöscht
  dash.kontakt(geraet);
  return { erlaubt: true, anzeige: gewaehlt, geraet };
};
/** Antwort, wenn anzeigeZugang nicht erlaubt: Dashboard-PIN nötig (423), Layout fehlt (409), sonst 403 */
function anzeigeAbgelehnt(reply, zugang, text = 'Anzeige nur mit Anzeige-Link oder Zugangs-Code') {
  if (zugang.pinNoetig) return reply.code(423).send({ error: 'pin', fehler: 'Dashboard-PIN nötig', message: 'Dashboard-PIN nötig' });
  if (zugang.geraet) return reply.code(409).send({ error: 'layout', fehler: 'Erst ein Layout wählen', message: 'Erst ein Layout wählen' });
  return reply.code(403).send({ fehler: text, message: text });
}

/** Anzeige-Link aufs Dashboard – dieselbe Adresse wie im QR-Code der Handys; ohne ihn ist kein Gerät Anzeige, auch das Board-Gerät nicht */
const anzeigeLink = (a) => `${OEFFENTLICHE_URL}/dashboard?anzeige=${encodeURIComponent(a.id)}&schluessel=${encodeURIComponent(a.schluessel)}`;

// ---------- Daten ----------

// Die alte zustand.json (Orte der früheren Board-Steuerung) bleibt als Sicherung liegen.
const daten = new Daten(DATEN);
await daten.laden();
// Konten mit Passwort und PIN, Geräteschlüssel, „Wer bist du?“ (Bauplan „Anmeldung“, identitaet.js)
const ident = identitaet({ daten, geheim: GEHEIM, jetzt });
// Anzeige-Geräte mit Zugangs-Code und Dashboard-PIN (Bauplan „Anmeldung“, L4, dashboard-zugang.js)
const dash = dashboardZugang({ daten, geheim: GEHEIM, jetzt });

// ---------- Server ----------

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'warn' } });

// ---------- CORS (Umbau Phase 1): Seiten und API kommen künftig von verschiedenen Ursprüngen ----------
// (Netlify ↔ api.<domain>). Für /api und /ws gelten nur Ursprünge aus ERLAUBTE_URSPRUENGE (kommagetrennt;
// Standard: die Vite-Dev-Server von Anzeige und Dashboard) und der eigene Ursprung, solange der Server die
// Seiten selbst ausliefert (Browser schicken Origin auch bei same-origin POST/PUT/DELETE). Anfragen ohne
// Origin (curl, Node, Kamera-App) sind kein Browser-Ursprung und bleiben wie bisher.
const ERLAUBTE_URSPRUENGE = new Set((process.env.ERLAUBTE_URSPRUENGE ?? 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map((u) => u.trim().replace(/\/$/, '')).filter(Boolean));
function ursprungErlaubt(req) {
  const origin = req.headers.origin;
  if (ERLAUBTE_URSPRUENGE.has(origin)) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
const CORS_METHODEN = 'GET, POST, PUT, DELETE, OPTIONS';
app.addHook('onRequest', async (req, reply) => {
  const pfad = req.url.split('?')[0];
  if (!(pfad === '/api' || pfad.startsWith('/api/') || pfad === '/ws')) return;
  const origin = req.headers.origin;
  if (!origin) return;
  if (!ursprungErlaubt(req)) return reply.code(403).send({ fehler: 'Ursprung nicht erlaubt' });
  reply.header('Access-Control-Allow-Origin', origin).header('Vary', 'Origin');
  // Chrome fragt vor Anfragen ins Heimnetz zusätzlich nach (Private Network Access)
  if (req.headers['access-control-request-private-network'] === 'true') {
    reply.header('Access-Control-Allow-Private-Network', 'true');
  }
});
// Preflight für alle API-Pfade (auch PUT und DELETE); die Ursprungsprüfung macht der Hook oben
app.options('/api/*', async (req, reply) =>
  reply
    .header('Access-Control-Allow-Methods', CORS_METHODEN)
    .header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    .header('Access-Control-Max-Age', '600')
    .code(204)
    .send());
// ---------- Anmeldung (Bauplan „Anmeldung“, L2): Wer fragt, ist das Konto frei, fehlt die PIN? ----------
// Bei jeder Anfrage mit gültigem Token: wartendes Konto → 403, PIN nötig (über 30 Min. ohne Kontakt oder PIN
// woanders gewechselt) → 423. Erst danach zählt die Anfrage als Kontakt. Ohne gültiges Token entscheidet die Route
// (öffentlich oder 401). req.nutzer ist danach der angemeldete Nutzer. Die Routen der Anzeige-Geräte unter
// /api/dashboard/ (außer den Zugängen, die ein Konto verwaltet) prüfen ihren Anzeige-Token selbst.
const OEFFENTLICH = new Set(['/api/server', '/api/anmelden', '/api/registrieren', '/api/test/uhr']);
const oeffentlich = (pfad) => OEFFENTLICH.has(pfad) || (pfad.startsWith('/api/dashboard/') && !pfad.startsWith('/api/dashboard/zugaenge'));
const OHNE_FREIGABE = new Set(['/api/ich', '/api/abmelden']);
const OHNE_PIN = new Set(['/api/ich', '/api/pin', '/api/pin/zuruecksetzen', '/api/abmelden']);
const WARTET = 'Dein Konto wartet auf Freigabe';
app.decorateRequest('nutzer', null);
app.addHook('onRequest', async (req, reply) => {
  const pfad = req.url.split('?')[0];
  if (req.method === 'OPTIONS' || !pfad.startsWith('/api/') || oeffentlich(pfad)) return;
  const nutzer = ident.werBistDu(req);
  if (!nutzer) return;
  if (!nutzer.freigegeben && !OHNE_FREIGABE.has(pfad)) return reply.code(403).send({ error: 'freigabe', fehler: WARTET, message: WARTET });
  if (!OHNE_PIN.has(pfad)) {
    const grund = ident.pinGrund(nutzer);
    if (grund) return reply.code(423).send({ error: 'pin', fehler: 'PIN nötig', message: 'PIN nötig', grund });
    ident.kontakt(nutzer);
  }
  req.nutzer = nutzer;
});
await app.register(fastifyWebsocket);
// Leerer Rumpf bei „Content-Type: application/json“ (z. B. DELETE) ist kein Fehler
app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, rumpf, fertig) => {
  if (!rumpf) return fertig(null, {});
  try {
    fertig(null, JSON.parse(rumpf));
  } catch (f) {
    f.statusCode = 400;
    fertig(f);
  }
});

/** Antwort bei abgelehnter Anmeldung (falsche PIN, Sperre, Name doppelt …) */
function anmeldeFehler(reply, f) {
  if (f instanceof AnmeldeFehler || f instanceof DatenFehler) return reply.code(f.status).send({ fehler: f.message, message: f.message });
  throw f;
}

// Konten (Bauplan „Anmeldung“, L2): anmelden, registrieren, PIN, Freigabe. Die Anmeldeseite (/) ruft sie auf.
app.post('/api/anmelden', async (req, reply) => {
  try {
    return await ident.anmelden(req.body ?? {});
  } catch (f) {
    return anmeldeFehler(reply, f);
  }
});
app.post('/api/registrieren', async (req, reply) => {
  try {
    const r = await ident.registrieren(req.body ?? {});
    geaendertMelden('konten');
    return reply.code(201).send(r);
  } catch (f) {
    return anmeldeFehler(reply, f);
  }
});
/** Route nur für angemeldete Geräte; req.nutzer setzt der Hook oben */
const angemeldet = (req, reply) => {
  if (req.nutzer) return true;
  reply.code(401).send({ error: 'anmeldung', fehler: 'Nicht angemeldet', message: 'Nicht angemeldet' });
  return false;
};
app.get('/api/ich', async (req, reply) => (angemeldet(req, reply) ? ident.ich(req.nutzer) : reply));
app.post('/api/pin', async (req, reply) => {
  if (!angemeldet(req, reply)) return reply;
  try {
    return await ident.pinBestaetigen(req.nutzer, req.body?.pin);
  } catch (f) {
    return anmeldeFehler(reply, f);
  }
});
app.post('/api/pin/zuruecksetzen', async (req, reply) => {
  if (!angemeldet(req, reply)) return reply;
  try {
    const r = await ident.pinZuruecksetzen(req.nutzer, req.body ?? {});
    // Andere Geräte des Kontos brauchen die neue PIN: ihre Live-Verbindung endet, die nächste Anfrage bekommt 423
    geraeteTrennen((v) => v.nutzer?.id === req.nutzer.id && v.nutzer.geraetId !== req.nutzer.geraetId, 4023, 'PIN nötig');
    return r;
  } catch (f) {
    return anmeldeFehler(reply, f);
  }
});
app.post('/api/abmelden', async (req, reply) => {
  if (!angemeldet(req, reply)) return reply;
  ident.abmelden(req.nutzer);
  geraeteTrennen((v) => v.nutzer?.geraetId === req.nutzer.geraetId, 4001, 'Abgemeldet');
  return { ok: true };
});
app.get('/api/konten', async (req, reply) => (angemeldet(req, reply) ? { konten: ident.konten() } : reply));
app.post('/api/konten/:id/freigeben', async (req, reply) => {
  if (!angemeldet(req, reply)) return reply;
  try {
    const konto = ident.freigeben(req.nutzer, req.params.id);
    geaendertMelden('konten');
    return { konto };
  } catch (f) {
    return anmeldeFehler(reply, f);
  }
});
app.delete('/api/konten/:id', async (req, reply) => {
  if (!angemeldet(req, reply)) return reply;
  try {
    ident.ablehnen(req.nutzer, req.params.id);
    geaendertMelden('konten');
    return { ok: true };
  } catch (f) {
    return anmeldeFehler(reply, f);
  }
});
if (process.env.TEST_UHR === '1') {
  app.post('/api/test/uhr', async (req) => {
    uhrVersatz += Number(req.body?.minuten ?? 0) * 60_000;
    return { versatzMinuten: uhrVersatz / 60_000 };
  });
}

// ---------- Dashboard-Zugänge (Bauplan „Anmeldung“, L4, Kapitel 5.2) ----------
// Ein Konto erzeugt einen Zugangs-Code mit Dashboard-PIN. Das Anzeige-Gerät tauscht Code → Ticket → Anzeige-Token,
// wählt ein Layout (eine der Anzeigen) und liest damit /api/anzeige/*, /api/widgets/* und /ws (Rolle anzeige).
app.post('/api/dashboard/zugaenge', async (req, reply) => {
  if (!angemeldet(req, reply)) return reply;
  try {
    const zugang = await dash.erzeugen(req.nutzer, req.body ?? {});
    geaendertMelden('zugaenge');
    return reply.code(201).send(zugang);
  } catch (f) {
    return anmeldeFehler(reply, f);
  }
});
app.get('/api/dashboard/zugaenge', async (req, reply) => (angemeldet(req, reply) ? { zugaenge: dash.liste() } : reply));
app.delete('/api/dashboard/zugaenge/:id', async (req, reply) => {
  if (!angemeldet(req, reply)) return reply;
  try {
    const weg = new Set(dash.widerrufen(req.params.id));
    // Alle damit angemeldeten Anzeigen sind abgemeldet (AN5): ihre Live-Verbindung endet sofort
    geraeteTrennen((v) => weg.has(v.anzeigeGeraetId), 4003, 'Zugang widerrufen');
    geaendertMelden('zugaenge');
    return { ok: true, abgemeldet: weg.size };
  } catch (f) {
    return anmeldeFehler(reply, f);
  }
});
app.post('/api/dashboard/code', async (req, reply) => {
  try {
    return dash.codePruefen(req.body?.code, clientIp(req));
  } catch (f) {
    return anmeldeFehler(reply, f);
  }
});
app.post('/api/dashboard/freischalten', async (req, reply) => {
  try {
    const r = await dash.freischalten(req.body ?? {});
    geaendertMelden('zugaenge');   // Zahl der Anzeigen je Code
    return r;
  } catch (f) {
    return anmeldeFehler(reply, f);
  }
});
/** Route nur für angemeldete Anzeige-Geräte → das Gerät oder null (dann ist 401 schon gesendet) */
function anzeigeGeraetVon(req, reply) {
  const geraet = dash.ausToken(anzeigeTokenVon(req));
  if (!geraet) {
    const text = 'Diese Anzeige ist nicht mehr angemeldet';
    reply.code(401).send({ error: 'anmeldung', fehler: text, message: text });
  }
  return geraet;
}
app.get('/api/dashboard/sitzung', async (req, reply) => {
  const geraet = anzeigeGeraetVon(req, reply);
  return geraet ? dash.sitzung(geraet) : reply;
});
app.post('/api/dashboard/pin', async (req, reply) => {
  const geraet = anzeigeGeraetVon(req, reply);
  if (!geraet) return reply;
  try {
    return await dash.pinBestaetigen(geraet, req.body?.pin);
  } catch (f) {
    return anmeldeFehler(reply, f);
  }
});
app.put('/api/dashboard/layout', async (req, reply) => {
  const geraet = anzeigeGeraetVon(req, reply);
  if (!geraet) return reply;
  if (dash.pinGrund(geraet)) return anzeigeAbgelehnt(reply, { geraet, pinNoetig: true });
  try {
    return dash.layoutWaehlen(geraet, String(req.body?.anzeigeId ?? ''));
  } catch (f) {
    return anmeldeFehler(reply, f);
  }
});
app.post('/api/dashboard/abmelden', async (req, reply) => {
  const geraet = anzeigeGeraetVon(req, reply);
  if (!geraet) return reply;
  dash.abmelden(geraet);
  geraeteTrennen((v) => v.anzeigeGeraetId === geraet.id, 4001, 'Abgemeldet');
  geaendertMelden('zugaenge');
  return { ok: true };
});

app.get('/api/anzeige', async (req, reply) => {
  const zugang = anzeigeZugang(req);
  if (!zugang.erlaubt) return anzeigeAbgelehnt(reply, zugang);
  return {
    anzeige: zugang.anzeige && { id: zugang.anzeige.id, name: zugang.anzeige.name },
    beitrittsUrl: BEITRITT_URL,   // die Anmeldeseite (Bauplan „Anmeldung“: keine Board-PIN mehr)
    adresse: OEFFENTLICHE_URL,
  };
});

// QR-Code zur Anmeldeseite als SVG fürs Widget „Beitreten“ des Dashboards (Bauplan „Sitzung“, S3)
app.get('/api/anzeige/qr', async (req, reply) => {
  const zugang = anzeigeZugang(req);
  if (!zugang.erlaubt) return anzeigeAbgelehnt(reply, zugang);
  return { svg: await QRCode.toString(BEITRITT_URL, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }) };
});

// Widget-Dashboard (A6): Die Anzeige liest ihr Layout und meldet ihre Reihen. Welche Anzeige sie ist,
// sagt der Anzeige-Link bzw. das gewählte Layout des Anzeige-Geräts.
function anzeigeVonAnfrage(req, reply) {
  const zugang = anzeigeZugang(req);
  if (!zugang.erlaubt) {
    anzeigeAbgelehnt(reply, zugang);
    return null;
  }
  return zugang.anzeige;
}
app.get('/api/anzeige/layout', async (req, reply) => {
  const a = anzeigeVonAnfrage(req, reply);
  return a && daten.anzeigeLayout(a.id);
});
app.put('/api/anzeige/reihen', async (req, reply) => {
  const a = anzeigeVonAnfrage(req, reply);
  if (!a) return reply;
  const reihen = req.body?.reihen;
  if (!Number.isInteger(reihen) || reihen < 1 || reihen > 200) return reply.code(400).send({ fehler: 'Reihen müssen eine ganze Zahl von 1 bis 200 sein' });
  if (daten.anzeigeReihenSetzen(a.id, reihen)) geaendertMelden('anzeigen');
  return { reihen };
});

// Daran erkennt die Companion, dass sie vom Board ausgeliefert wird (Live-Betrieb statt DEMO)
app.get('/api/server', async () => ({ name: 'koordinaten-board' }));

await app.register(companionApi, {
  prefix: '/api',
  daten,
  nutzer: (req) => req.nutzer,
  geaendert: (bereich, weltId = null, anzeigeId = null) => {
    // anzeigeId (Bauplan „Sitzung“): beim Bereich layout, damit nur die betroffene Anzeige neu lädt
    geaendertMelden(bereich, weltId, anzeigeId);
    if (['welten', 'orte', 'einstellungen'].includes(bereich)) anAlle({ art: 'zustand', zustand: anzeigeSicht(daten) });
    if (bereich === 'anzeigen') {
      veralteteAnzeigenTrennen();
      anzeigeLinkMerken();
    }
  },
  anzeigeLink,
  aenderungenSeit,
});

// Widgets des Dashboards: fertige Karte je Widget-Typ (und Quelle) aus den Daten der aktiven Welt.
// Lesen darf die Anzeige (mit Anzeige-Link oder Anzeige-Token) und jedes angemeldete Handy.
await app.register(async (widgets) => {
  widgets.addHook('onRequest', async (req, reply) => {
    if (req.nutzer) return;
    const zugang = anzeigeZugang(req);
    if (!zugang.erlaubt) return anzeigeAbgelehnt(reply, zugang, 'Widgets nur auf der Anzeige oder für angemeldete Handys');
  });
  widgets.get('/:typ', async (req, reply) => {
    const quelle = typeof req.query.quelle === 'string' ? req.query.quelle : '';
    return (await widgetKarte(daten, req.params.typ, quelle)) ?? reply.code(404).send({ fehler: 'Unbekannter Widget-Typ' });
  });
  widgets.get('/:typ/quellen', async (req, reply) =>
    widgetQuellen(daten, req.params.typ) ?? reply.code(404).send({ fehler: 'Unbekannter Widget-Typ' }));
}, { prefix: '/api/widgets' });

// ---------- Echtzeit-Sync ----------

const verbindungen = new Set(); // { socket, rolle, nutzer, zugang? (Anzeige-Link), anzeigeGeraetId? (Anzeige-Token) }

/** Nach „Neuer Schlüssel“ oder gelöschter Anzeige: Anzeigen trennen, deren Link bzw. Layout nicht mehr gilt */
function veralteteAnzeigenTrennen() {
  const anzeigen = new Set(daten.anzeigenListe().map((a) => a.id));
  for (const v of verbindungen) {
    if (v.rolle !== 'anzeige') continue;
    if (v.zugang && !daten.anzeigeMitSchluessel(v.zugang.id, v.zugang.schluessel)) v.socket.close(4003, 'Anzeige-Link nicht mehr gültig');
    if (v.anzeigeGeraetId && !anzeigen.has(daten.anzeigeGeraet(v.anzeigeGeraetId)?.anzeigeId)) v.socket.close(4003, 'Diese Anzeige gibt es nicht mehr');
  }
}

function senden(socket, nachricht) {
  if (socket.readyState === 1) socket.send(JSON.stringify(nachricht));
}

function anAlle(nachricht) {
  const text = JSON.stringify(nachricht);
  for (const v of verbindungen) if (v.socket.readyState === 1) v.socket.send(text);
}

// ---------- Änderungsnummern (Bauplan Offline, B3): Nachladen nach einer Unterbrechung ----------
// Jede geaendert-Meldung trägt eine fortlaufende Nummer nr und den lauf (ändert sich bei jedem Start des Servers).
// Die Companion merkt sich { lauf, nr }; ist sie getrennt gewesen oder offline gestartet, fragt sie
// GET /api/aenderungen?seit=<nr>&lauf=<lauf> und lädt nur die genannten Bereiche – oder alles, wenn der Server
// neu gestartet ist oder die Lücke weiter zurückreicht, als er sich merkt. Gedächtnis nur im Speicher: Nach einem
// Neustart lädt eh jeder alles neu (die Tabelle aenderungen in daten.db schreibt verzögert und kennt die Biome nicht).
const AENDERUNGEN_MERKEN = 1000;
const aenderungen = { lauf: randomBytes(6).toString('base64url'), nr: 0, liste: [] };

function geaendertMelden(bereich, weltId = null, anzeigeId = null) {
  aenderungen.nr += 1;
  const eintrag = { nr: aenderungen.nr, bereich, weltId, ...(anzeigeId ? { anzeigeId } : {}) };
  aenderungen.liste.push(eintrag);
  if (aenderungen.liste.length > AENDERUNGEN_MERKEN) aenderungen.liste.shift();
  anAlle({ art: 'geaendert', ...eintrag, lauf: aenderungen.lauf });
}

/** → { lauf, nr, alles:true } oder { lauf, nr, alles:false, aenderungen:[{ bereich, weltId, anzeigeId? }] } (je Bereich einmal) */
function aenderungenSeit(seit, lauf) {
  const { liste, nr } = aenderungen;
  const stand = { lauf: aenderungen.lauf, nr };
  const alt = Number(seit);
  const vollstaendig = Number.isInteger(alt) && alt >= 0 && alt <= nr && (liste.length ? alt >= liste[0].nr - 1 : alt === nr);
  if (lauf !== aenderungen.lauf || !vollstaendig) return { ...stand, alles: true };
  const gesehen = new Set();
  const bereiche = [];
  for (const { nr: n, ...e } of liste) {
    const schluessel = `${e.bereich}|${e.weltId}|${e.anzeigeId ?? ''}`;
    if (n > alt && !gesehen.has(schluessel)) { gesehen.add(schluessel); bereiche.push(e); }
  }
  return { ...stand, alles: false, aenderungen: bereiche };
}

/**
 * „Aufs Board“ (Bauplan „Sitzung“): { art:"zeigen", quelle, anzeigeId?, anfrage } legt die Quelle als
 * Widget in die Sitzung der Anzeige (ohne anzeigeId: die erste); { art:"verbergen", instanzId } nimmt es weg.
 * Antwort ok { anfrage, instanzId }; live geht geaendert „layout“ mit anzeigeId an alle.
 */
async function sitzungBearbeiten(op, verbindung) {
  const antwortFehler = (text) => senden(verbindung.socket, { art: 'fehler', text, anfrage: op.anfrage });
  try {
    const anzeigeId = typeof op.anzeigeId === 'string' && op.anzeigeId ? op.anzeigeId : daten.anzeigenListe()[0]?.id;
    if (!anzeigeId) return antwortFehler('Es gibt keine Anzeige');
    if (op.art === 'zeigen') {
      const { instanz, neu } = daten.sitzungHinzufuegen(anzeigeId, { quelle: op.quelle, nutzer: verbindung.nutzer });
      // Karte einmal bauen: ihr Titel steht in der Liste am Handy
      const { karte } = (await widgetKarte(daten, instanz.typ, instanz.quelle ?? '')) ?? { karte: null };
      if (karte && (neu || !instanz.titel)) daten.sitzungen.titelSetzen(anzeigeId, instanz.id, karte.titel);
      geaendertMelden('layout', null, anzeigeId);
      senden(verbindung.socket, { art: 'ok', anfrage: op.anfrage, instanzId: instanz.id, titel: karte?.titel ?? instanz.titel });
    } else {
      if (daten.sitzungEntfernen(anzeigeId, op.instanzId)) geaendertMelden('layout', null, anzeigeId);
      senden(verbindung.socket, { art: 'ok', anfrage: op.anfrage });
    }
  } catch (f) {
    if (f instanceof DatenFehler) return antwortFehler(f.message);
    console.error(f);
    antwortFehler('Das Board konnte die Karte nicht bauen');
  }
}

/** Nachrichten zum Zeigen – true, wenn die Nachricht damit erledigt ist */
function zeigenBearbeiten(op, verbindung) {
  if ((op.art === 'zeigen' && typeof op.quelle === 'string') || (op.art === 'verbergen' && typeof op.instanzId === 'string')) {
    void sitzungBearbeiten(op, verbindung);
    return true;
  }
  if (op.art !== 'zeigen' && op.art !== 'verbergen') return false;
  // Alter Weg mit fertiger Karte (bis S4): eine Companion aus dem Cache, die noch nicht neu geladen ist
  senden(verbindung.socket, { art: 'fehler', text: 'Die Companion ist veraltet – bitte neu laden', anfrage: op.anfrage });
  return true;
}

/** Live-Verbindungen schließen, z. B. nach PIN-Wechsel (andere Geräte) oder Abmelden */
function geraeteTrennen(passt, code, grund) {
  for (const v of verbindungen) if (passt(v)) v.socket.close(code, grund);
}

function teilnehmerMelden() {
  const namen = [...new Set([...verbindungen].filter((v) => v.nutzer).map((v) => v.nutzer.name))];
  anAlle({ art: 'teilnehmer', namen });
}

app.get('/ws', { websocket: true }, (socket, req) => {
  const { token, rolle } = req.query ?? {};
  let verbindung;
  if (rolle === 'anzeige') {
    const zugang = anzeigeZugang(req);
    if (zugang.pinNoetig) return socket.close(4023, 'Dashboard-PIN nötig');
    if (!zugang.erlaubt) return socket.close(4003, zugang.geraet ? 'Erst ein Layout wählen' : 'Anzeige nur mit Anzeige-Link oder Zugangs-Code');
    if (zugang.geraet) {
      // Anzeige-Gerät: Widerrufen, Abmelden oder eine gelöschte Anzeige schließen die Verbindung (geraeteTrennen,
      // veralteteAnzeigenTrennen); jedes Pong ist Kontakt, wie bei den Handys
      const { geraet } = zugang;
      verbindung = { socket, rolle: 'anzeige', nutzer: null, anzeigeGeraetId: geraet.id };
      socket.on('pong', () => { if (!dash.pinGrund(geraet)) dash.kontakt(geraet); });
    } else {
      // Wird der Schlüssel neu erzeugt, fliegt die Anzeige mit dem alten raus (veralteteAnzeigenTrennen)
      verbindung = { socket, rolle: 'anzeige', nutzer: null, zugang: { id: zugang.anzeige.id, schluessel: zugang.anzeige.schluessel } };
    }
  } else {
    // Wie bei REST: wartendes Konto oder fehlende PIN → keine Live-Verbindung (sonst hielte der Herzschlag das Gerät frisch)
    const nutzer = ident.ausToken(token);
    if (!nutzer) return socket.close(4001, 'Nicht angemeldet');
    if (!nutzer.freigegeben) return socket.close(4030, WARTET);
    if (ident.pinGrund(nutzer)) return socket.close(4023, 'PIN nötig');
    ident.kontakt(nutzer);
    verbindung = { socket, rolle: 'steuerung', nutzer };
    // Herzschlag: Der Server pingt alle 25 s, jedes Pong ist Kontakt – solange die Companion verbunden ist, läuft kein Timer
    socket.on('pong', () => { if (!ident.pinGrund(nutzer)) ident.kontakt(nutzer); });
  }

  verbindungen.add(verbindung);
  senden(socket, { art: 'zustand', zustand: anzeigeSicht(daten) });
  senden(socket, { art: 'stand', lauf: aenderungen.lauf, nr: aenderungen.nr });   // Offline B3: was die Companion verpasst hat
  teilnehmerMelden();

  socket.on('message', (roh) => {
    if (verbindung.rolle !== 'steuerung') return; // Anzeige ist nur lesend
    let op;
    try {
      op = JSON.parse(roh.toString());
    } catch {
      return;
    }
    if (!op || typeof op !== 'object') return;
    // Daten ändern die Handys über die REST-API, hier bleibt nur „Aufs Board“
    if (!zeigenBearbeiten(op, verbindung)) senden(socket, { art: 'fehler', text: 'Unbekannte Operation', anfrage: op.anfrage });
  });

  socket.on('close', () => {
    verbindungen.delete(verbindung);
    teilnehmerMelden();
  });
});

// Ping gegen eingeschlafene Handy-Verbindungen
setInterval(() => {
  for (const v of verbindungen) if (v.socket.readyState === 1) v.socket.ping();
}, 25_000).unref();

// ---------- Ausliefern: Anmeldeseite unter /, Companion unter /app/, Anzeige (Widget-Dashboard) unter /dashboard/ ----------

const OHNE_CACHE = { 'cache-control': 'no-cache' };
/** Datei ohne Cache ausliefern: cacheControl:false, sonst setzt sendFile das maxAge des Plugins (7 Tage) darüber */
const ohneCache = (reply, datei, ordner) => reply.headers(OHNE_CACHE).sendFile(datei, ordner, { cacheControl: false });
/** Weiterleiten und dabei die Query behalten (Anzeige-Link ?anzeige=…&schluessel=…, alte QR-Codes ?pin=…) */
const mitQuery = (req, ziel) => {
  const query = req.url.indexOf('?');
  return `${ziel}${query === -1 ? '' : req.url.slice(query)}`;
};
// Anmeldeseite (Bauplan „Anmeldung“, L3); sie lädt app/konfig.js und app/regeln.js
app.get('/', (req, reply) => ohneCache(reply, 'anmeldung.html', COMPANION_ORDNER));
app.get('/app', (req, reply) => reply.redirect(mitQuery(req, '/app/')));
app.get('/app/', (req, reply) => ohneCache(reply, COMPANION_DATEI, COMPANION_ORDNER));
// Regeln, Texterkennung, Welt-Import (Worker und Dekoder sind ES-Module, die das Handy selbst liest)
for (const datei of ['konfig.js', 'regeln.js', 'board-karten.js', 'texterkennung.js',
  'biom-ids.js', 'biom-dekoder.js', 'biom-welt.js', 'welt-ordner.js', 'nbt.js', 'welt-funde.js', 'biom-import.worker.js']) {
  app.get(`/app/${datei}`, (req, reply) => ohneCache(reply, datei, COMPANION_ORDNER));
}
await app.register(fastifyStatic, { root: path.join(COMPANION_ORDNER, 'icons'), prefix: '/app/icons/', maxAge: '7d' });
// Kennblöcke auch für das Dashboard (es lädt /icons/…, wie auf Netlify)
await app.register(fastifyStatic, { root: path.join(COMPANION_ORDNER, 'icons'), prefix: '/icons/', maxAge: '7d', decorateReply: false });
// Bibliotheken in vendor/ (Welt-Import, tesseract.js für die Texterkennung)
await app.register(fastifyStatic, { root: path.join(COMPANION_ORDNER, 'vendor'), prefix: '/app/vendor/', maxAge: '7d', decorateReply: false });
// Rüstungs-Baukasten: Texturen, fertige Item-Icons, baukasten.js/figur3d.js (ES-Module) und manifest.json
await app.register(fastifyStatic, {
  root: path.join(COMPANION_ORDNER, 'ruestungs-baukasten'), prefix: '/app/ruestungs-baukasten/', maxAge: '7d', decorateReply: false,
});

function dashboardSeite(reply) {
  if (!existsSync(path.join(DASHBOARD_DIST, 'index.html'))) {
    return reply.code(404).type('text/plain; charset=utf-8')
      .send('Dashboard nicht gebaut: npm --prefix companion/widgets install && npm --prefix companion/widgets run build');
  }
  return ohneCache(reply, 'index.html', DASHBOARD_DIST);   // neuer Build → neue Assets
}
// Widget-Dashboard: Dateien mit Hash im Namen unter /dashboard/assets/, eigene Routen (z. B. /dashboard/vollbild/:id) → index.html
await app.register(fastifyStatic, { root: DASHBOARD_DIST, prefix: '/dashboard/', index: false, maxAge: '7d', decorateReply: false });
app.get('/dashboard', (req, reply) => reply.redirect(mitQuery(req, '/dashboard/')));   // Anzeige-Link behält ?anzeige=…&schluessel=…
app.get('/dashboard/', (req, reply) => dashboardSeite(reply));
// Die alte Anzeige gibt es nicht mehr (Bauplan „Sitzung“, S4): alte Anzeige-Links führen aufs Dashboard, mit Schlüssel
const zumDashboard = (req, reply) => reply.redirect(mitQuery(req, '/dashboard/'), 301);
app.get('/anzeige', zumDashboard);
app.get('/anzeige/*', zumDashboard);

app.setNotFoundHandler((req, reply) => {
  const pfad = req.url.split('?')[0];
  if (req.method === 'GET' && pfad.startsWith('/dashboard/') && !pfad.startsWith('/dashboard/assets/')) return dashboardSeite(reply);
  return reply.code(404).send({ fehler: 'Nicht gefunden' });
});

// Sauber speichern beim Beenden
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await daten.schliessen().catch(() => {});
    process.exit(0);
  });
}

// Link der ersten Anzeige („Board“) in eine Datei, damit das Gerät mit dem Server ihn ohne Konsole findet
const ANZEIGE_LINK_DATEI = path.join(DATEN, 'anzeige-link.txt');
function anzeigeLinkMerken() {
  const [erste] = daten.anzeigenListe();   // enthält den Schlüssel (anders als /api/anzeigen)
  if (erste) writeFile(ANZEIGE_LINK_DATEI, anzeigeLink(erste)).catch(() => {});
}

await app.listen({ port: PORT, host: HOST });
anzeigeLinkMerken();
console.log(`\n  Koordinaten-Board läuft (lauscht auf ${HOST}:${PORT})`);
console.log(`  Anmeldung (Handys):      ${BEITRITT_URL}   (danach die Companion unter /app/)`);
const anzeigen = daten.anzeigenListe();
for (const a of anzeigen) console.log(`  Anzeige${anzeigen.length > 1 ? ` „${a.name}“` : ''}: ${anzeigeLink(a)}`);
if (!existsSync(path.join(DASHBOARD_DIST, 'index.html'))) console.log('  (Dashboard nicht gebaut: npm run dashboard:installieren && npm run dashboard:build)');
console.log(`  (Auch das Board-Gerät selbst braucht den Anzeige-Link; er steht in ${ANZEIGE_LINK_DATEI})`);
if (!process.env.OEFFENTLICHE_URL) {
  console.log('  (QR-Code und Anzeige-Link zeigen auf localhost. Sollen andere Geräte sich anmelden: OEFFENTLICHE_URL setzen, z. B. https://mainhubv1.com)');
}
console.log('');
