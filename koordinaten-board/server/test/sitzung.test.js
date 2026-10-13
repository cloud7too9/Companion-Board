// Sitzung einer Anzeige (Bauplan „Sitzung“, S1): „Aufs Board“ legt Widgets in einen Layer, der nur
// im Speicher lebt. Geprüft gegen Daten direkt (ohne Server-Prozess).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Daten, DatenFehler } from '../src/daten.js';
import { KEIN_PLATZ, SITZUNG_LAYER, Sitzungen } from '../src/sitzung.js';
import { groessen } from '../src/regeln.js';

const ordner = () => mkdtempSync(path.join(tmpdir(), 'kb-sitzung-'));
const wirft = (fn, status) => assert.throws(fn, (f) => f instanceof DatenFehler && f.status === status);
const max = { name: 'Max', farbe: '#3fb950' };

test('Größen gemeinsam: jeder Widget-Typ des Servers hat Stufen, erste freie Stelle zeilenweise von oben links', async () => {
  const { WIDGETS } = await import('../src/widgets.js');
  for (const typ of Object.keys(WIDGETS)) assert.ok(groessen.WIDGET_GROESSEN[typ]?.stufen.length >= 1, `Stufen für ${typ}`);
  const stufen = groessen.WIDGET_GROESSEN['sammelobjekte.status'].stufen;   // 4×3
  assert.deepEqual(groessen.ersteFreieStelle([], 18, stufen), { x: 0, y: 0, stufe: 'standard' });
  const belegt = [{ id: 'a', x: 0, y: 0, w: 28, h: 3 }];
  assert.deepEqual(groessen.ersteFreieStelle(belegt, 18, stufen), { x: 28, y: 0, stufe: 'standard' });
  assert.equal(groessen.ersteFreieStelle([{ id: 'a', x: 0, y: 0, w: 32, h: 16 }], 18, stufen), null, '2 Reihen reichen nicht für 3');
  assert.deepEqual(groessen.passt({ x: 30, y: 0, w: 4, h: 3 }, [], 18), { passt: false, grund: 'rand' });
  assert.deepEqual(groessen.passt({ x: 0, y: 0, w: 4, h: 3 }, belegt, 18), { passt: false, grund: 'belegt' });
});

test('Sitzungen: hinzufügen an der ersten freien Stelle, idempotent je Quelle, kein Platz, entfernen, übernehmen', () => {
  const s = new Sitzungen(groessen);
  const a = s.hinzufuegen('a_1', { typ: 'sammelobjekte.status', von: 'Max', farbe: '#000' }, 6);
  assert.equal(a.neu, true);
  assert.deepEqual([a.instanz.typ, a.instanz.stufe, a.instanz.x, a.instanz.y, a.instanz.von], ['sammelobjekte.status', 'standard', 0, 0, 'Max']);
  assert.equal(s.aktiv('a_1'), true, 'der Sitzungs-Layer wird aktiv');
  const b = s.hinzufuegen('a_1', { typ: 'karte.einzelkoordinate', quelle: 'i_1', von: 'Max' }, 6);   // 6×4 neben das 4×3
  assert.deepEqual([b.instanz.x, b.instanz.y, b.instanz.quelle], [4, 0, 'i_1']);
  const nochmal = s.hinzufuegen('a_1', { typ: 'karte.einzelkoordinate', quelle: 'i_1', von: 'Lena' }, 6);
  assert.deepEqual([nochmal.neu, nochmal.instanz.id, nochmal.instanz.von], [false, b.instanz.id, 'Max'], 'dieselbe Quelle legt kein zweites Widget an');
  assert.equal(s.layer('a_1').instanzen.length, 2);
  assert.equal(s.layer('a_1').id, SITZUNG_LAYER);
  // Fläche voll: 6 Reihen, zwei Zeilen zu 6 → ein 8×6-Banner passt nicht mehr
  for (let i = 0; i < 3; i += 1) s.hinzufuegen('a_1', { typ: 'banner.banner', quelle: `b_${i}`, von: 'Max' }, 6);
  assert.deepEqual(s.hinzufuegen('a_1', { typ: 'banner.banner', quelle: 'b_voll', von: 'Max' }, 6), { fehler: KEIN_PLATZ });
  assert.equal(s.hinzufuegen('a_1', { typ: 'gibt.es.nicht', von: 'Max' }, 6).fehler.startsWith('Unbekannter Widget-Typ'), true);
  assert.equal(s.entfernen('a_1', b.instanz.id), true);
  assert.equal(s.entfernen('a_1', b.instanz.id), false);
  assert.equal(s.hat('a_1', a.instanz.id), true);
  // Übernehmen vom Handy: bekannte Instanzen verschieben, fehlende entfernen, fremde ignorieren
  s.uebernehmen('a_1', [{ id: a.instanz.id, typ: 'sammelobjekte.status', stufe: 'standard', x: 10, y: 2 }, { id: 'fremd', typ: 'banner.banner', stufe: 'standard', x: 0, y: 0 }], false);
  assert.deepEqual(s.layer('a_1').instanzen.map((i) => [i.id, i.x, i.y, i.von]), [[a.instanz.id, 10, 2, 'Max']]);
  assert.equal(s.aktiv('a_1'), false);
  assert.deepEqual(s.layer('a_2').instanzen, [], 'jede Anzeige hat ihre eigene Sitzung');
});

