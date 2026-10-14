import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Daten } from '../src/daten.js';
import { identitaet, pinHashen, pinPasst, AnmeldeFehler } from '../src/identitaet.js';

const MINUTE = 60_000;
/** Daten + Identität mit eigener Uhr (uhr.ms vorstellen statt zu warten) */
const neu = () => {
  const daten = new Daten(mkdtempSync(path.join(tmpdir(), 'kb-ident-')));
  const uhr = { ms: Date.parse('2026-10-14T08:00:00.000Z') };
  return { daten, uhr, ident: identitaet({ daten, geheim: 'test-geheim', jetzt: () => uhr.ms }) };
};
const lehntAb = async (fn, status, text) => assert.rejects(fn, (f) => f instanceof AnmeldeFehler && f.status === status && (!text || f.message === text));
const anfrage = (token) => ({ headers: token ? { authorization: `Bearer ${token}` } : {} });
const KONTO = { echterName: 'Max Muster', anzeigename: 'Max', passwort: 'creeper123', pin: '2468' };

test('Passwort und PIN nur gehasht (scrypt mit Salz), Prüfung in konstanter Zeit', async () => {
  const h = await pinHashen('2468');
  assert.match(h, /^scrypt:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
  assert.notEqual(h, await pinHashen('2468'), 'eigenes Salz je Hash');
  assert.equal(await pinPasst('2468', h), true);
  assert.equal(await pinPasst('2469', h), false);
  assert.equal(await pinPasst('2468', 'kaputt'), false);
});

test('Registrieren und anmelden: Token je Gerät, gleiche Meldung bei falschem Passwort und unbekanntem Namen', async () => {
  const { daten, ident } = neu();
  await lehntAb(() => ident.registrieren({ ...KONTO, pin: '12' }), 400, 'Deine PIN hat 4 bis 8 Ziffern');
  const erst = await ident.registrieren({ ...KONTO, anzeigename: '  Max  ' });
  assert.deepEqual([erst.name, erst.freigegeben], ['Max', true]);
  const b = daten.inhalt.benutzer[0];
  assert.ok(b.passwortHash.startsWith('scrypt:') && b.pinHash.startsWith('scrypt:'), 'nur Hashes');
  assert.ok(!JSON.stringify(daten.inhalt).includes('creeper123'));
  const ich = ident.werBistDu(anfrage(erst.token));
  assert.deepEqual([ich.id, ich.name, ich.echterName, ich.freigegeben], [erst.id, 'Max', 'Max Muster', true]);

  await lehntAb(() => ident.anmelden({ anzeigename: 'Max', passwort: 'falsch123' }), 401, 'Anzeigename oder Passwort stimmt nicht');
  await lehntAb(() => ident.anmelden({ anzeigename: 'Niemand', passwort: 'creeper123' }), 401, 'Anzeigename oder Passwort stimmt nicht');
  await lehntAb(() => ident.anmelden({}), 401, 'Anzeigename oder Passwort stimmt nicht');
  const zweit = await ident.anmelden({ anzeigename: ' max ', passwort: 'creeper123' });
  assert.deepEqual([zweit.id, zweit.name], [erst.id, 'Max'], 'gleiches Konto, zweites Gerät');
  assert.notEqual(zweit.token, erst.token);
  assert.equal(daten.inhalt.geraete.length, 2);
  assert.equal(daten.inhalt.profile.length, 1, 'ein persönliches Profil je Konto');

  // Gerät gesperrt oder abgemeldet → sein Token gilt nicht mehr, das andere schon
  daten.inhalt.geraete[0].freigeschaltet = false;
  assert.equal(ident.werBistDu(anfrage(erst.token)), null);
  ident.abmelden(ident.ausToken(zweit.token));
  assert.equal(ident.ausToken(zweit.token), null);
  assert.equal(ident.ausToken('abc.def'), null);
  assert.equal(ident.werBistDu(anfrage(null)), null);
});

test('Freigabe: das zweite Konto wartet, freigeben und ablehnen', async () => {
  const { ident } = neu();
  const max = await ident.registrieren(KONTO);
  const lena = await ident.registrieren({ ...KONTO, echterName: 'Lena L.', anzeigename: 'Lena' });
  assert.equal(lena.freigegeben, false);
  const nLena = ident.ausToken(lena.token);
  assert.equal(nLena.freigegeben, false);
  assert.equal(ident.ich(nLena).freigegeben, false);
  const k = ident.freigeben(ident.ausToken(max.token), lena.id);
  assert.equal(k.freigegebenVon, 'Max');
  assert.equal(ident.ausToken(lena.token).freigegeben, true);
  const tom = await ident.registrieren({ ...KONTO, echterName: 'Tom', anzeigename: 'Tom' });
  ident.ablehnen(ident.ausToken(lena.token), tom.id);
  assert.equal(ident.ausToken(tom.token), null, 'abgelehnt = gelöscht');
  assert.deepEqual(ident.konten().map((x) => x.anzeigename), ['Max', 'Lena']);
});

test('PIN-Pflicht: über 30 Minuten ohne Kontakt, Prüfung vor dem Kontakt, Kontakt höchstens einmal pro Minute gespeichert', async () => {
  const { daten, uhr, ident } = neu();
  const max = await ident.registrieren(KONTO);
  const n = ident.ausToken(max.token);
  uhr.ms += 29 * MINUTE;
  assert.equal(ident.pinGrund(n), null);
  ident.kontakt(n);
  const gespeichert = daten.geraet(n.geraetId).letzterKontakt;
  uhr.ms += 30 * 1000;
  ident.kontakt(n);
  assert.equal(daten.geraet(n.geraetId).letzterKontakt, gespeichert, 'nach 30 s nur im Speicher');
  uhr.ms += 31 * 1000;
  ident.kontakt(n);
  assert.equal(daten.geraet(n.geraetId).letzterKontakt, new Date(uhr.ms).toISOString(), 'nach über einer Minute in daten.db');
  uhr.ms += 31 * MINUTE;
  assert.equal(ident.pinGrund(n), 'offline:31');
  assert.deepEqual([ident.ich(n).pinNoetig, ident.ich(n).grund], [true, 'offline:31'], '/api/ich vermerkt keinen Kontakt, solange die PIN fehlt');
  await lehntAb(() => ident.pinBestaetigen(n, '1111'), 401, 'Falsche PIN für Max');
  await ident.pinBestaetigen(n, '2468');
  assert.equal(ident.pinGrund(n), null);
  // Nach einem Neustart zählt der gespeicherte Kontakt (höchstens eine Minute alt)
  const nachNeustart = identitaet({ daten, geheim: 'test-geheim', jetzt: () => uhr.ms });
  assert.equal(nachNeustart.pinGrund(n), null);
  uhr.ms += 31 * MINUTE;
  assert.equal(nachNeustart.pinGrund(n), 'offline:31');
});

test('PIN zurücksetzen: mit Passwort, dieses Gerät gilt, die anderen fragen nach der neuen PIN', async () => {
  const { uhr, ident } = neu();
  const a = await ident.registrieren(KONTO);
  const b = await ident.anmelden({ anzeigename: 'Max', passwort: 'creeper123' });
  const na = ident.ausToken(a.token), nb = ident.ausToken(b.token);
  uhr.ms += 1000;
  await lehntAb(() => ident.pinZuruecksetzen(na, { passwort: 'creeper123', neuePin: '1' }), 400, 'Deine PIN hat 4 bis 8 Ziffern');
  await lehntAb(() => ident.pinZuruecksetzen(na, { passwort: 'falsch123', neuePin: '1470' }), 401, 'Das Passwort stimmt nicht');
  await ident.pinZuruecksetzen(na, { passwort: 'creeper123', neuePin: '1470' });
  assert.equal(ident.pinGrund(na), null);
  assert.equal(ident.pinGrund(nb), 'pinwechsel');
  await lehntAb(() => ident.pinBestaetigen(nb, '2468'), 401);
  await ident.pinBestaetigen(nb, '1470');
  assert.equal(ident.pinGrund(nb), null);
});

test('Sperre gegen Durchprobieren: Passwort je Anzeigename, PIN je Gerät', async () => {
  const { uhr, ident } = neu();
  const a = await ident.registrieren(KONTO);
  for (let i = 0; i < 5; i++) await lehntAb(() => ident.anmelden({ anzeigename: 'Max', passwort: 'falsch123' }), 401);
  await lehntAb(() => ident.anmelden({ anzeigename: 'MAX', passwort: 'creeper123' }), 429);
  uhr.ms += 61 * 1000;
  assert.equal((await ident.anmelden({ anzeigename: 'Max', passwort: 'creeper123' })).id, a.id, 'nach einer Minute wieder');
  const b = ident.ausToken((await ident.anmelden({ anzeigename: 'Max', passwort: 'creeper123' })).token);
  const na = ident.ausToken(a.token);
  for (let i = 0; i < 5; i++) await lehntAb(() => ident.pinBestaetigen(na, '0000'), 401);
  await lehntAb(() => ident.pinBestaetigen(na, '2468'), 429);
  assert.deepEqual(await ident.pinBestaetigen(b, '2468'), { ok: true }, 'anderes Gerät nicht gesperrt');
});

test('Grenzen je Adresse: Fehlanmeldungen mit wechselnden Namen sperren die Adresse, neue Konten höchstens 20 pro Stunde, höchstens 10 warten', async () => {
  const { uhr, ident } = neu();
  await ident.registrieren(KONTO, '10.0.0.1');
  for (let i = 0; i < 30; i++) await lehntAb(() => ident.anmelden({ anzeigename: `Rater${i}`, passwort: 'falsch123' }, '10.0.0.9'), 401);
  await lehntAb(() => ident.anmelden({ anzeigename: 'Max', passwort: 'creeper123' }, '10.0.0.9'), 429);
  assert.ok((await ident.anmelden({ anzeigename: 'Max', passwort: 'creeper123' }, '10.0.0.1')).token, 'andere Adresse frei');
  uhr.ms += 11 * MINUTE;
  assert.ok((await ident.anmelden({ anzeigename: 'Max', passwort: 'creeper123' }, '10.0.0.9')).token, 'nach 10 Minuten wieder');

  // Zehn neue Konten warten → das elfte wird abgewiesen, bis jemand freigibt
  const wartende = [];
  for (let i = 0; i < 10; i++) wartende.push(await ident.registrieren({ ...KONTO, echterName: `Gast ${i}`, anzeigename: `Gast${i}` }, `10.1.0.${i}`));
  await lehntAb(() => ident.registrieren({ ...KONTO, echterName: 'Elf', anzeigename: 'Elf' }, '10.1.1.1'), 429);
  const max = ident.ausToken((await ident.anmelden({ anzeigename: 'Max', passwort: 'creeper123' })).token);
  ident.ablehnen(max, wartende[0].id);
  assert.equal((await ident.registrieren({ ...KONTO, echterName: 'Elf', anzeigename: 'Elf' }, '10.1.1.1')).name, 'Elf');

  // Von einer Adresse: 20 neue Konten pro Stunde (Ungültiges zählt nicht)
  for (const w of wartende.slice(1)) ident.freigeben(max, w.id);
  ident.ablehnen(max, (await ident.konten()).find((k) => k.anzeigename === 'Elf').id);
  await lehntAb(() => ident.registrieren({ ...KONTO, pin: '1' }, '10.2.0.1'), 400);
  for (let i = 0; i < 20; i++) {
    const k = await ident.registrieren({ ...KONTO, echterName: `Viel ${i}`, anzeigename: `Viel${i}` }, '10.2.0.1');
    ident.freigeben(max, k.id);
  }
  await lehntAb(() => ident.registrieren({ ...KONTO, echterName: 'Zu viel', anzeigename: 'Zuviel' }, '10.2.0.1'), 429);
  uhr.ms += 61 * MINUTE;
  assert.equal((await ident.registrieren({ ...KONTO, echterName: 'Zu viel', anzeigename: 'Zuviel' }, '10.2.0.1')).name, 'Zuviel');
});
