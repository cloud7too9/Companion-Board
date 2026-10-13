// Koordinaten-Board – der eine Server für Companion (Handys im WLAN) und Anzeige (im Raum):
// liefert die Companion aus, hält die gemeinsamen Daten (daten.json) und synchronisiert live.
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { randomBytes, randomInt } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Daten, DatenFehler } from './daten.js';
import { identitaet, AnmeldeFehler, BOARD_PIN } from './identitaet.js';
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
// Pfad der Companion unter OEFFENTLICHE_URL (Umbau Phase 5): lokal liefert der Server sie unter / aus, auf Netlify liegt sie unter /app/
const COMPANION_PFAD = `/${(process.env.COMPANION_PFAD ?? '/').replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');
const DATEN = path.resolve(process.env.DATEN_ORDNER ?? path.join(HIER, '..', 'daten'));
// Widget-Dashboard (companion/widgets, `npm run build` → dist/), ausgeliefert unter /dashboard: die Anzeige (Bauplan „Sitzung“, S4)
const DASHBOARD_DIST = path.join(COMPANION_ORDNER, 'widgets', 'dist');
// Seite der Companion, die unter / ausgeliefert wird (später z. B. modul-a-live-karte.html)
const COMPANION_DATEI = process.env.COMPANION_DATEI ?? 'companion-prototyp.html';
// Anzeige nur mit Anzeige-Link (Anzeige + Schlüssel), auch auf dem Board-Gerät selbst (Umbau Phase 1):
// hinter einem Tunnel käme sonst jede Anfrage aus dem Internet als „localhost“ herein.

// ---------- PIN + Sitzungs-Signatur (bleiben über Neustarts erhalten) ----------

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
// Board-PIN: mindestens 6 Ziffern (BOARD_PIN). Eine alte 4-stellige pin.txt wird ersetzt, eine zu kurze RAUM_PIN abgelehnt.
if (process.env.RAUM_PIN !== undefined && !BOARD_PIN.test(process.env.RAUM_PIN)) {
  console.error(`RAUM_PIN „${process.env.RAUM_PIN}“ geht nicht: Die Board-PIN hat mindestens 6 Ziffern.`);
  process.exit(1);
}
const neuePin = () => String(randomInt(100000, 1000000));
let PIN = process.env.RAUM_PIN ?? (await dauerwertLaden('pin.txt', neuePin));
if (!BOARD_PIN.test(PIN)) {
  PIN = neuePin();
  await writeFile(path.join(DATEN, 'pin.txt'), PIN);
  console.log(`  Die alte PIN in pin.txt war zu kurz – neue PIN mit 6 Ziffern: ${PIN}`);
}
const GEHEIM = await dauerwertLaden('geheim.txt', () => randomBytes(32).toString('hex'));

/** Kommt die Verbindung vom Gerät selbst (loopback)? Gibt keine Rechte mehr; dort sitzt hinter dem Tunnel cloudflared. */
const istLokal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
/** Adresse des Geräts für PIN-Sperre und Anmeldung. Hinter cloudflared (Umbau Phase 6) kommt jede Anfrage von
 *  127.0.0.1 und trägt die echte Adresse im Header CF-Connecting-IP. Der Header zählt nur von loopback, sonst
 *  könnte ein Handy im WLAN die Sperre mit einem erfundenen Header umgehen. */
function clientIp(req) {
  const kopf = req.headers['cf-connecting-ip'];
  if (istLokal(req) && typeof kopf === 'string' && kopf.trim()) return kopf.trim();
  return req.socket.remoteAddress;
}
/** Darf diese Anfrage Anzeige sein? Nur mit gültigem Anzeige-Link (?anzeige=…&schluessel=…) */
const anzeigeZugang = (req) => {
  const { anzeige, schluessel } = req.query ?? {};
  const mitLink = anzeige ? daten.anzeigeMitSchluessel(String(anzeige), String(schluessel ?? '')) : null;
  return { erlaubt: Boolean(mitLink), anzeige: mitLink };
};

/** Anzeige-Link aufs Dashboard – dieselbe Adresse wie im QR-Code der Handys; ohne ihn ist kein Gerät Anzeige, auch das Board-Gerät nicht */
const anzeigeLink = (a) => `${OEFFENTLICHE_URL}/dashboard?anzeige=${encodeURIComponent(a.id)}&schluessel=${encodeURIComponent(a.schluessel)}`;

// ---------- Daten ----------

// Die alte zustand.json (Orte der früheren Board-Steuerung) bleibt als Sicherung liegen.
const daten = new Daten(DATEN);
await daten.laden();
// Accounts mit eigener PIN, Geräteschlüssel, „Wer bist du?“ (Strang B, identitaet.js)
const ident = identitaet({ daten, geheim: GEHEIM, boardPin: PIN });

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
  if (f instanceof AnmeldeFehler || f instanceof DatenFehler) return reply.code(f.status).send({ fehler: f.message });
  throw f;
}

// Beitreten (B2): Board-PIN aus dem QR-Code, dann Account wählen oder anlegen – Name + eigene PIN
app.post('/api/beitreten/konten', async (req, reply) => {
  try {
    return { konten: ident.konten(req.body?.pin, clientIp(req)) };
  } catch (f) {
    return anmeldeFehler(reply, f);
  }
});

app.post('/api/beitreten', async (req, reply) => {
  const { pin, name, kontoPin } = req.body ?? {};
  try {
    return await ident.anmelden({ pin, name, kontoPin, ip: clientIp(req) });
  } catch (f) {
    return anmeldeFehler(reply, f);
  }
});

app.get('/api/ich', async (req, reply) => {
  const nutzer = ident.werBistDu(req);
  if (!nutzer) return reply.code(401).send({ fehler: 'Nicht angemeldet' });
  return { id: nutzer.id, name: nutzer.name, farbe: nutzer.farbe };
});

app.get('/api/anzeige', async (req, reply) => {
  const zugang = anzeigeZugang(req);
  if (!zugang.erlaubt) return reply.code(403).send({ fehler: 'Anzeige nur mit Anzeige-Link' });
  return {
    anzeige: zugang.anzeige && { id: zugang.anzeige.id, name: zugang.anzeige.name },
    beitrittsUrl: `${OEFFENTLICHE_URL}${COMPANION_PFAD}?pin=${PIN}`,
    adresse: OEFFENTLICHE_URL,
    pin: PIN,
  };
});

// QR-Code zum Beitreten als SVG fürs Widget „Beitreten“ des Dashboards (Bauplan „Sitzung“, S3)
app.get('/api/anzeige/qr', async (req, reply) => {
  if (!anzeigeZugang(req).erlaubt) return reply.code(403).send({ fehler: 'Anzeige nur mit Anzeige-Link' });
  return { svg: await QRCode.toString(`${OEFFENTLICHE_URL}${COMPANION_PFAD}?pin=${PIN}`, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }) };
});

// Widget-Dashboard (A6): Die Anzeige liest ihr Layout und meldet ihre Reihen. Welche Anzeige sie ist,
// sagt der Anzeige-Link.
function anzeigeVonAnfrage(req, reply) {
  const zugang = anzeigeZugang(req);
  if (!zugang.erlaubt) {
    reply.code(403).send({ fehler: 'Anzeige nur mit Anzeige-Link' });
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
  nutzer: (req) => ident.werBistDu(req),
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
// Lesen darf die Anzeige (mit Anzeige-Link) und jedes angemeldete Handy.
await app.register(async (widgets) => {
  widgets.addHook('onRequest', async (req, reply) => {
    if (!anzeigeZugang(req).erlaubt && !ident.werBistDu(req)) {
      return reply.code(403).send({ fehler: 'Widgets nur auf der Anzeige oder für angemeldete Handys' });
    }
  });
  widgets.get('/:typ', async (req, reply) => {
    const quelle = typeof req.query.quelle === 'string' ? req.query.quelle : '';
    return (await widgetKarte(daten, req.params.typ, quelle)) ?? reply.code(404).send({ fehler: 'Unbekannter Widget-Typ' });
  });
  widgets.get('/:typ/quellen', async (req, reply) =>
    widgetQuellen(daten, req.params.typ) ?? reply.code(404).send({ fehler: 'Unbekannter Widget-Typ' }));
}, { prefix: '/api/widgets' });

// ---------- Echtzeit-Sync ----------

const verbindungen = new Set(); // { socket, rolle, nutzer, zugang? }

/** Nach „Neuer Schlüssel“: Anzeigen trennen, die nur über den alten Link verbunden waren */
function veralteteAnzeigenTrennen() {
  for (const v of verbindungen) {
    if (v.rolle !== 'anzeige' || !v.zugang) continue;
    if (!daten.anzeigeMitSchluessel(v.zugang.id, v.zugang.schluessel)) v.socket.close(4003, 'Anzeige-Link nicht mehr gültig');
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

function teilnehmerMelden() {
  const namen = [...new Set([...verbindungen].filter((v) => v.nutzer).map((v) => v.nutzer.name))];
  anAlle({ art: 'teilnehmer', namen });
}

app.get('/ws', { websocket: true }, (socket, req) => {
  const { token, rolle } = req.query ?? {};
  let verbindung;
  if (rolle === 'anzeige') {
    const zugang = anzeigeZugang(req);
    if (!zugang.erlaubt) return socket.close(4003, 'Anzeige nur mit Anzeige-Link');
    // Wird der Schlüssel neu erzeugt, fliegt die Anzeige mit dem alten raus (veralteteAnzeigenTrennen)
    verbindung = { socket, rolle: 'anzeige', nutzer: null, zugang: { id: zugang.anzeige.id, schluessel: zugang.anzeige.schluessel } };
  } else {
    const nutzer = ident.ausToken(token);
    if (!nutzer) return socket.close(4001, 'Nicht angemeldet');
    verbindung = { socket, rolle: 'steuerung', nutzer };
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

// ---------- Ausliefern: Companion unter /, Anzeige (Widget-Dashboard) unter /dashboard ----------

const OHNE_CACHE = { 'cache-control': 'no-cache' };
app.get('/', (req, reply) => reply.headers(OHNE_CACHE).sendFile(COMPANION_DATEI, COMPANION_ORDNER));
for (const datei of ['konfig.js', 'regeln.js', 'board-karten.js', 'texterkennung.js']) {
  app.get(`/${datei}`, (req, reply) => reply.headers(OHNE_CACHE).sendFile(datei, COMPANION_ORDNER));
}
await app.register(fastifyStatic, { root: path.join(COMPANION_ORDNER, 'icons'), prefix: '/icons/', maxAge: '7d' });
// Welt-Import: Worker und Dekoder (ES-Module) liest das Handy selbst; die Bibliothek liegt in vendor/ (dort auch tesseract.js für die Texterkennung)
for (const datei of ['biom-ids.js', 'biom-dekoder.js', 'biom-welt.js', 'welt-ordner.js', 'nbt.js', 'welt-funde.js', 'biom-import.worker.js']) {
  app.get(`/${datei}`, (req, reply) => reply.headers(OHNE_CACHE).sendFile(datei, COMPANION_ORDNER));
}
await app.register(fastifyStatic, { root: path.join(COMPANION_ORDNER, 'vendor'), prefix: '/vendor/', maxAge: '7d', decorateReply: false });
// Rüstungs-Baukasten: Texturen, fertige Item-Icons, baukasten.js/figur3d.js (ES-Module) und manifest.json
await app.register(fastifyStatic, {
  root: path.join(COMPANION_ORDNER, 'ruestungs-baukasten'), prefix: '/ruestungs-baukasten/', maxAge: '7d', decorateReply: false,
});

function dashboardSeite(reply) {
  if (!existsSync(path.join(DASHBOARD_DIST, 'index.html'))) {
    return reply.code(404).type('text/plain; charset=utf-8')
      .send('Dashboard nicht gebaut: npm --prefix companion/widgets install && npm --prefix companion/widgets run build');
  }
  return reply.headers(OHNE_CACHE).sendFile('index.html', DASHBOARD_DIST, { cacheControl: false });   // neuer Build → neue Assets
}
// Widget-Dashboard: Dateien mit Hash im Namen unter /dashboard/assets/, eigene Routen (z. B. /dashboard/vollbild/:id) → index.html
await app.register(fastifyStatic, { root: DASHBOARD_DIST, prefix: '/dashboard/', index: false, maxAge: '7d', decorateReply: false });
app.get('/dashboard', (req, reply) => {
  const query = req.url.indexOf('?');
  return reply.redirect(`/dashboard/${query === -1 ? '' : req.url.slice(query)}`);   // Anzeige-Link behält ?anzeige=…&schluessel=…
});
app.get('/dashboard/', (req, reply) => dashboardSeite(reply));
// Die alte Anzeige gibt es nicht mehr (Bauplan „Sitzung“, S4): alte Anzeige-Links führen aufs Dashboard, mit Schlüssel
const zumDashboard = (req, reply) => {
  const query = req.url.indexOf('?');
  return reply.redirect(`/dashboard/${query === -1 ? '' : req.url.slice(query)}`, 301);
};
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
console.log(`  Companion (Handys):      ${OEFFENTLICHE_URL}${COMPANION_PFAD === '/' ? '' : COMPANION_PFAD}   PIN ${PIN}`);
const anzeigen = daten.anzeigenListe();
for (const a of anzeigen) console.log(`  Anzeige${anzeigen.length > 1 ? ` „${a.name}“` : ''}: ${anzeigeLink(a)}`);
if (!existsSync(path.join(DASHBOARD_DIST, 'index.html'))) console.log('  (Dashboard nicht gebaut: npm run dashboard:installieren && npm run dashboard:build)');
console.log(`  (Auch das Board-Gerät selbst braucht den Anzeige-Link; er steht in ${ANZEIGE_LINK_DATEI})`);
if (!process.env.OEFFENTLICHE_URL) {
  console.log('  (QR-Code und Anzeige-Link zeigen auf localhost. Sollen andere Geräte beitreten: OEFFENTLICHE_URL setzen, z. B. https://mainhubv1.com)');
}
console.log('');
