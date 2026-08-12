import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';

const deck = [
  ...Array.from({ length: 6 }, (_, index) => ({ id: `five-${index}`, mora: 5 })),
  ...Array.from({ length: 4 }, (_, index) => ({ id: `seven-${index}`, mora: 7 })),
];

test('同じ札を複数の枠へ配置できない', () => {
  const game = createGame({ deck });
  const card = deck[0];
  assert.deepEqual(game.placeCard(0, card), { accepted: true, complete: false, replacedCard: null, reason: null });
  assert.deepEqual(game.placeCard(2, card), { accepted: false, complete: false, replacedCard: null, reason: 'card_already_used' });
});

test('枠の札を差し替えると以前の札を返す', () => {
  const game = createGame({ deck });
  game.placeCard(0, deck[0]);
  assert.deepEqual(game.placeCard(0, deck[1]), { accepted: true, complete: false, replacedCard: deck[0], reason: null });
  assert.equal(game.placeCard(2, deck[0]).accepted, true);
});

test('枠と音数が異なる札を拒否する', () => {
  const game = createGame({ deck });
  assert.deepEqual(game.placeCard(1, deck[0]), { accepted: false, complete: false, replacedCard: null, reason: 'mora_mismatch' });
});
