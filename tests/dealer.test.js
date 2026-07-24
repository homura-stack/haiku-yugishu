import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, dealHand } from '../src/dealer.js';

const deck = {
  fives: Array.from({ length: 12 }, (_, i) => ({ id: `5-${i}`, mora: 5 })),
  sevens: Array.from({ length: 8 }, (_, i) => ({ id: `7-${i}`, mora: 7 })),
};

test('同じseedなら同じ手札（決定的）', () => {
  const a = dealHand(deck, makeRng(42));
  const b = dealHand(deck, makeRng(42));
  assert.deepEqual(a, b);
});

test('手札の枚数と種別が正しい', () => {
  const h = dealHand(deck, makeRng(1), { fives: 4, sevens: 3 });
  assert.equal(h.fives.length, 4);
  assert.equal(h.sevens.length, 3);
  assert.ok(h.fives.every((c) => c.mora === 5));
  assert.ok(h.sevens.every((c) => c.mora === 7));
});

test('手札グループ内でカード重複がない', () => {
  const h = dealHand(deck, makeRng(7), { fives: 4, sevens: 3 });
  assert.equal(new Set(h.fives.map((c) => c.id)).size, 4);
  assert.equal(new Set(h.sevens.map((c) => c.id)).size, 3);
});

test('連続で配ってもデッキが枯渇しない', () => {
  const rng = makeRng(3);
  for (let i = 0; i < 100; i++) {
    const h = dealHand(deck, rng);
    assert.ok(h.fives.length > 0 && h.sevens.length > 0);
  }
});
