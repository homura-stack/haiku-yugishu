import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeedEntries, rankEntries } from '../src/ranking.js';

const c = (id, o = {}) => ({
  id, text: id, mora: o.mora ?? 5, kigo: o.kigo ?? false, pos: o.pos ?? 'noun',
  tone: o.tone ?? { motion: 0, brightness: 0 }, surreal: o.surreal ?? 0, cliche: o.cliche ?? false,
});

test('seed.json の cardIds を実カードに解決する', () => {
  const byId = new Map([['5-001', c('5-001')], ['7-001', c('7-001', { mora: 7 })], ['5-002', c('5-002')]]);
  const seedJson = [{ author: '詠み人知らず', cardIds: ['5-001', '7-001', '5-002'] }];
  const entries = buildSeedEntries(seedJson, byId);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].cards.length, 3);
  assert.equal(entries[0].cards[1].id, '7-001');
});

test('total 降順で並び、採点と講評が付く', () => {
  const strong = { author: 'A', cards: [c('a', { kigo: true }), c('b', { mora: 7, kigo: true }), c('c', { kigo: true })] };
  const weak = { author: 'B', cards: [c('d', { cliche: true }), c('e', { mora: 7, cliche: true }), c('f')] };
  const ranked = rankEntries([weak, strong]);
  assert.equal(ranked[0].author, 'A');
  assert.ok(ranked[0].total >= ranked[1].total);
  assert.equal(ranked[0].critiques.length, 3);
  assert.equal(typeof ranked[0].fuuryuu, 'number');
});
