import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/storage.js';

function memBackend() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test('セッションを保存し履歴として読み出せる', () => {
  const store = createStore(memBackend());
  store.saveSession({ at: '2026-07-17T00:00:00Z', bestTotal: 120, count: 3 });
  store.saveSession({ at: '2026-07-17T01:00:00Z', bestTotal: 150, count: 5 });
  const hist = store.loadHistory();
  assert.equal(hist.length, 2);
  assert.equal(hist[1].bestTotal, 150);
});

test('bestTotal は全履歴の最大', () => {
  const store = createStore(memBackend());
  store.saveSession({ at: 'a', bestTotal: 80, count: 1 });
  store.saveSession({ at: 'b', bestTotal: 200, count: 1 });
  store.saveSession({ at: 'c', bestTotal: 130, count: 1 });
  assert.equal(store.bestTotal(), 200);
});

test('空履歴でも壊れない', () => {
  const store = createStore(memBackend());
  assert.deepEqual(store.loadHistory(), []);
  assert.equal(store.bestTotal(), 0);
});
