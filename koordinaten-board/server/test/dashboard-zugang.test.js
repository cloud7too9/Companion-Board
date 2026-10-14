// Dashboard-Zugänge (Bauplan „Anmeldung und Dashboard-Zugang“, L4): Code → Ticket → Dashboard-PIN → Anzeige-Token
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Daten } from '../src/daten.js';
import { AnmeldeFehler } from '../src/identitaet.js';
import { dashboardZugang, neuerCode } from '../src/dashboard-zugang.js';
import { regeln } from '../src/regeln.js';
import { signierer } from '../src/signatur.js';

const MINUTE = 60_000, TAG = 24 * 60 * MINUTE;
const NUTZER = { id: 'b-max' };
/** Daten (mit der Anzeige „Board“) + Dashboard-Zugang mit eigener Uhr (uhr.ms vorstellen statt zu warten) */
const neu = async () => {
  const daten = new Daten(mkdtempSync(path.join(tmpdir(), 'kb-dash-')));
  await daten.laden();
  const uhr = { ms: Date.parse('2026-10-14T08:00:00.000Z') };
  return { daten, uhr, dash: dashboardZugang({ daten, geheim: 'test-geheim', jetzt: () => uhr.ms }) };
};
const lehntAb = async (fn, status, text) => assert.rejects(async () => fn(), (f) => f instanceof AnmeldeFehler && f.status === status && (!text || f.message === text));
/** Code erzeugen und ein Anzeige-Gerät damit anmelden → { zugang, token, geraet } */
async function anmelden(dash, minuten = 20, pin = '8642') {
  const zugang = await dash.erzeugen(NUTZER, { minuten, pin });
  const { ticket } = dash.codePruefen(zugang.code, '10.0.0.1');
  const { anzeigeToken: token } = await dash.freischalten({ ticket, pin });
  return { zugang, token, geraet: dash.ausToken(token) };
}

test('Codes: 5 Zeichen, nie 0 O 1 l I, gleichverteilt über alle Zeichen, eindeutig unter den Zugängen', async () => {
  const codes = Array.from({ length: 1000 }, neuerCode);
  for (const c of codes) {
    assert.match(c, regeln.ZUGANGS_CODE);
    assert.doesNotMatch(c, /[0O1lI]/, c);
  }
  const zeichen = new Set(codes.join(''));
  assert.equal(zeichen.size, regeln.CODE_ZEICHEN.length, 'alle 57 Zeichen kommen vor');
  assert.ok(new Set(codes).size > 990, 'kaum Wiederholungen bei 57⁵ Möglichkeiten');

  const { daten, dash } = await neu();
  const a = await dash.erzeugen(NUTZER, { minuten: 20, pin: '8642' });
  assert.match(a.code, regeln.ZUGANGS_CODE);
  assert.equal(a.gueltigBis, '2026-10-14T08:20:00.000Z');
  assert.ok(daten.inhalt.zugaenge[0].pinHash.startsWith('scrypt:'), 'Dashboard-PIN nur als Hash');
  assert.ok(!JSON.stringify(daten.inhalt.zugaenge).includes('8642'));
  assert.throws(() => daten.zugangAnlegen({ code: a.code, pinHash: 'x', erstelltVon: null, erstelltAm: '', gueltigBis: null }), /gibt es schon/);
  await lehntAb(() => dash.erzeugen(NUTZER, { minuten: 20, pin: '12' }), 400, 'Die Dashboard-PIN hat 4 bis 8 Ziffern');
  await lehntAb(() => dash.erzeugen(NUTZER, { minuten: 0, pin: '8642' }), 400);
  await lehntAb(() => dash.erzeugen(NUTZER, { pin: '8642' }), 400);
});