test('Daten: Sitzungs-Layer im Layout der Anzeige, nicht in der Datenbank, nach Neustart leer', () => {
  const o = ordner();
  const d = new Daten(o);
  d.anzeigenSicherstellen();
  const [board] = d.anzeigenListe();
  assert.equal(d.anzeigeLayout(board.id).layout, null, 'ohne Layout und ohne Sitzung: null wie bisher');

  const welt = d.weltAnlegen({ seed: '7' });
  d.einstellungenAendern({ aktiveWelt: welt.id });
  const { instanz } = d.sitzungHinzufuegen(board.id, { quelle: 'sammelstand', nutzer: max });
  assert.deepEqual([instanz.typ, instanz.x, instanz.y, instanz.von, instanz.farbe], ['sammelobjekte.status', 0, 0, 'Max', '#3fb950']);
  let l = d.anzeigeLayout(board.id).layout;
  assert.deepEqual([l.aktiverLayer, l.layer.map((x) => x.id)], [SITZUNG_LAYER, [SITZUNG_LAYER]], 'ohne gespeichertes Layout nur die Sitzung');

  // Gespeichertes Layout dazu: der Sitzungs-Layer liegt vorne, der aktive bleibt die Sitzung, bis das Handy umschaltet
  d.anzeigeLayoutSetzen(board.id, { layer: [{ id: 'l1', name: 'Start', instanzen: [{ id: 'w1', typ: 'karte.gesamtkarte', stufe: 'standard', x: 0, y: 0 }] }], aktiverLayer: 'l1' });
  l = d.anzeigeLayout(board.id).layout;
  assert.deepEqual(l.layer.map((x) => x.id), [SITZUNG_LAYER, 'l1']);
  assert.equal(l.aktiverLayer, 'l1', 'das Handy hat l1 gewählt');
  assert.deepEqual(l.layer[0].instanzen.map((i) => [i.id, i.von]), [[instanz.id, 'Max']], 'die Sitzung bleibt, wenn das Handy sie nicht mitschickt');

  // Das Handy schickt das gemischte Layout zurück: Sitzungs-Widget verschoben, Sitzung aktiv
  const gemischt = structuredClone(l);
  gemischt.layer[0].instanzen[0].x = 20;
  gemischt.aktiverLayer = SITZUNG_LAYER;
  l = d.anzeigeLayoutSetzen(board.id, gemischt).layout;
  assert.deepEqual([l.aktiverLayer, l.layer[0].instanzen[0].x, l.layer[1].id], [SITZUNG_LAYER, 20, 'l1']);
  // Vollbild auf das Sitzungs-Widget geht, solange die Sitzung aktiv ist
  assert.equal(d.anzeigeVollbildSetzen(board.id, instanz.id).vollbild, instanz.id);
  wirft(() => d.anzeigeVollbildSetzen(board.id, 'gibt-es-nicht'), 422);

  // Nur die Sitzung leeren: das Handy schickt den Layer leer zurück → der Sitzungs-Layer verschwindet
  const leer = structuredClone(l);
  leer.layer[0].instanzen = [];
  l = d.anzeigeLayoutSetzen(board.id, leer).layout;
  assert.deepEqual([l.layer.map((x) => x.id), l.aktiverLayer, l.layer[0].instanzen.length], [['l1'], 'l1', 1]);
  assert.equal(d.anzeigeLayout(board.id).vollbild, null, 'das Vollbild endet mit dem Widget');

  // Wegnehmen über die Sitzung
  const zwei = d.sitzungHinzufuegen(board.id, { quelle: 'sammelstand', nutzer: max }).instanz;
  assert.equal(d.sitzungEntfernen(board.id, zwei.id), true);
  assert.equal(d.sitzungEntfernen(board.id, zwei.id), false);
  wirft(() => d.sitzungHinzufuegen(board.id, { quelle: 'portal:gibt-es-nicht', nutzer: max }), 404);
  wirft(() => d.sitzungHinzufuegen(board.id, { quelle: 'unsinn', nutzer: max }), 400);
  wirft(() => d.sitzungHinzufuegen('a_99', { quelle: 'sammelstand', nutzer: max }), 404);

  // Neustart: Layout da, Sitzung leer, aktiver Layer ist der gespeicherte
  d.sitzungHinzufuegen(board.id, { quelle: 'sammelstand', nutzer: max });
  return d.speichern().then(() => {
    const d2 = new Daten(o);
    return d2.laden().then(() => {
      const nachher = d2.anzeigeLayout(board.id).layout;
      assert.deepEqual([nachher.aktiverLayer, nachher.layer.map((x) => x.id), nachher.layer[0].instanzen.length], ['l1', ['l1'], 1]);
      rmSync(o, { recursive: true, force: true });
    });
  });
});
