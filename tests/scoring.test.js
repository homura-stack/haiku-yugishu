import { test } from 'node:test';
import assert from 'node:assert/strict';
import { score } from '../src/scoring.js';

const card = (o) => ({
  id: o.id ?? 'x', text: o.text ?? '', mora: o.mora ?? 5,
  kigo: o.kigo ?? false, pos: o.pos ?? 'noun',
  tone: o.tone ?? { motion: 0, brightness: 0 },
  surreal: o.surreal ?? 0, cliche: o.cliche ?? false,
});

test('季語ありでトーン一貫だと風流点が高い', () => {
  const cards = [
    card({ kigo: true,  tone: { motion: -2, brightness: 0 } }),
    card({ kigo: false, tone: { motion: -1, brightness: 0 }, mora: 7 }),
    card({ kigo: true,  tone: { motion: -2, brightness: 1 } }),
  ];
  const r = score(cards);
  assert.ok(r.fuuryuu >= 80, `fuuryuu=${r.fuuryuu}`);
  assert.ok(r.fired.includes('kigo_present'));
  assert.ok(r.fired.includes('tone_consistent'));
});

test('トーン激突＋高シュールだとシュール点が高い', () => {
  const cards = [
    card({ surreal: 3, pos: 'noun', tone: { motion: -3, brightness: -3 } }),
    card({ surreal: 3, pos: 'verb', tone: { motion: 3, brightness: 3 }, mora: 7 }),
    card({ surreal: 2, pos: 'adj',  tone: { motion: 3, brightness: -3 } }),
  ];
  const r = score(cards);
  assert.ok(r.surreal >= 80, `surreal=${r.surreal}`);
  assert.ok(r.fired.includes('tone_clash'));
  assert.ok(r.fired.includes('high_surreal'));
  assert.ok(r.fired.includes('pos_mismatch'));
});

test('ベタ札が多いとシュール点が下がり cliche_heavy が立つ', () => {
  const cards = [
    card({ cliche: true }), card({ cliche: true, mora: 7 }), card({ cliche: false }),
  ];
  const r = score(cards);
  assert.ok(r.fired.includes('cliche_heavy'));
});

test('点数は 0..100 に収まる', () => {
  const cards = [card({}), card({ mora: 7 }), card({})];
  const r = score(cards);
  for (const v of [r.fuuryuu, r.surreal]) {
    assert.ok(v >= 0 && v <= 100, `out of range: ${v}`);
  }
});

test('決定的（同入力→同出力）', () => {
  const cards = [card({ kigo: true }), card({ mora: 7 }), card({ surreal: 1 })];
  assert.deepEqual(score(cards), score(cards));
});