test('Code prüfen: falsch → 401 (Groß- und Kleinschreibung zählt), abgelaufen → 410, dauerhaft gilt nach Tagen', async () => {
  const { uhr, dash } = await neu();
  const kurz = await dash.erzeugen(NUTZER, { minuten: 20, pin: '8642' });
  const dauer = await dash.erzeugen(NUTZER, { minuten: null, pin: '8642' });
  assert.equal(dauer.gueltigBis, null);
  await lehntAb(() => dash.codePruefen('abc', '10.0.0.1'), 400, 'Der Zugangs-Code hat genau 5 Zeichen');
  const anders = [...kurz.code].map((z) => (z === z.toLowerCase() ? z.toUpperCase() : z.toLowerCase())).join('');
  if (anders !== kurz.code && anders !== dauer.code) {
    await lehntAb(() => dash.codePruefen(anders, '10.0.0.1'), 401, 'Der Zugangs-Code stimmt nicht. Achte auf Groß- und Kleinschreibung.');
  }
  assert.ok(dash.codePruefen(kurz.code, '10.0.0.1').ticket);
  uhr.ms += 21 * MINUTE;
  await lehntAb(() => dash.codePruefen(kurz.code, '10.0.0.1'), 410);
  uhr.ms += 30 * TAG;
  const { ticket } = dash.codePruefen(dauer.code, '10.0.0.1');
  assert.ok((await dash.freischalten({ ticket, pin: '8642' })).anzeigeToken, 'dauerhafter Code nach 30 Tagen');
  const liste = dash.liste();
  assert.deepEqual(liste.map((z) => [z.code, z.gueltig, z.anzeigen]), [[dauer.code, true, 1], [kurz.code, false, 0]], 'neueste zuerst');
  assert.equal(liste[0].von, 'unbekannt', 'Ersteller ohne Konto');
});

test('Sperren: 5 falsche Codes je Adresse, 5 falsche Dashboard-PINs je Zugang → 429', async () => {
  const { uhr, dash } = await neu();
  const z = await dash.erzeugen(NUTZER, { minuten: 60, pin: '8642' });
  const falsch = z.code === 'zzzzz' ? 'yyyyy' : 'zzzzz';
  for (let i = 0; i < 5; i++) await lehntAb(() => dash.codePruefen(falsch, '10.0.0.9'), 401);
  await lehntAb(() => dash.codePruefen(z.code, '10.0.0.9'), 429);
  assert.ok(dash.codePruefen(z.code, '10.0.0.1').ticket, 'andere Adresse nicht gesperrt');

  const { ticket } = dash.codePruefen(z.code, '10.0.0.1');
  for (let i = 0; i < 5; i++) await lehntAb(() => dash.freischalten({ ticket, pin: '1111' }), 401, 'Falsche Dashboard-PIN');
  await lehntAb(() => dash.freischalten({ ticket, pin: '8642' }), 429);
  uhr.ms += 61 * 1000;
  assert.ok((await dash.freischalten({ ticket, pin: '8642' })).anzeigeToken, 'nach einer Minute wieder, das Ticket gilt noch');
  await lehntAb(() => dash.freischalten({ ticket: `${ticket}x`, pin: '8642' }), 401, 'Bitte den Zugangs-Code noch einmal eingeben');
});

test('Ticket: 5 Minuten gültig, abgelaufener Code oder widerrufener Zugang schaltet nicht mehr frei', async () => {
  const { uhr, dash } = await neu();
  const z = await dash.erzeugen(NUTZER, { minuten: 20, pin: '8642' });
  const t1 = dash.codePruefen(z.code, '10.0.0.1').ticket;
  uhr.ms += 6 * MINUTE;
  await lehntAb(() => dash.freischalten({ ticket: t1, pin: '8642' }), 401, 'Bitte den Zugangs-Code noch einmal eingeben');
  uhr.ms += 12 * MINUTE;
  const t2 = dash.codePruefen(z.code, '10.0.0.1').ticket;   // Minute 18 von 20
  uhr.ms += 3 * MINUTE;
  await lehntAb(() => dash.freischalten({ ticket: t2, pin: '8642' }), 410, 'Dieser Code ist inzwischen abgelaufen');
  const y = await dash.erzeugen(NUTZER, { minuten: 20, pin: '8642' });
  const t3 = dash.codePruefen(y.code, '10.0.0.1').ticket;
  dash.widerrufen(y.id);
  await lehntAb(() => dash.freischalten({ ticket: t3, pin: '8642' }), 410, 'Dieser Zugang wurde widerrufen');
});

