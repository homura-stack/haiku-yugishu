import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';

test('通常モードは途中退出時にタイマーを停止できる', () => {
  let cleared = null;
  const scheduler = {
    setInterval() { return 42; },
    clearInterval(id) { cleared = id; },
  };
  const deck = [
    ...Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, mora: 5 })),
    ...Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, mora: 7 })),
  ];
  const game = createGame({ deck, scheduler });
  game.start();
  game.cancel();
  assert.equal(cleared, 42);
  assert.equal(game.getState().running, false);
});
