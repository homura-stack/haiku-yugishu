import test from 'node:test';
import assert from 'node:assert/strict';
import { createHardBestStore } from '../src/hard-best.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test('盗作率鑑定所の自己ベストを初回保存し、低得点では維持、高得点で更新する', () => {
  const store = createHardBestStore(memoryStorage());
  assert.equal(store.get(), null);
  assert.deepEqual(store.record(180), { best: 180, isNewBest: true, persisted: true });
  assert.deepEqual(store.record(120), { best: 180, isNewBest: false, persisted: true });
  assert.deepEqual(store.record(240), { best: 240, isNewBest: true, persisted: true });
});

test('保存済み自己ベストを再読み込みし、不正値は無視する', () => {
  assert.equal(createHardBestStore(memoryStorage({ 'haiku-anthology:plagiarism-best': '210' })).get(), 210);
  assert.equal(createHardBestStore(memoryStorage({ 'haiku-anthology:plagiarism-best': 'oops' })).get(), null);
});

test('localStorage が利用不能でもプレイ結果を返す', () => {
  const broken = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  const store = createHardBestStore(broken);
  assert.equal(store.get(), null);
  assert.deepEqual(store.record(200), { best: 200, isNewBest: true, persisted: false });
});
