import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadDeck, selectDeck } from '../src/data.js';

const deckJson = JSON.parse(
  await readFile(new URL('../data/deck.json', import.meta.url), 'utf8')
);
const smallKana = new Set([...'ゃゅょぁぃぅぇぉゎゕゖャュョァィゥェォヮヵヶ']);
const moraCount = (text) => [...text].filter((char) => !smallKana.has(char)).length;

test('deck は5音札と7音札を十分に含む', () => {
  const deck = loadDeck(deckJson);
  assert.ok(deck.fives.length >= 40, '5音札は40枚以上');
  assert.ok(deck.sevens.length >= 30, '7音札は30枚以上');
});

test('全カードが必須フィールドを持つ', () => {
  const deck = loadDeck(deckJson);
  for (const c of [...deck.fives, ...deck.sevens]) {
    assert.ok(typeof c.id === 'string' && c.id.length > 0);
    assert.ok(c.mora === 5 || c.mora === 7);
    assert.equal(typeof c.kigo, 'boolean');
    assert.ok(['noun', 'verb', 'adj', 'other'].includes(c.pos));
    assert.equal(typeof c.tone.motion, 'number');
    assert.equal(typeof c.tone.brightness, 'number');
    assert.ok(c.tone.motion >= -3 && c.tone.motion <= 3);
    assert.ok(c.tone.brightness >= -3 && c.tone.brightness <= 3);
    assert.ok(c.surreal >= 0 && c.surreal <= 3);
    assert.equal(typeof c.cliche, 'boolean');
    assert.equal(moraCount(c.text), c.mora, `${c.id}「${c.text}」の実モーラ数`);
  }
});

test('カードIDと本文に重複がない', () => {
  const cards = [...deckJson.fives, ...deckJson.sevens];
  assert.equal(new Set(cards.map((card) => card.id)).size, cards.length);
  assert.equal(new Set(cards.map((card) => card.text)).size, cards.length);
});

test('幻想・詩的シュール拡張40枚が収録されている', () => {
  const deck = loadDeck(deckJson);
  const expansion = [...deck.fives, ...deck.sevens].filter((card) => (
    (card.id.startsWith('5-') && Number(card.id.slice(2)) >= 93)
    || (card.id.startsWith('7-') && Number(card.id.slice(2)) >= 64)
  ));
  assert.equal(expansion.length, 40);
  assert.ok(expansion.every((card) => card.surreal >= 1));
});

test('byId でカードを引ける', () => {
  const deck = loadDeck(deckJson);
  const first = deck.fives[0];
  assert.equal(deck.byId.get(first.id), first);
});

test('通常デッキは同じ40枚で、ミックスは全札を含む', () => {
  const season = selectDeck(deckJson, 'season');
  const daily = selectDeck(deckJson, 'daily');
  const poetic = selectDeck(deckJson, 'poetic');
  const mixed = selectDeck(deckJson, 'mixed');
  assert.deepEqual([season.fives.length, season.sevens.length], [24, 16]);
  assert.deepEqual([daily.fives.length, daily.sevens.length], [24, 16]);
  assert.deepEqual([poetic.fives.length, poetic.sevens.length], [24, 16]);
  assert.deepEqual([mixed.fives.length, mixed.sevens.length], [116, 79]);

  const regularIds = [season, daily, poetic]
    .flatMap((deck) => [...deck.fives, ...deck.sevens])
    .map((card) => card.id);
  assert.equal(new Set(regularIds).size, 120, '通常デッキ間で札が重複しない');
});
