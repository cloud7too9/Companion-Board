// Companion-API gegen einen echten Server-Prozess (leerer Datenordner, eigener Port)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir, networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket as WsClient } from 'ws';   // kann Origin setzen (Abhängigkeit von @fastify/websocket)

const PORT = 3297;
const BASIS = `http://127.0.0.1:${PORT}`;
const ORDNER = mkdtempSync(path.join(tmpdir(), 'kb-api-'));
let server;

async function starten() {
  server = spawn(process.execPath, ['src/server.js'], {
    cwd: path.join(path.dirname(fileURLToPath(import.meta.url)), '..'),
    env: { ...process.env, PORT: String(PORT), DATEN_ORDNER: ORDNER, TEST_UHR: '1', ERLAUBTE_URSPRUENGE: 'https://board.beispiel.de, http://localhost:5173' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i += 1) {
    try { if ((await fetch(`${BASIS}/api/server`)).ok) return; } catch { /* startet noch */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Server startet nicht');
}
const beenden = () => new Promise((r) => { server.once('exit', r); server.kill('SIGTERM'); });

before(starten);
after(async () => { await beenden(); rmSync(ORDNER, { recursive: true, force: true }); });

const anfrage = async (methode, pfad, token, body) => {
  const res = await fetch(BASIS + pfad, {
    method: methode,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, daten: await res.json() };
};
// Konto anlegen (das erste gilt sofort und gibt alle weiteren frei) oder – wenn es den Namen gibt – mit dem
// Passwort auf einem neuen Gerät anmelden (Bauplan „Anmeldung“)
const PASSWORT = 'creeper123';
let chef = null;
async function konto(name, pin = '2468') {
  const r = await anfrage('POST', '/api/registrieren', null, { echterName: `${name} Beispiel`, anzeigename: name, passwort: PASSWORT, pin });
  if (r.status === 409) return (await anfrage('POST', '/api/anmelden', null, { anzeigename: name, passwort: PASSWORT })).daten.token;
  assert.equal(r.status, 201, JSON.stringify(r.daten));
  if (!r.daten.freigegeben) assert.equal((await anfrage('POST', `/api/konten/${r.daten.id}/freigeben`, chef)).status, 200);
  chef ??= r.daten.token;
  return r.daten.token;
}
const beitreten = konto;

test('ohne Anmeldung kein Zugriff', async () => {
  assert.deepEqual((await anfrage('GET', '/api/server')).daten, { name: 'koordinaten-board' });
  const r = await anfrage('GET', '/api/orte/welten');
  assert.equal(r.status, 401);
  assert.equal(r.daten.message, 'Nicht angemeldet');
});

test('Konten (Anmeldung L2): registrieren, erstes frei, weitere warten, freigeben, anmelden, Ersteller an Einträgen', async () => {
  const tim = (await anfrage('POST', '/api/registrieren', null, { echterName: 'Tim Tester', anzeigename: ' Tim ', passwort: PASSWORT, pin: '9753' })).daten;
  assert.deepEqual([tim.name, tim.freigegeben], ['Tim', true], 'das erste Konto gilt sofort');
  chef = tim.token;
  let r = await anfrage('POST', '/api/registrieren', null, { echterName: 'Tom', anzeigename: 'tim', passwort: PASSWORT, pin: '1111' });
  assert.deepEqual([r.status, r.daten.fehler], [409, 'Den Namen „tim“ gibt es schon']);
  r = await anfrage('POST', '/api/registrieren', null, { echterName: 'Tom', anzeigename: 'Tom', passwort: 'kurz', pin: '1111' });
  assert.deepEqual([r.status, r.daten.message], [400, 'Das Passwort braucht mindestens 8 Zeichen']);
  const ich = (await anfrage('GET', '/api/ich', tim.token)).daten;
  assert.deepEqual([ich.benutzer.id, ich.benutzer.anzeigename, ich.benutzer.echterName, ich.freigegeben, ich.pinNoetig], [tim.id, 'Tim', 'Tim Tester', true, false]);

  // Ein neues Konto wartet: nur /api/ich und /api/abmelden, sonst 403 – auch keine Live-Verbindung
  const ute = (await anfrage('POST', '/api/registrieren', null, { echterName: 'Ute U.', anzeigename: 'Ute', passwort: PASSWORT, pin: '1357' })).daten;
  assert.equal(ute.freigegeben, false);
  assert.equal((await anfrage('GET', '/api/ich', ute.token)).daten.freigegeben, false);
  r = await anfrage('GET', '/api/orte/welten', ute.token);
  assert.deepEqual([r.status, r.daten.message], [403, 'Dein Konto wartet auf Freigabe']);
  assert.equal((await anfrage('GET', '/api/konten', ute.token)).status, 403);
  const wsZu = await new Promise((ok) => { const w = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(ute.token)}`); w.onclose = (e) => ok(e.code); });
  assert.equal(wsZu, 4030);
  const konten = (await anfrage('GET', '/api/konten', tim.token)).daten.konten;
  assert.deepEqual(konten.map((k) => [k.anzeigename, k.echterName, Boolean(k.freigegebenAm)]), [['Tim', 'Tim Tester', true], ['Ute', 'Ute U.', false]], 'echter Name für alle Konten');
  assert.equal('passwortHash' in konten[0] || 'pinHash' in konten[0], false);
  r = await anfrage('POST', `/api/konten/${ute.id}/freigeben`, tim.token);
  assert.deepEqual([r.status, r.daten.konto.freigegebenVon], [200, 'Tim']);
  assert.equal((await anfrage('GET', '/api/orte/welten', ute.token)).status, 200, 'nach der Freigabe geht es');
  assert.equal((await anfrage('DELETE', `/api/konten/${ute.id}`, tim.token)).status, 409, 'freigegebene Konten lassen sich nicht ablehnen');
  // Ablehnen löscht ein wartendes Konto samt Gerät
  const zoe = (await anfrage('POST', '/api/registrieren', null, { echterName: 'Zoe', anzeigename: 'Zoe', passwort: PASSWORT, pin: '1357' })).daten;
  assert.deepEqual((await anfrage('DELETE', `/api/konten/${zoe.id}`, ute.token)).daten, { ok: true });
  assert.equal((await anfrage('GET', '/api/ich', zoe.token)).status, 401);

  // Anmelden: falsches Passwort und unbekannter Name mit derselben Meldung
  for (const body of [{ anzeigename: 'Tim', passwort: 'falsch123' }, { anzeigename: 'Niemand', passwort: PASSWORT }]) {
    r = await anfrage('POST', '/api/anmelden', null, body);
    assert.deepEqual([r.status, r.daten.fehler], [401, 'Anzeigename oder Passwort stimmt nicht'], body.anzeigename);
  }
  const zweit = (await anfrage('POST', '/api/anmelden', null, { anzeigename: 'TIM', passwort: PASSWORT })).daten;
  assert.deepEqual([zweit.id, zweit.name], [tim.id, 'Tim'], 'gleiches Konto, zweites Gerät');
  assert.notEqual(zweit.token, tim.token);
  // Einträge tragen die Benutzer-ID, der Name bleibt zur Anzeige
  const b = (await anfrage('POST', '/api/banner', zweit.token, { name: 'Tims Banner', basis: 'white', ebenen: [] })).daten.banner;
  assert.deepEqual([b.von, b.erstellerId], ['Tim', tim.id]);
  // Abmelden: dieses Gerät gilt nicht mehr, das andere schon
  assert.deepEqual((await anfrage('POST', '/api/abmelden', zweit.token)).daten, { ok: true });
  assert.equal((await anfrage('GET', '/api/orte/welten', zweit.token)).status, 401);
  assert.equal((await anfrage('GET', '/api/orte/welten', tim.token)).status, 200);
  assert.equal((await anfrage('GET', '/api/orte/welten', 'alt.token')).status, 401, 'fremdes Token gilt nicht');
  // Die Board-PIN gibt es nicht mehr
  assert.equal((await anfrage('POST', '/api/beitreten', null, { pin: '471100', name: 'X', kontoPin: '2468' })).status, 404);
});

test('Companion-Vertrag: Welten, Orte, Sammelobjekte, Portale, Banner, Rüstung', async () => {
  const max = await beitreten('Max');
  let r = await anfrage('POST', '/api/orte/welten', max, { seed: '6889192652397090698' });
  assert.equal(r.status, 201);
  const welt = r.daten.welt;
  r = await anfrage('POST', '/api/orte/instanzen', max, { dimensionId: `d_${welt.id}_overworld`, kategorie: 'Village', variante: null, x: 1040, y: 64, z: 310, quelle: 'manuell' });
  assert.equal(r.status, 201);
  const id = r.daten.instanz.id;
  r = await anfrage('POST', '/api/orte/instanzen', max, { dimensionId: `d_${welt.id}_overworld`, kategorie: 'Bastion', x: 1, y: null, z: 1, quelle: 'manuell' });
  assert.deepEqual([r.status, r.daten.message], [422, '„Bastion“ gibt es in der Oberwelt nicht']);
  assert.equal((await anfrage('PATCH', `/api/orte/instanzen/${id}`, max, { x: 1, y: null, z: 2 })).daten.instanz.z, 2);
  const erl = await anfrage('PUT', `/api/orte/instanzen/${id}/erledigt`, max, { erledigt: true });
  assert.equal(erl.status, 200);
  assert.equal(erl.daten.instanz.erledigt.von, 'Max');
  assert.equal((await anfrage('PUT', `/api/orte/instanzen/${id}/erledigt`, max, { erledigt: false })).daten.instanz.erledigt, null);
  assert.equal((await anfrage('GET', `/api/orte/welten/${welt.id}`, max)).daten.instanzen.length, 1);
  // DELETE mit Content-Type, aber ohne Rumpf – so schickt es die Companion
  assert.deepEqual((await anfrage('DELETE', `/api/orte/instanzen/${id}`, max)).daten, { ok: true });

  const lena = await beitreten('Lena');
  assert.equal((await anfrage('PUT', `/api/sammelobjekte/welten/${welt.id}/rib`, lena, { gefunden: true })).daten.status.rib.von, 'Lena');
  r = await anfrage('POST', `/api/portale/welten/${welt.id}`, lena, { name: 'Basis', oberwelt: { x: 212, y: 71, z: -388 }, nether: { x: 26, y: 71, z: -49 } });
  assert.equal(r.status, 201);
  assert.equal((await anfrage('GET', `/api/portale/welten/${welt.id}`, max)).daten.verbindungen[0].von, 'Lena');
  r = await anfrage('POST', '/api/banner', max, { name: 'Wappen', basis: 'white', ebenen: [{ muster: 'cross', farbe: 'red' }] });
  assert.equal(r.status, 201);
  assert.equal((await anfrage('GET', '/api/banner', lena)).daten.liste[0].name, 'Wappen');
  assert.equal((await anfrage('PUT', '/api/banner/b_99', max, { name: 'x', basis: 'white', ebenen: [] })).status, 404);
  r = await anfrage('POST', '/api/ruestung', lena, { name: 'Amethyst', teile: { chestplate: { ruestung: 'diamond', muster: 'silence', material: 'amethyst' } } });
  assert.equal(r.status, 201);
  const set = r.daten.set;
  assert.equal((await anfrage('GET', '/api/ruestung', max)).daten.sets[0].von, 'Lena');
  r = await anfrage('PUT', `/api/ruestung/${set.id}`, max, { name: 'Amethyst', teile: { helmet: { ruestung: 'turtle' }, boots: { ruestung: 'turtle' } } });
  assert.deepEqual([r.status, r.daten.message], [422, 'Schildkröte gibt es nur als Schildkrötenpanzer']);
  assert.deepEqual((await anfrage('DELETE', `/api/ruestung/${set.id}`, max)).daten, { ok: true });
  assert.equal((await anfrage('GET', '/api/ruestung', max)).daten.sets.length, 0);
  assert.equal((await anfrage('PUT', '/api/board/einstellungen', max, { aktiveWelt: 'w_99' })).status, 404);
});

test('Welt-Import: Biome hochladen (auch über 1 MB), lesen, ersetzen, löschen', async () => {
  const max = await beitreten('Max');
  const welt = (await anfrage('POST', '/api/orte/welten', max, { seed: '-4719278516927443210' })).daten.welt;
  const daten = Buffer.alloc(2048, 7).toString('base64');
  // 600 Kacheln ≈ 1,7 MB – mehr als die Standardgrenze von Fastify (1 MB)
  const kacheln = Array.from({ length: 600 }, (_, n) => ({ dim: 'overworld', kx: (n % 30) - 15, kz: Math.floor(n / 30) - 10, daten }));
  const body = { import: { seed: welt.seed, weltname: 'Realm', dateiname: 'Archiv.zip', spielversion: '1.26.50', chunks: { overworld: 9000 } }, kacheln };
  const lena = await beitreten('Lena');
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(lena)}`);
  const meldungen = [];
  ws.onmessage = (e) => meldungen.push(JSON.parse(e.data));
  await new Promise((r) => { ws.onopen = r; });

  let r = await anfrage('PUT', `/api/welten/${welt.id}/biome`, max, body);
  assert.equal(r.status, 200, r.daten.message);
  assert.deepEqual([r.daten.import.weltId, r.daten.import.von, r.daten.import.weltname], [welt.id, 'Max', 'Realm']);
  r = await anfrage('GET', `/api/welten/${welt.id}/biome`, lena);
  assert.deepEqual([r.daten.import.dateiname, r.daten.kacheln.length, r.daten.kacheln[0].daten], ['Archiv.zip', 600, daten]);
  for (let i = 0; i < 20 && !meldungen.some((m) => m.bereich === 'biome'); i += 1) await new Promise((ok) => setTimeout(ok, 50));
  const { nr: _nr, lauf: _lauf, ...biomMeldung } = meldungen.find((m) => m.bereich === 'biome');
  assert.deepEqual(biomMeldung, { art: 'geaendert', bereich: 'biome', weltId: welt.id });

  r = await anfrage('PUT', `/api/welten/${welt.id}/biome`, max, { ...body, import: { ...body.import, seed: '1' } });
  assert.deepEqual([r.status, r.daten.message], [422, 'Diese Welt hat einen anderen Seed']);
  assert.equal((await anfrage('PUT', '/api/welten/w_99/biome', max, body)).status, 404);
  assert.equal((await anfrage('GET', `/api/welten/${welt.id}/biome`)).status, 401);
  assert.deepEqual((await anfrage('DELETE', `/api/welten/${welt.id}/biome`, max)).daten, { ok: true });
  assert.deepEqual((await anfrage('GET', `/api/welten/${welt.id}/biome`, max)).daten, { import: null, kacheln: [] });
  ws.close();
});

test('Welt-Funde (Bauplan „Welt-Funde“, W2): Welt-Info im Import, viele Einträge in einem Rutsch, je Bereich eine Meldung', async () => {
  const max = await beitreten('Max');
  const welt = (await anfrage('POST', '/api/orte/welten', max, { seed: '1234567' })).daten.welt;
  const info = { spielmodus: 'creative', schwierigkeit: 'hard', tage: 10, spawn: { x: 5, y: null, z: -7 },
    zuletztGespielt: '2026-09-29T17:12:51.000Z', hardcore: false, cheats: true, drache: true };
  const daten = Buffer.alloc(2048, 3).toString('base64');
  let r = await anfrage('PUT', `/api/welten/${welt.id}/biome`, max, {
    import: { seed: welt.seed, weltname: 'Funde', dateiname: 'Funde/', info: { ...info, spielmodus: 'gott', fremd: 1 } },
    kacheln: [{ dim: 'overworld', kx: 0, kz: 0, daten }] });
  assert.equal(r.status, 200, r.daten.message);
  assert.deepEqual(r.daten.import.info, { ...info, spielmodus: null });
  assert.deepEqual((await anfrage('GET', `/api/welten/${welt.id}/biome`, max)).daten.import.info, { ...info, spielmodus: null });

  const lena = await beitreten('Lena');
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(lena)}`);
  const meldungen = [];
  ws.onmessage = (e) => meldungen.push(JSON.parse(e.data));
  await new Promise((ok) => { ws.onopen = ok; });
  await anfrage('PUT', `/api/sammelobjekte/welten/${welt.id}/wild`, lena, { gefunden: true });

  const ort = (kategorie, x, dim = 'overworld', variante = null) => ({ dimensionId: `d_${welt.id}_${dim}`, kategorie, variante, x, y: 40, z: 7 });
  const anderWelt = (await anfrage('POST', '/api/orte/welten', max, { seed: '7654321' })).daten.welt;
  r = await anfrage('POST', `/api/welten/${welt.id}/funde`, max, {
    orte: [ort('Dungeon', 10), ort('Treasure', 50), ort('Eigene Orte', 12, 'nether', 'Netherportal'), ort('Bastion', 1),
      { ...ort('Dungeon', 9), dimensionId: `d_${anderWelt.id}_overworld` }],
    verbindungen: [{ name: 'Portal bei X 100 · Z 200', oberwelt: { x: 100, y: 70, z: 200 }, nether: { x: 12, y: 40, z: 25 } }],
    sammelobjekte: ['sentry', 'wild', 'gibtsnicht'],
    ruestung: [{ name: 'Getragene Rüstung (29.9.)', teile: { boots: { ruestung: 'gold' } } }],
    banner: [{ name: 'Banner bei X 40 · Z 41', basis: 'white', ebenen: [{ muster: 'creeper', farbe: 'black' }] }, { name: 'kaputt', basis: null, ebenen: [] }],
  });
  assert.equal(r.status, 200, r.daten.message);
  assert.deepEqual(r.daten.angelegt, { orte: 3, verbindungen: 1, sammelobjekte: 1, ruestung: 1, banner: 1 });
  assert.deepEqual(r.daten.abgelehnt, [
    { art: 'orte', nr: 3, meldung: '„Bastion“ gibt es in der Oberwelt nicht' },
    { art: 'orte', nr: 4, meldung: 'Dimension gehört nicht zu dieser Welt' },
    { art: 'sammelobjekte', nr: 2, meldung: 'Unbekanntes Sammelobjekt' },
    { art: 'banner', nr: 1, meldung: 'Unbekannte Grundfarbe' },
  ]);
  const orte = (await anfrage('GET', `/api/orte/welten/${welt.id}`, lena)).daten;
  assert.deepEqual(orte.instanzen.map((i) => [i.quelle, i.von, i.x]), [['welt', 'Max', 10], ['welt', 'Max', 50], ['welt', 'Max', 12]]);
  assert.ok(orte.typen.some((t) => t.kategorie === 'Eigene Orte' && t.variante === 'Netherportal'));
  // Schon gefunden: von und am bleiben bei Lena
  const sammel = (await anfrage('GET', `/api/sammelobjekte/welten/${welt.id}`, max)).daten.status;
  assert.deepEqual([sammel.wild.von, sammel.sentry.von], ['Lena', 'Max']);
  assert.equal((await anfrage('GET', `/api/portale/welten/${welt.id}`, max)).daten.verbindungen.length, 1);
  // Je Bereich genau eine Meldung
  for (let i = 0; i < 20 && meldungen.filter((m) => m.bereich !== 'sammelobjekte').length < 4; i += 1) await new Promise((ok) => setTimeout(ok, 50));
  const bereiche = meldungen.map((m) => m.bereich).filter((b) => ['orte', 'portale', 'ruestung', 'banner'].includes(b));
  assert.deepEqual(bereiche.sort(), ['banner', 'orte', 'portale', 'ruestung']);
  assert.equal(meldungen.filter((m) => m.bereich === 'sammelobjekte').length, 2);   // Lena von Hand, dann der Import

  r = await anfrage('POST', `/api/welten/${welt.id}/funde`, max, { orte: 'alle' });
  assert.deepEqual([r.status, r.daten.message], [422, 'orte: Liste erwartet']);
  r = await anfrage('POST', `/api/welten/${welt.id}/funde`, max, { orte: Array.from({ length: 5001 }, () => ({})) });
  assert.deepEqual([r.status, r.daten.message], [422, 'orte: höchstens 5000 Einträge']);
  assert.equal((await anfrage('POST', '/api/welten/w_99/funde', max, {})).status, 404);
  assert.equal((await anfrage('POST', `/api/welten/${welt.id}/funde`, null, {})).status, 401);
  ws.close();
});

test('Offline B3: geaendert mit Nummer, stand beim Verbinden, GET /api/aenderungen nennt die Bereiche seit einer Nummer', async () => {
  const max = await beitreten('Max');
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(max)}`);
  const meldungen = [];
  ws.onmessage = (e) => meldungen.push(JSON.parse(e.data));
  await new Promise((ok) => { ws.onopen = ok; });
  const warten = async (fn) => { for (let i = 0; i < 40 && !fn(); i += 1) await new Promise((ok) => setTimeout(ok, 50)); };
  await warten(() => meldungen.some((m) => m.art === 'stand'));
  const stand = meldungen.find((m) => m.art === 'stand');
  assert.ok(typeof stand.lauf === 'string' && stand.lauf.length > 4 && Number.isInteger(stand.nr), JSON.stringify(stand));

  const welt = (await anfrage('POST', '/api/orte/welten', max, { seed: '24681357' })).daten.welt;
  await anfrage('POST', '/api/banner', max, { name: 'Neu', basis: 'red', ebenen: [] });
  const ort = { dimensionId: `d_${welt.id}_overworld`, kategorie: 'Village', variante: null, y: null, z: 2, quelle: 'manuell' };
  await anfrage('POST', '/api/orte/instanzen', max, { ...ort, x: 1 });
  await anfrage('POST', '/api/orte/instanzen', max, { ...ort, x: 3 });
  await warten(() => meldungen.filter((m) => m.art === 'geaendert').length >= 4);
  const geaendert = meldungen.filter((m) => m.art === 'geaendert');
  assert.deepEqual(geaendert.map((m) => [m.nr - stand.nr, m.bereich, m.lauf === stand.lauf]),
    [[1, 'welten', true], [2, 'banner', true], [3, 'orte', true], [4, 'orte', true]]);

  // Je Bereich einmal, in der Reihenfolge der ersten Änderung
  let r = await anfrage('GET', `/api/aenderungen?seit=${stand.nr}&lauf=${stand.lauf}`, max);
  assert.deepEqual(r.daten, { lauf: stand.lauf, nr: stand.nr + 4, alles: false,
    aenderungen: [{ bereich: 'welten', weltId: welt.id }, { bereich: 'banner', weltId: null }, { bereich: 'orte', weltId: welt.id }] });
  r = await anfrage('GET', `/api/aenderungen?seit=${stand.nr + 2}&lauf=${stand.lauf}`, max);
  assert.deepEqual(r.daten.aenderungen, [{ bereich: 'orte', weltId: welt.id }]);
  r = await anfrage('GET', `/api/aenderungen?seit=${stand.nr + 4}&lauf=${stand.lauf}`, max);
  assert.deepEqual([r.daten.alles, r.daten.aenderungen], [false, []]);
  // Server neu gestartet (anderer Lauf), Nummer aus der Zukunft oder Unsinn: alles neu laden
  for (const q of [`seit=${stand.nr}&lauf=frueher`, `seit=${stand.nr + 99}&lauf=${stand.lauf}`, `seit=x&lauf=${stand.lauf}`, '']) {
    r = await anfrage('GET', `/api/aenderungen?${q}`, max);
    assert.deepEqual([r.status, r.daten.alles, r.daten.lauf, r.daten.nr], [200, true, stand.lauf, stand.nr + 4], q);
  }
  assert.equal((await anfrage('GET', '/api/aenderungen?seit=0')).status, 401);
  ws.close();
});

test('Companion-Dateien: konfig.js, Regeln, Karten, Texterkennung, Welt-Import und tesseract.js werden ausgeliefert', async () => {
  const sprache = await fetch(`${BASIS}/app/vendor/tesseract/eng.traineddata.gz`);
  assert.equal(sprache.status, 200);
  assert.equal((await sprache.arrayBuffer()).byteLength > 2_000_000, true, 'Sprachdaten (gz) kommen ganz an');
  for (const pfad of ['/konfig.js', '/regeln.js', '/board-karten.js', '/texterkennung.js', '/biom-import.worker.js', '/biom-welt.js', '/welt-ordner.js', '/nbt.js', '/welt-funde.js', '/biom-dekoder.js', '/biom-ids.js',
    '/vendor/mcbe-leveldb.js', '/vendor/tesseract/tesseract.min.js', '/vendor/tesseract/worker.min.js', '/vendor/tesseract/tesseract-core-simd-lstm.wasm.js']) {
    const res = await fetch(`${BASIS}/app${pfad}`);
    assert.equal(res.status, 200, pfad);
    assert.ok(res.headers.get('content-type').startsWith('application/javascript'), `${pfad}: ${res.headers.get('content-type')}`);
  }
});

// „Von außen“: über eine Netzwerkadresse dieses Rechners statt localhost (seit Umbau Phase 1 gelten für beide dieselben Regeln)
const AUSSEN = Object.values(networkInterfaces()).flat().find((n) => n && n.family === 'IPv4' && !n.internal)?.address;

test('Anzeige-Link: von außen nur mit gültigem Schlüssel, neuer Schlüssel macht den alten ungültig', { skip: !AUSSEN && 'keine Netzwerkadresse' }, async () => {
  const max = await beitreten('Max');
  let r = await anfrage('GET', '/api/anzeigen', max);
  assert.equal(r.daten.anzeigen.length, 1, 'beim ersten Start gibt es die Anzeige „Board“');
  const board = r.daten.anzeigen[0];
  assert.equal(board.name, 'Board');
  assert.equal('schluessel' in board, false, 'Schlüssel nur im Link');
  const link = new URL(board.link);
  assert.equal(link.pathname, '/dashboard', 'der Anzeige-Link führt aufs Dashboard (S4)');
  const aussen = (pfad, query = '') => fetch(`http://${AUSSEN}:${PORT}${pfad}${query}`);

  // Ohne Link gesperrt, auch auf dem Board-Gerät selbst (localhost); mit Link erlaubt
  assert.equal((await fetch(`${BASIS}/api/anzeige`)).status, 403, 'localhost ohne Link');
  assert.equal((await aussen('/api/anzeige')).status, 403);
  const mitLink = await aussen('/api/anzeige', link.search);
  assert.equal(mitLink.status, 200);
  assert.deepEqual((await mitLink.json()).anzeige, { id: board.id, name: 'Board' });
  assert.equal((await aussen('/api/anzeige', `?anzeige=${board.id}&schluessel=falsch`)).status, 403);

  // WebSocket der Anzeige mit Link: offen, nach „Neuer Schlüssel“ getrennt
  const ws = new WebSocket(`ws://${AUSSEN}:${PORT}/ws${link.search}&rolle=anzeige`);
  const zu = new Promise((ok) => { ws.onclose = (e) => ok(e.code); });
  await new Promise((ok, nein) => { ws.onopen = ok; ws.onerror = nein; });
  const ohne = new WebSocket(`ws://${AUSSEN}:${PORT}/ws?rolle=anzeige`);
  assert.equal(await new Promise((ok) => { ohne.onclose = (e) => ok(e.code); }), 4003);

  r = await anfrage('POST', `/api/anzeigen/${board.id}/schluessel`, max);
  assert.notEqual(r.daten.anzeige.link, board.link);
  assert.equal(await zu, 4003, 'verbundene Anzeige mit altem Schlüssel wird getrennt');
  assert.equal((await aussen('/api/anzeige', link.search)).status, 403, 'alter Schlüssel → 403');
  assert.equal((await aussen('/api/anzeige', new URL(r.daten.anzeige.link).search)).status, 200, 'neuer Schlüssel → erlaubt');

  // Anlegen, umbenennen, QR-Code
  r = await anfrage('POST', '/api/anzeigen', max, { name: ' Tablet ' });
  assert.deepEqual([r.status, r.daten.anzeige.name], [201, 'Tablet']);
  const tablet = r.daten.anzeige;
  assert.equal((await anfrage('POST', '/api/anzeigen', max, { name: ' ' })).status, 400);
  assert.equal((await anfrage('PUT', `/api/anzeigen/${tablet.id}`, max, { name: 'Wohnzimmer-TV' })).daten.anzeige.name, 'Wohnzimmer-TV');
  assert.equal((await anfrage('PUT', '/api/anzeigen/a_99', max, { name: 'x' })).status, 404);
  assert.match((await anfrage('GET', `/api/anzeigen/${tablet.id}/qr`, max)).daten.svg, /^<svg[\s\S]*<\/svg>\s*$/);
  assert.equal((await aussen('/api/anzeige', new URL(tablet.link).search)).status, 200);
  assert.equal((await anfrage('GET', '/api/anzeigen')).status, 401, 'Anzeigen verwalten nur beigetretene Handys');
});

test('Widgets: Karte je Widget-Typ aus der aktiven Welt, Quellen, leerer Zustand, Zugang wie die Anzeige', async () => {
  const max = await beitreten('Max');
  const welt = (await anfrage('POST', '/api/orte/welten', max, { seed: '424242' })).daten.welt;
  await anfrage('PUT', '/api/board/einstellungen', max, { aktiveWelt: welt.id });
  const festung = (await anfrage('POST', '/api/orte/instanzen', max,
    { dimensionId: `d_${welt.id}_nether`, kategorie: 'Nether Fortress', variante: null, x: -200, y: 70, z: 96, quelle: 'manuell' })).daten.instanz;
  await anfrage('PUT', `/api/sammelobjekte/welten/${welt.id}/rib`, max, { gefunden: true });
  await anfrage('POST', `/api/portale/welten/${welt.id}`, max, { name: 'Basis', oberwelt: { x: 800, y: 64, z: 80 }, nether: { x: 100, y: 64, z: 10 } });
  const banner = (await anfrage('POST', '/api/banner', max, { name: 'Kreuz', basis: 'white', ebenen: [{ muster: 'cross', farbe: 'red' }] })).daten.banner;
  // Die Anzeige liest mit ihrem Anzeige-Link (ohne Token); ohne Link und ohne Token ist auch localhost gesperrt
  const link = new URL((await anfrage('GET', '/api/anzeigen', max)).daten.anzeigen[0].link).search;
  assert.equal((await anfrage('GET', '/api/widgets/sammelobjekte.status')).status, 403, 'localhost ohne Link und Token');
  const widget = async (typ, quelle) => anfrage('GET', `/api/widgets/${typ}${link}${quelle ? `&quelle=${quelle}` : ''}`);

  let r = await widget('karte.einzelkoordinate', festung.id);
  assert.equal(r.status, 200);
  assert.equal(r.daten.karte.titel, 'Netherfestung');   // deutsche Namen (05.10.2026), typ bleibt die Seed-Map-Kategorie
  assert.deepEqual(r.daten.karte.bloecke.map((b) => [b.art, b.x, b.z]), [['koordinaten', -200, 96], ['koordinaten', -1600, 768]]);
  assert.equal((await widget('sammelobjekte.status')).daten.karte.bloecke[0].zeilen[0].wert, '1 von 18');
  assert.equal((await widget('sammelobjekte.einzelobjekt', 'rib')).daten.karte.bloecke[0].zeilen[1].wert.startsWith('gefunden von Max'), true);
  assert.equal((await widget('sammelobjekte.gesamtauflistung')).daten.karte.titel, 'Sammelobjekte');
  assert.match((await widget('portale.verbindungen')).daten.karte.bloecke[0].zeilen[0].wert, /800 \/ 80 ↔ N 100 \/ 10/);
  assert.equal((await widget('karte.gesamtkarte')).daten.karte.bloecke[0].zeilen[1].wert, '1 Orte');
  const bild = (await widget('banner.banner', banner.id)).daten.karte.bloecke[0];
  assert.equal(bild.art, 'bild');
  const png = Buffer.from(bild.daten.split(',')[1], 'base64');
  assert.deepEqual([png.subarray(1, 4).toString(), png.readUInt32BE(16), png.readUInt32BE(20)], ['PNG', 20, 40], 'Banner als PNG 20×40');

  // Ohne Inhalt: geplant, noch nicht festgelegt, Quelle fehlt oder gelöscht, unbekannter Typ
  assert.deepEqual((await widget('handbuch.eintrag')).daten, { karte: null, hinweis: 'Bereich geplant' });
  assert.equal((await widget('karte.koordinatensammlung')).daten.karte, null);
  assert.equal((await widget('banner.banner')).daten.hinweis, 'Keine Quelle gewählt');
  await anfrage('DELETE', `/api/orte/instanzen/${festung.id}`, max);
  assert.deepEqual((await widget('karte.einzelkoordinate', festung.id)).daten, { karte: null, hinweis: 'Die Quelle gibt es nicht mehr' });
  assert.equal((await widget('karte.gibtsnicht')).status, 404);

  // Quellen zum Auswählen beim Hinzufügen (fragt das Handy, mit Token)
  r = await anfrage('GET', '/api/widgets/banner.banner/quellen', max);
  assert.equal(r.daten.quelle, 'banner');
  assert.deepEqual(r.daten.quellen.find((q) => q.id === banner.id), { id: banner.id, name: 'Kreuz' });
  r = await anfrage('GET', '/api/widgets/sammelobjekte.einzelobjekt/quellen', max);
  assert.deepEqual(r.daten.quellen.find((q) => q.id === 'rib'), { id: 'rib', name: 'Rippenzier', unter: 'Netherfestung · gefunden' });
  assert.deepEqual((await anfrage('GET', '/api/widgets/portale.verbindungen/quellen', max)).daten, { quelle: null, quellen: [] });

  // Von außen nur mit Anzeige-Link oder als angemeldetes Handy
  if (AUSSEN) {
    const aussen = (query = '', token) => fetch(`http://${AUSSEN}:${PORT}/api/widgets/sammelobjekte.status${query}`,
      { headers: token ? { authorization: `Bearer ${token}` } : {} });
    assert.equal((await aussen()).status, 403);
    assert.equal((await aussen('', max)).status, 200);
    const link = new URL((await anfrage('GET', '/api/anzeigen', max)).daten.anzeigen[0].link);
    assert.equal((await aussen(link.search)).status, 200);
  }
  await anfrage('PUT', '/api/board/einstellungen', max, { aktiveWelt: null });
});

test('Widget-Dashboard unter /dashboard: Anzeige-Link bleibt beim Umleiten, eigene Routen → index.html', async () => {
  const um = await fetch(`${BASIS}/dashboard?anzeige=a_1&schluessel=abc`, { redirect: 'manual' });
  assert.equal(um.status, 302);
  assert.equal(um.headers.get('location'), '/dashboard/?anzeige=a_1&schluessel=abc');
  // Die alte Anzeige gibt es nicht mehr (S4): alte Links führen mit Schlüssel aufs Dashboard
  for (const [pfad, ziel] of [['/anzeige?anzeige=a_1&schluessel=abc', '/dashboard/?anzeige=a_1&schluessel=abc'], ['/anzeige', '/dashboard/'], ['/anzeige/x', '/dashboard/']]) {
    const alt = await fetch(BASIS + pfad, { redirect: 'manual' });
    assert.deepEqual([alt.status, alt.headers.get('location')], [301, ziel], pfad);
  }
  const gebaut = existsSync(fileURLToPath(new URL('../../../companion/widgets/dist/index.html', import.meta.url)));
  for (const pfad of ['/dashboard/', '/dashboard/vollbild/w-portale']) {
    const res = await fetch(BASIS + pfad);
    assert.equal(res.status, gebaut ? 200 : 404, pfad);
    if (gebaut) {
      assert.equal(res.headers.get('cache-control'), 'no-cache');
      assert.match(await res.text(), /<div id="root">/);
    }
  }
  assert.equal((await fetch(`${BASIS}/dashboard/assets/gibt-es-nicht.js`)).status, 404);
});

test('Widget-Layout: Handy speichert, Anzeige liest ihres und meldet ihre Reihen, live über /ws', async () => {
  const max = await beitreten('Max');
  const [board] = (await anfrage('GET', '/api/anzeigen', max)).daten.anzeigen;
  // Die Anzeige „Board“ liest mit ihrem Link; ohne Link ist auch localhost gesperrt
  const q = new URL(board.link).search;
  assert.equal((await anfrage('GET', '/api/anzeige/layout')).status, 403, 'localhost ohne Link');
  assert.equal((await anfrage('GET', '/api/anzeige/qr')).status, 403, 'QR-Code nur mit Link');
  assert.match((await anfrage('GET', `/api/anzeige/qr${q}`)).daten.svg, /^<svg[\s\S]*<\/svg>\s*$/, 'QR-Code zum Beitreten als SVG');
  let r = await anfrage('GET', `/api/anzeige/layout${q}`);
  assert.deepEqual([r.status, r.daten.anzeige.id], [200, board.id]);
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws${q}&rolle=anzeige`);
  const nachrichten = [];
  ws.onmessage = (e) => nachrichten.push(JSON.parse(e.data));
  await new Promise((ok) => { ws.onopen = ok; });

  assert.equal((await anfrage('PUT', '/api/anzeige/reihen', null, { reihen: 24 })).status, 403, 'Reihen melden nur mit Link');
  assert.deepEqual((await anfrage('PUT', `/api/anzeige/reihen${q}`, null, { reihen: 24 })).daten, { reihen: 24 });
  assert.equal((await anfrage('PUT', `/api/anzeige/reihen${q}`, null, { reihen: 'x' })).status, 400);
  assert.equal((await anfrage('GET', '/api/anzeigen', max)).daten.anzeigen.find((a) => a.id === board.id).reihen, 24);

  const layout = { layer: [{ id: 'l1', name: 'Start', instanzen: [{ id: 'w1', typ: 'sammelobjekte.status', stufe: 'standard', x: 28, y: 0 }] }], aktiverLayer: 'l1' };
  assert.equal((await anfrage('PUT', `/api/anzeigen/${board.id}/layout`, null, layout)).status, 401, 'nur beigetretene Handys');
  r = await anfrage('PUT', `/api/anzeigen/${board.id}/layout`, max, layout);
  assert.equal(r.status, 200);
  assert.equal((await anfrage('PUT', `/api/anzeigen/${board.id}/layout`, max, { layer: [] })).status, 422);
  r = await anfrage('GET', `/api/anzeige/layout${q}`);
  assert.deepEqual([r.daten.reihen, r.daten.layout.layer[0].instanzen[0].typ], [24, 'sammelobjekte.status']);
  assert.equal((await anfrage('PUT', `/api/anzeigen/${board.id}/vollbild`, max, { instanzId: 'w1' })).daten.vollbild, 'w1');
  assert.equal((await anfrage('GET', `/api/anzeige/layout${q}`)).daten.vollbild, 'w1', 'die Anzeige sieht das Vollbild');
  assert.equal((await anfrage('PUT', `/api/anzeigen/${board.id}/vollbild`, max, { instanzId: 'gibt-es-nicht' })).status, 422);
  assert.equal((await anfrage('PUT', `/api/anzeigen/${board.id}/vollbild`, max, { instanzId: null })).daten.vollbild, null);
  await new Promise((ok) => setTimeout(ok, 150));
  assert.ok(nachrichten.some((n) => n.art === 'geaendert' && n.bereich === 'layout'), 'Layout-Änderung kommt live an');
  assert.ok(nachrichten.some((n) => n.art === 'geaendert' && n.bereich === 'anzeigen'), 'neue Reihen kommen live an');
  ws.close();

  // Von außen: ohne Link 403, mit Link das Layout genau dieser Anzeige
  if (AUSSEN) {
    const tablet = (await anfrage('POST', '/api/anzeigen', max, { name: 'Tablet' })).daten.anzeige;
    assert.equal((await fetch(`http://${AUSSEN}:${PORT}/api/anzeige/layout`)).status, 403);
    const res = await fetch(`http://${AUSSEN}:${PORT}/api/anzeige/layout${new URL(tablet.link).search}`);
    assert.deepEqual((await res.json()).anzeige, { id: tablet.id, name: 'Tablet' });
  }
});

test('CORS: nur erlaubte Ursprünge und der eigene, alle Methoden, auch für /ws', async () => {
  const mit = (origin, pfad = '/api/server', method = 'GET', extra = {}) =>
    fetch(BASIS + pfad, { method, headers: { ...(origin && { origin }), ...extra } });
  // Preflight mit erlaubtem Ursprung: 204, Methoden inklusive PUT und DELETE
  let r = await mit('https://board.beispiel.de', '/api/orte/welten', 'OPTIONS', { 'access-control-request-method': 'PUT' });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://board.beispiel.de');
  assert.match(r.headers.get('access-control-allow-methods'), /PUT/);
  assert.match(r.headers.get('access-control-allow-methods'), /DELETE/);
  assert.equal(r.headers.get('vary'), 'Origin');
  r = await mit('http://localhost:5173', '/api/anzeigen', 'OPTIONS', { 'access-control-request-method': 'DELETE' });
  assert.equal(r.status, 204, 'zweiter Ursprung aus der Liste');
  // Fremder Ursprung: 403, auch beim Preflight
  assert.equal((await mit('https://fremd.de', '/api/orte/welten', 'OPTIONS', { 'access-control-request-method': 'PUT' })).status, 403);
  r = await mit('https://fremd.de');
  assert.deepEqual([r.status, (await r.json()).fehler, r.headers.get('access-control-allow-origin')], [403, 'Ursprung nicht erlaubt', null]);
  // Eigener Ursprung (Seite kommt vom Server) immer, ohne Origin unverändert, außerhalb von /api egal
  r = await mit(BASIS);
  assert.deepEqual([r.status, r.headers.get('access-control-allow-origin')], [200, BASIS]);
  assert.equal((await mit(null)).status, 200);
  assert.equal((await mit('https://fremd.de', '/app/regeln.js')).status, 200, 'statische Dateien sind kein API-Pfad');
  // WebSocket: Browser erzwingen bei /ws kein CORS, deshalb lehnt der Server fremde Ursprünge selbst ab
  const max = await beitreten('Max');
  const ws = (origin) => new Promise((ok) => {
    const s = new WsClient(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(max)}`, { headers: { origin } });
    s.once('open', () => { s.close(); ok('offen'); });
    s.once('unexpected-response', (_, res) => { ok(`abgelehnt ${res.statusCode}`); });
    s.once('error', () => ok('fehler'));
  });
  assert.equal(await ws('https://fremd.de'), 'abgelehnt 403');
  assert.equal(await ws('https://board.beispiel.de'), 'offen');
  assert.equal(await ws(BASIS), 'offen', 'eigener Ursprung');
});

test('Seiten wie auf Netlify: Anmeldeseite unter /, Companion unter /app/, alte QR-Codes mit ?pin= führen dorthin', async () => {
  const anmeldung = await fetch(`${BASIS}/`);
  assert.deepEqual([anmeldung.status, anmeldung.headers.get('cache-control')], [200, 'no-cache']);
  assert.match(await anmeldung.text(), /<title>Companion · Anmeldung<\/title>/);
  const app = await fetch(`${BASIS}/app/`);
  assert.deepEqual([app.status, app.headers.get('cache-control')], [200, 'no-cache']);
  assert.equal((await fetch(`${BASIS}/app/regeln.js`)).headers.get('cache-control'), 'no-cache', 'Regeln ohne Cache (neuer Stand sofort)');
  assert.match(await app.text(), /<script src="regeln.js"><\/script>/);
  const um = await fetch(`${BASIS}/app?pin=471100`, { redirect: 'manual' });
  assert.deepEqual([um.status, um.headers.get('location')], [302, '/app/?pin=471100']);
  assert.equal((await fetch(`${BASIS}/regeln.js`)).status, 404, 'Dateien der Companion nur noch unter /app/');
  for (const pfad of ['/icons/manifest.json', '/app/icons/manifest.json']) assert.equal((await fetch(BASIS + pfad)).status, 200, `${pfad}: Kennblöcke für Dashboard und Companion`);
});

test('Passwort-Sperre je Anzeigename: 5 Fehlversuche, dann warten; andere Namen nicht betroffen', async () => {
  await konto('Sperrig');
  const falsch = (anzeigename) => anfrage('POST', '/api/anmelden', null, { anzeigename, passwort: 'falsch-falsch' });
  for (let i = 0; i < 5; i += 1) assert.equal((await falsch('Sperrig')).status, 401);
  const r = await falsch('sperrig');
  assert.deepEqual([r.status, /^Zu viele Fehlversuche – bitte \d+ s warten$/.test(r.daten.fehler)], [429, true], 'auch klein geschrieben gesperrt');
  assert.equal((await anfrage('POST', '/api/anmelden', null, { anzeigename: 'Sperrig', passwort: PASSWORT })).status, 429, 'auch mit richtigem Passwort');
  assert.equal((await falsch('Anders')).status, 401, 'anderer Name: eigene Zählung');
});

test('Rüstungs-Baukasten wird ausgeliefert (Texturen, Module, Manifest)', async () => {
  const manifest = await (await fetch(`${BASIS}/app/ruestungs-baukasten/manifest.json`)).json();
  assert.equal(manifest.teile.length, 4);
  for (const [pfad, typ] of [['fertig/items/iron_helmet__amethyst.png', 'image/png'], ['vorlagen/eye_armor_trim_smithing_template.png', 'image/png'],
    ['baukasten.js', 'application/javascript'], ['figur3d.js', 'application/javascript']]) {
    const res = await fetch(`${BASIS}/app/ruestungs-baukasten/${pfad}`);
    assert.equal(res.status, 200, pfad);
    assert.ok(res.headers.get('content-type').startsWith(typ), `${pfad}: ${res.headers.get('content-type')}`);
  }
});

test('Aufs Board als Sitzungs-Widget (Bauplan Sitzung, S1): zeigen mit Quelle, Layout, verbergen, Fehler', async () => {
  const max = await beitreten('Max');
  const [board] = (await anfrage('GET', '/api/anzeigen', max)).daten.anzeigen;
  const q = new URL(board.link).search;
  const welt = (await anfrage('POST', '/api/orte/welten', max, { seed: '99' })).daten.welt;
  await anfrage('PUT', '/api/board/einstellungen', max, { aktiveWelt: welt.id });
  const portal = (await anfrage('POST', `/api/portale/welten/${welt.id}`, max, { name: 'Hof', oberwelt: { x: 80, y: 64, z: 8 }, nether: { x: 10, y: 64, z: 1 } })).daten.verbindung;
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(max)}`);
  const nachrichten = [];
  ws.onmessage = (e) => nachrichten.push(JSON.parse(e.data));
  await new Promise((r) => { ws.onopen = r; });
  const antwort = (anfrageNr) => new Promise((ok) => {
    const t = setInterval(() => {
      const a = nachrichten.find((n) => n.anfrage === anfrageNr && (n.art === 'ok' || n.art === 'fehler'));
      if (a) { clearInterval(t); ok(a); }
    }, 20);
  });

  ws.send(JSON.stringify({ art: 'zeigen', quelle: `portal:${portal.id}`, anfrage: 1 }));
  let a = await antwort(1);
  assert.equal(a.art, 'ok');
  assert.ok(typeof a.instanzId === 'string' && a.instanzId.length > 10, 'ok nennt die Instanz');
  assert.equal(a.titel, 'Hof', 'ok nennt den Titel der Karte');
  let l = (await anfrage('GET', `/api/anzeige/layout${q}`)).daten.layout;
  assert.deepEqual([l.aktiverLayer, l.layer[0].id, l.layer[0].instanzen.map((i) => [i.typ, i.quelle, i.x, i.y, i.von, i.herkunft, i.titel])],
    ['sitzung', 'sitzung', [['portale.verbindung', portal.id, 0, 0, 'Max', `portal:${portal.id}`, 'Hof']]]);
  assert.ok(nachrichten.some((n) => n.art === 'geaendert' && n.bereich === 'layout' && n.anzeigeId === board.id), 'geaendert layout mit Anzeige-ID');
  assert.equal((await anfrage('GET', `/api/widgets/portale.verbindung${q}&quelle=${portal.id}`)).daten.karte.titel, 'Hof', 'das Widget hat seine Karte');
  // Dieselbe Quelle noch einmal: dieselbe Instanz. Zweite Quelle: daneben.
  ws.send(JSON.stringify({ art: 'zeigen', quelle: `portal:${portal.id}`, anfrage: 2 }));
  assert.equal((await antwort(2)).instanzId, a.instanzId);
  ws.send(JSON.stringify({ art: 'zeigen', quelle: 'sammelstand', anfrage: 3 }));
  const b = await antwort(3);
  l = (await anfrage('GET', `/api/anzeige/layout${q}`)).daten.layout;
  assert.deepEqual(l.layer[0].instanzen.map((i) => [i.id === b.instanzId, i.x, i.y]), [[false, 0, 0], [true, 6, 0]]);
  // Fehler: unbekannte Quelle, gelöschte Quelle, unbekannte Anzeige
  ws.send(JSON.stringify({ art: 'zeigen', quelle: 'unsinn', anfrage: 4 }));
  assert.match((await antwort(4)).text, /Unbekannte Quelle/);
  ws.send(JSON.stringify({ art: 'zeigen', quelle: 'portal:p_999', anfrage: 5 }));
  assert.equal((await antwort(5)).text, 'Die Quelle gibt es nicht mehr');
  ws.send(JSON.stringify({ art: 'zeigen', quelle: 'sammelstand', anzeigeId: 'a_999', anfrage: 6 }));
  assert.equal((await antwort(6)).text, 'Anzeige nicht gefunden');
  // Wegnehmen
  ws.send(JSON.stringify({ art: 'verbergen', instanzId: b.instanzId, anfrage: 7 }));
  assert.equal((await antwort(7)).art, 'ok');
  l = (await anfrage('GET', `/api/anzeige/layout${q}`)).daten.layout;
  assert.deepEqual(l.layer[0].instanzen.map((i) => i.typ), ['portale.verbindung']);
  // Der alte Weg mit fertiger Karte ist mit S4 weg; die alte Anzeige und die Nachricht „gezeigt“ auch
  ws.send(JSON.stringify({ art: 'zeigen', karte: { titel: 'Alt', dimension: null, bloecke: [{ art: 'text', text: 'noch da' }] }, anfrage: 8 }));
  assert.equal((await antwort(8)).text, 'Die Companion ist veraltet – bitte neu laden');
  assert.ok(!nachrichten.some((n) => n.art === 'gezeigt'), 'keine Nachricht „gezeigt“ mehr');
  ws.close();
  await anfrage('PUT', '/api/board/einstellungen', max, { aktiveWelt: null });
});

test('Änderungen gehen live an alle, Daten überstehen einen Neustart; die Sitzung nicht', async () => {
  const max = await beitreten('Max');
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(max)}`);
  const nachrichten = [];
  ws.onmessage = (e) => nachrichten.push(JSON.parse(e.data));
  await new Promise((r) => { ws.onopen = r; });
  const [board] = (await anfrage('GET', '/api/anzeigen', max)).daten.anzeigen;
  ws.send(JSON.stringify({ art: 'zeigen', quelle: 'sammelstand', anfrage: 'neustart' }));
  await new Promise((r) => setTimeout(r, 150));
  assert.ok((await anfrage('GET', `/api/anzeigen/${board.id}/layout`, max)).daten.layout.layer.some((l) => l.id === 'sitzung'), 'vor dem Neustart liegt die Sitzung im Layout');
  const welt = (await anfrage('POST', '/api/orte/welten', max, { seed: '-42' })).daten.welt;
  await anfrage('PUT', '/api/board/einstellungen', max, { aktiveWelt: welt.id, titel: 'Neustart-Welt' });
  await anfrage('POST', '/api/orte/instanzen', max, { dimensionId: `d_${welt.id}_end`, kategorie: 'End City', x: 1300, y: 60, z: -820, quelle: 'manuell' });
  await new Promise((r) => setTimeout(r, 200));
  ws.close();
  assert.ok(nachrichten.some((n) => n.art === 'geaendert' && n.bereich === 'orte' && n.weltId === welt.id));
  const letzte = nachrichten.filter((n) => n.art === 'zustand').at(-1).zustand;
  assert.deepEqual(letzte.orte.map((o) => [o.name, o.dimension, o.typ]), [['End City', 'ende', 'End City']]);
  assert.equal(letzte.einstellungen.titel, 'Neustart-Welt');

  await beenden();
  await starten();
  const nachher = await anfrage('GET', `/api/orte/welten/${welt.id}`, max);
  assert.equal(nachher.daten.instanzen.length, 1);
  const layoutNachher = (await anfrage('GET', `/api/anzeigen/${board.id}/layout`, max)).daten.layout;
  assert.ok(!layoutNachher?.layer?.some((l) => l.id === 'sitzung'), 'nach dem Neustart ist die Sitzung leer');
  assert.equal((await anfrage('GET', '/api/board/einstellungen', max)).daten.aktiv, welt.id);
});

// Zuletzt: Die Test-Uhr des Servers läuft danach vor, alle anderen Geräte wären dann „offline“
test('PIN-Pflicht (Anmeldung L2): nach über 30 Minuten ohne Kontakt 423, PIN bestätigt, PIN zurücksetzen fragt andere Geräte', async () => {
  const uhr = (minuten) => anfrage('POST', '/api/test/uhr', null, { minuten });
  const a = await konto('Paula', '2580');
  const b = (await anfrage('POST', '/api/anmelden', null, { anzeigename: 'Paula', passwort: PASSWORT })).daten.token;
  await uhr(29);
  assert.equal((await anfrage('GET', '/api/orte/welten', a)).status, 200, '29 Minuten: geht durch (und zählt als Kontakt)');
  await uhr(31);
  let r = await anfrage('GET', '/api/orte/welten', a);
  assert.deepEqual([r.status, r.daten.message, r.daten.grund], [423, 'PIN nötig', 'offline:31']);
  assert.equal((await anfrage('GET', '/api/orte/welten', a)).status, 423, 'bleibt 423, bis die PIN kommt (Prüfung vor dem Kontakt)');
  r = await anfrage('GET', '/api/ich', a);
  assert.deepEqual([r.status, r.daten.pinNoetig, r.daten.grund], [200, true, 'offline:31'], '/api/ich sagt, warum');
  assert.equal(await new Promise((ok) => { const w = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(a)}`); w.onclose = (e) => ok(e.code); }), 4023, 'keine Live-Verbindung ohne PIN');
  for (let i = 0; i < 5; i += 1) assert.equal((await anfrage('POST', '/api/pin', a, { pin: '0000' })).status, 401);
  assert.equal((await anfrage('POST', '/api/pin', a, { pin: '2580' })).status, 429, 'nach 5 falschen PINs gesperrt');
  await uhr(2);
  assert.deepEqual((await anfrage('POST', '/api/pin', a, { pin: '2580' })).daten, { ok: true });
  assert.equal((await anfrage('GET', '/api/orte/welten', a)).status, 200);

  // B war auch über 30 Minuten weg; nach einer neuen PIN auf A fragt B nach der neuen
  r = await anfrage('POST', '/api/pin/zuruecksetzen', a, { passwort: 'falsch-falsch', neuePin: '1470' });
  assert.deepEqual([r.status, r.daten.fehler], [401, 'Das Passwort stimmt nicht']);
  assert.equal((await anfrage('POST', '/api/pin/zuruecksetzen', a, { passwort: PASSWORT, neuePin: '12' })).status, 400);
  assert.deepEqual((await anfrage('POST', '/api/pin/zuruecksetzen', a, { passwort: PASSWORT, neuePin: '1470' })).daten, { ok: true });
  assert.equal((await anfrage('GET', '/api/orte/welten', a)).status, 200, 'dieses Gerät gilt sofort');
  r = await anfrage('GET', '/api/ich', b);
  assert.deepEqual([r.daten.pinNoetig, r.daten.grund], [true, 'pinwechsel']);
  assert.equal((await anfrage('POST', '/api/pin', b, { pin: '2580' })).status, 401, 'alte PIN gilt nicht mehr');
  assert.equal((await anfrage('POST', '/api/pin', b, { pin: '1470' })).status, 200);
  assert.equal((await anfrage('GET', '/api/orte/welten', b)).status, 200);

  // Herzschlag: Solange die Live-Verbindung steht, läuft kein Timer (Pong alle 25 s zählt als Kontakt)
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(a)}`);
  await new Promise((ok) => { ws.onopen = ok; });
  ws.close();
});

test('Dashboard-Zugänge (Anmeldung L4): Code, Dashboard-PIN, Layout wählen, Anzeige-Token für API, Widgets und /ws, 15 Minuten, widerrufen', async () => {
  const uhr = (minuten) => anfrage('POST', '/api/test/uhr', null, { minuten });
  const wsCode = (query) => new Promise((ok) => { const w = new WebSocket(`ws://127.0.0.1:${PORT}/ws?${query}`); w.onclose = (e) => ok(e.code); });
  const max = await konto('Max');   // neues Gerät: die Uhr steht nach dem Test davor weit vorne
  assert.equal((await anfrage('POST', '/api/dashboard/zugaenge', null, { minuten: 20, pin: '8642' })).status, 401, 'Codes nur für Konten');
  assert.equal((await anfrage('POST', '/api/dashboard/zugaenge', max, { minuten: 20, pin: '12' })).status, 400);
  let r = await anfrage('POST', '/api/dashboard/zugaenge', max, { minuten: 20, pin: '8642' });
  assert.equal(r.status, 201);
  const { id, code } = r.daten;
  assert.match(code, /^[2-9A-HJ-NP-Za-km-z]{5}$/);

  // Am Anzeige-Gerät: Code → Ticket → Dashboard-PIN → Anzeige-Token
  assert.equal((await anfrage('POST', '/api/dashboard/code', null, { code: 'abc' })).status, 400);
  const { ticket } = (await anfrage('POST', '/api/dashboard/code', null, { code })).daten;
  r = await anfrage('POST', '/api/dashboard/freischalten', null, { ticket, pin: '1111' });
  assert.deepEqual([r.status, r.daten.fehler], [401, 'Falsche Dashboard-PIN']);
  const tv = (await anfrage('POST', '/api/dashboard/freischalten', null, { ticket, pin: '8642' })).daten.anzeigeToken;
  assert.ok(tv);
  r = await anfrage('GET', '/api/dashboard/zugaenge', max);
  assert.deepEqual(r.daten.zugaenge.map((z) => [z.code, z.von, z.anzeigen, z.gueltig]), [[code, 'Max', 1, true]]);
  assert.equal((await anfrage('GET', '/api/dashboard/zugaenge', tv)).status, 401, 'Anzeige-Token ist kein Konto');
  assert.equal((await anfrage('GET', '/api/dashboard/sitzung', max)).status, 401, 'Konto-Token ist kein Anzeige-Token');

  // Noch kein Layout gewählt: Auswahl in der Sitzung, die Anzeige-API sagt 409, /ws schließt
  r = await anfrage('GET', '/api/dashboard/sitzung', tv);
  assert.deepEqual([r.daten.pinNoetig, r.daten.anzeigeId], [false, null]);
  const board = r.daten.layouts.find((l) => l.name === 'Board');
  assert.ok(board && typeof board.inhalt === 'string', JSON.stringify(r.daten.layouts));
  assert.deepEqual([(await anfrage('GET', '/api/anzeige/layout', tv)).status, (await anfrage('GET', '/api/anzeige/layout', tv)).daten.error], [409, 'layout']);
  assert.equal(await wsCode(`rolle=anzeige&anzeigeToken=${encodeURIComponent(tv)}`), 4003);
  assert.equal((await anfrage('PUT', '/api/dashboard/layout', tv, { anzeigeId: 'gibt-es-nicht' })).status, 404);
  assert.deepEqual((await anfrage('PUT', '/api/dashboard/layout', tv, { anzeigeId: board.id })).daten, { anzeigeId: board.id, kopie: false });

  // Mit Layout: Anzeige-API mit Header oder ?anzeigeToken=, Widgets, Reihen melden
  assert.deepEqual((await anfrage('GET', '/api/anzeige', tv)).daten.anzeige, { id: board.id, name: 'Board' });
  assert.equal((await anfrage('GET', `/api/anzeige/layout?anzeigeToken=${encodeURIComponent(tv)}`)).daten.anzeige.id, board.id);
  assert.match((await anfrage('GET', '/api/anzeige/qr', tv)).daten.svg, /^<svg/);
  assert.equal((await anfrage('GET', '/api/widgets/sammelobjekte.status', tv)).status, 200);
  assert.deepEqual((await anfrage('PUT', '/api/anzeige/reihen', tv, { reihen: 20 })).daten, { reihen: 20 });
  assert.equal((await anfrage('GET', '/api/anzeige/layout', 'erfunden.token')).status, 403);

  // 14 Minuten offline: läuft; danach 16 Minuten → Dashboard-PIN (423, /ws 4023)
  await uhr(14);
  assert.equal((await anfrage('GET', '/api/anzeige', tv)).status, 200, '14 Minuten: läuft (und zählt als Kontakt)');
  assert.equal((await anfrage('GET', '/api/dashboard/zugaenge', max)).status, 200);
  await uhr(16);
  r = await anfrage('GET', '/api/anzeige/layout', tv);
  assert.deepEqual([r.status, r.daten.error], [423, 'pin']);
  assert.equal((await anfrage('GET', '/api/widgets/sammelobjekte.status', tv)).status, 423);
  assert.deepEqual((await anfrage('GET', '/api/dashboard/sitzung', tv)).daten, { pinNoetig: true, offline: 16 });
  assert.equal(await wsCode(`rolle=anzeige&anzeigeToken=${encodeURIComponent(tv)}`), 4023);
  assert.equal((await anfrage('PUT', '/api/dashboard/layout', tv, { anzeigeId: board.id })).status, 423);
  assert.equal((await anfrage('POST', '/api/dashboard/pin', tv, { pin: '1111' })).status, 401);
  assert.deepEqual((await anfrage('POST', '/api/dashboard/pin', tv, { pin: '8642' })).daten, { ok: true });
  assert.equal((await anfrage('GET', '/api/anzeige/layout', tv)).status, 200);

  // Der Code (20 Minuten) ist abgelaufen: keine neuen Geräte, das angemeldete läuft weiter
  r = await anfrage('POST', '/api/dashboard/code', null, { code });
  assert.equal(r.status, 410);
  assert.equal((await anfrage('GET', '/api/dashboard/zugaenge', max)).daten.zugaenge[0].gueltig, false);

  // Live-Verbindung mit Anzeige-Token; Widerrufen meldet ab und schließt sie mit 4003 (AN5)
  const live = new WebSocket(`ws://127.0.0.1:${PORT}/ws?rolle=anzeige&anzeigeToken=${encodeURIComponent(tv)}`);
  const nachrichten = [];
  live.onmessage = (e) => nachrichten.push(JSON.parse(e.data));
  await new Promise((ok) => { live.onopen = ok; });
  const zu = new Promise((ok) => { live.onclose = (e) => ok(e.code); });
  await new Promise((ok) => setTimeout(ok, 100));
  assert.ok(nachrichten.some((n) => n.art === 'zustand'), 'die Anzeige bekommt den Zustand');
  assert.deepEqual((await anfrage('DELETE', `/api/dashboard/zugaenge/${id}`, max)).daten, { ok: true, abgemeldet: 1 });
  assert.equal(await zu, 4003);
  assert.equal((await anfrage('GET', '/api/dashboard/sitzung', tv)).status, 401);
  assert.equal((await anfrage('GET', '/api/anzeige', tv)).status, 403);
  assert.equal((await anfrage('DELETE', `/api/dashboard/zugaenge/${id}`, max)).status, 404);

  // Dauerhafter Code; Abmelden löscht nur das Gerät
  r = await anfrage('POST', '/api/dashboard/zugaenge', max, { minuten: null, pin: '97531' });
  assert.equal(r.daten.gueltigBis, null);
  const t2 = (await anfrage('POST', '/api/dashboard/code', null, { code: r.daten.code })).daten.ticket;
  const tablet = (await anfrage('POST', '/api/dashboard/freischalten', null, { ticket: t2, pin: '97531' })).daten.anzeigeToken;
  assert.deepEqual((await anfrage('POST', '/api/dashboard/abmelden', tablet)).daten, { ok: true });
  assert.equal((await anfrage('GET', '/api/dashboard/sitzung', tablet)).status, 401);
  assert.deepEqual((await anfrage('GET', '/api/dashboard/zugaenge', max)).daten.zugaenge.map((z) => [z.gueltigBis, z.anzeigen]), [[null, 0]]);
});