test('Anzeige-Gerät: 14 Minuten offline läuft, 16 Minuten → Dashboard-PIN; abgelaufener Code stört angemeldete nicht', async () => {
  const { daten, uhr, dash } = await neu();
  const { token, geraet } = await anmelden(dash);
  assert.deepEqual([geraet.anzeigeId, typeof geraet.zugangId], [null, 'string']);
  const s = dash.sitzung(geraet);
  assert.equal(s.pinNoetig, false);
  assert.equal(s.anzeigeId, null);
  assert.deepEqual(s.layouts.map((l) => [l.name, l.inhalt, l.widgets, l.belegt]), [['Board', 'Standard-Layout', null, false]]);

  const board = daten.anzeigenListe()[0];
  assert.deepEqual(dash.layoutWaehlen(geraet, board.id), { anzeigeId: board.id, kopie: false });
  assert.throws(() => dash.layoutWaehlen(geraet, 'gibt-es-nicht'), /Anzeige nicht gefunden/);
  assert.equal(dash.ausToken(token).anzeigeId, board.id);

  uhr.ms += 14 * MINUTE;
  assert.equal(dash.pinGrund(geraet), null);
  dash.kontakt(geraet);
  uhr.ms += 16 * MINUTE;
  assert.equal(dash.pinGrund(geraet), 'offline:16');
  assert.deepEqual(dash.sitzung(geraet), { pinNoetig: true, offline: 16 });
  assert.equal(dash.pinGrund(geraet), 'offline:16', 'die Abfrage selbst ist kein Kontakt');
  await lehntAb(() => dash.pinBestaetigen(geraet, '1111'), 401, 'Falsche Dashboard-PIN');
  assert.deepEqual(await dash.pinBestaetigen(geraet, '8642'), { ok: true });
  assert.equal(dash.pinGrund(geraet), null);
  // Der Code (20 Minuten) ist längst abgelaufen – die angemeldete Anzeige läuft weiter
  assert.equal(dash.sitzung(dash.ausToken(token)).anzeigeId, board.id);

  // Nach einem Neustart zählt der gespeicherte Kontakt
  const nachNeustart = dashboardZugang({ daten, geheim: 'test-geheim', jetzt: () => uhr.ms });
  const frisch = nachNeustart.ausToken(token);   // wie server.js: das Gerät je Anfrage frisch aus daten.db
  assert.equal(frisch?.id, geraet.id);
  assert.equal(nachNeustart.pinGrund(frisch), null);
  uhr.ms += 16 * MINUTE;
  assert.equal(nachNeustart.pinGrund(nachNeustart.ausToken(token)), 'offline:16');
  // Fremdes Geheimnis → Token gilt nicht
  assert.equal(dashboardZugang({ daten, geheim: 'anderes', jetzt: () => uhr.ms }).ausToken(token), null);
});

test('Widerrufen meldet alle Anzeigen des Codes ab, Abmelden nur das eine Gerät; Konto-Token ist kein Anzeige-Token', async () => {
  const { daten, dash } = await neu();
  const a = await anmelden(dash);
  const { ticket } = dash.codePruefen(a.zugang.code, '10.0.0.2');
  const zweit = (await dash.freischalten({ ticket, pin: '8642' })).anzeigeToken;
  const zweitId = dash.ausToken(zweit).id;
  const b = await anmelden(dash, null);
  assert.equal(dash.liste().find((z) => z.id === a.zugang.id).anzeigen, 2);
  // Gleiches Geheimnis, aber anderer Zweck: ein Konto-Token (oder Ticket) mit denselben Feldern gilt nicht
  assert.equal(dash.ausToken(signierer('test-geheim').erstellen({ a: a.geraet.id, z: a.zugang.id })), null);
  assert.equal(dash.ausToken(signierer('test-geheim', 'ticket').erstellen({ a: a.geraet.id, z: a.zugang.id })), null);

  const weg = dash.widerrufen(a.zugang.id);
  assert.deepEqual(new Set(weg), new Set([a.geraet.id, zweitId]));
  assert.equal(dash.ausToken(a.token), null);
  assert.equal(dash.ausToken(zweit), null);
  assert.equal(daten.zugang(a.zugang.id), null);
  assert.throws(() => dash.widerrufen(a.zugang.id), /Zugang nicht gefunden/);
  assert.ok(dash.ausToken(b.token), 'anderer Zugang unberührt');

  dash.abmelden(b.geraet);
  assert.equal(dash.ausToken(b.token), null);
  assert.ok(daten.zugang(b.zugang.id), 'Abmelden lässt den Code stehen');
  assert.equal(dash.ausToken('abc.def'), null);
  assert.equal(dash.ausToken(undefined), null);
});

