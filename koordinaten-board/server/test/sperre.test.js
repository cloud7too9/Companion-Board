import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fehlversuchSperre, anfrageGrenze } from '../src/sperre.js';

const uhr = () => {
  let t = 0;
  return { jetzt: () => t, weiter: (ms) => { t += ms; } };
};

test('Nach 5 falschen PINs ist die Adresse eine Minute gesperrt', () => {
  const u = uhr();
  const s = fehlversuchSperre({ jetzt: u.jetzt });
  for (let i = 0; i < 4; i++) s.fehlschlag('192.168.1.20');
  assert.equal(s.gesperrt('192.168.1.20'), 0);
  s.fehlschlag('192.168.1.20');
  assert.equal(s.gesperrt('192.168.1.20'), 60);
  assert.equal(s.gesperrt('192.168.1.21'), 0, 'andere Geräte bleiben frei');
  u.weiter(59_500);
  assert.equal(s.gesperrt('192.168.1.20'), 1);
  u.weiter(500);
  assert.equal(s.gesperrt('192.168.1.20'), 0);
});

test('Richtige PIN setzt die Fehlversuche zurück', () => {
  const s = fehlversuchSperre({ jetzt: uhr().jetzt });
  for (let i = 0; i < 4; i++) s.fehlschlag('10.0.0.5');
  s.erfolg('10.0.0.5');
  s.fehlschlag('10.0.0.5');
  assert.equal(s.gesperrt('10.0.0.5'), 0);
});

test('Aufräumen: abgelaufene Sperren und alte Fehlversuche fallen weg, frische bleiben', () => {
  const u = uhr();
  const s = fehlversuchSperre({ jetzt: u.jetzt });
  for (let i = 0; i < 5; i++) s.fehlschlag('gesperrt');
  s.fehlschlag('alt');
  u.weiter(9 * 60_000);
  s.fehlschlag('frisch');
  assert.equal(s.groesse, 3);
  u.weiter(2 * 60_000);   // 11 Minuten nach „gesperrt“ und „alt“, 2 Minuten nach „frisch“
  s.aufraeumen();
  assert.equal(s.groesse, 1, 'nur der frische Fehlversuch bleibt');
  for (let i = 0; i < 4; i++) s.fehlschlag('frisch');
  assert.equal(s.gesperrt('frisch'), 60, 'er zählt weiter mit');
});

test('Grenze je Adresse: höchstens max Anfragen im Fenster, danach Wartezeit bis zum nächsten Fenster', () => {
  const u = uhr();
  const g = anfrageGrenze({ max: 3, fensterMs: 60 * 60_000, jetzt: u.jetzt });
  assert.deepEqual([g.zaehlen('a'), g.zaehlen('a'), g.zaehlen('a')], [0, 0, 0]);
  u.weiter(10 * 60_000);
  assert.equal(g.zaehlen('a'), 50 * 60, 'vierte Anfrage: 50 Minuten warten');
  assert.equal(g.zaehlen('b'), 0, 'andere Adresse frei');
  u.weiter(50 * 60_000);
  assert.equal(g.zaehlen('a'), 0, 'neues Fenster');
  u.weiter(60 * 60_000);
  g.aufraeumen();
  assert.equal(g.groesse, 0);
});