test('Layout und Raster je Gerät (AN4): freie Anzeige übernehmen, belegte kopieren', async () => {
  const { daten, dash } = await neu();
  const board = daten.anzeigenListe()[0];
  const layout = { layer: [{ id: 'l1', name: 'Start', instanzen: [{ id: 'w1', typ: 'sammelobjekte.status', stufe: 'standard', x: 0, y: 0 }] }], aktiverLayer: 'l1' };
  daten.anzeigeLayoutSetzen(board.id, layout);
  daten.anzeigeReihenSetzen(board.id, 24);
  const tv = await anmelden(dash), tablet = await anmelden(dash), handy = await anmelden(dash);

  assert.deepEqual(dash.layoutWaehlen(tv.geraet, board.id), { anzeigeId: board.id, kopie: false }, 'frei: der Fernseher übernimmt „Board“');
  assert.deepEqual(dash.sitzung(dash.ausToken(tablet.token)).layouts.map((l) => [l.name, l.belegt]), [['Board', true]]);
  assert.deepEqual(dash.sitzung(dash.ausToken(tv.token)).layouts.map((l) => [l.name, l.belegt]), [['Board', false]], 'die eigene ist nicht belegt');

  const t = dash.layoutWaehlen(tablet.geraet, board.id);
  assert.equal(t.kopie, true);
  const kopie = daten.anzeigeLayout(t.anzeigeId);
  assert.equal(kopie.anzeige.name, 'Board 2');
  assert.deepEqual(kopie.layout, daten.anzeigeLayout(board.id).layout, 'gleiches Layout');
  assert.equal(kopie.reihen, null, 'eigenes Raster: das Tablet meldet seine Reihen selbst');
  daten.anzeigeReihenSetzen(t.anzeigeId, 12);
  assert.deepEqual([daten.anzeigeLayout(board.id).reihen, daten.anzeigeLayout(t.anzeigeId).reihen], [24, 12]);
  // Eigenes Layout: Änderungen am Tablet berühren den Fernseher nicht
  daten.anzeigeLayoutSetzen(t.anzeigeId, { ...layout, layer: [{ ...layout.layer[0], instanzen: [] }] });
  assert.equal(daten.anzeigeLayout(board.id).layout.layer[0].instanzen.length, 1);

  assert.deepEqual(dash.layoutWaehlen(dash.ausToken(tv.token), board.id), { anzeigeId: board.id, kopie: false }, 'nochmal dasselbe: bleibt');
  assert.equal(daten.anzeigeLayout(dash.layoutWaehlen(handy.geraet, t.anzeigeId).anzeigeId).anzeige.name, 'Board 3', 'Kopie der Kopie heißt „Board 3“');
  assert.equal(daten.anzeigenListe().length, 4 - 1);
  // Gibt der Fernseher „Board“ frei (abgemeldet), übernimmt das nächste Gerät sie wieder direkt
  dash.abmelden(dash.ausToken(tv.token));
  const neuesTv = await anmelden(dash);
  assert.deepEqual(dash.layoutWaehlen(neuesTv.geraet, board.id), { anzeigeId: board.id, kopie: false });
  assert.equal(daten.anzeigeKopieren(board.id).name, 'Board 4');
  daten.anzeigeUmbenennen(board.id, { name: 'Raum 101' });
  assert.equal(daten.anzeigeKopieren(board.id).name, 'Raum 101 2', 'Zahl im Namen ohne Anzeige ohne Zahl bleibt');
});
