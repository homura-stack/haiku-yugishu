import test from 'node:test';
import assert from 'node:assert/strict';
import sourceHaiku from '../data/hard-source-haiku.json' with { type: 'json' };
import { validateReading } from '../src/hard-mora.js';

test('代表12句を4俳人から各3句収録する', () => {
  assert.equal(sourceHaiku.length, 12);
  const counts = Object.groupBy(sourceHaiku, (source) => source.author);
  assert.deepEqual(
    Object.fromEntries(Object.entries(counts).map(([author, items]) => [author, items.length])),
    { 松尾芭蕉: 3, 与謝蕪村: 3, 小林一茶: 3, 正岡子規: 3 },
  );
});

test('全名句が3キーワード・読み・出典を持つ', () => {
  const sourceIds = new Set();
  const keywordIds = new Set();
  for (const source of sourceHaiku) {
    assert.equal(sourceIds.has(source.id), false);
    sourceIds.add(source.id);
    assert.equal(source.lines.length, 3);
    assert.equal(source.keywords.length, 3);
    assert.match(source.sourceUrl, /^https:\/\//);
    assert.equal(typeof source.sourceTitle, 'string');
    assert.ok(source.sourceTitle.trim().length > 0);
    source.lines.forEach((line) => assert.equal(validateReading(line.reading).valid, true));
    source.keywords.forEach((keyword) => {
      assert.equal(keywordIds.has(keyword.id), false);
      keywordIds.add(keyword.id);
      assert.equal(validateReading(keyword.reading).valid, true);
    });
  }
  assert.equal(keywordIds.size, 36);
});

test('句を掲載していない汎用ページを出典確認先にしない', () => {
  const oldPondEssay = 'https://www.aozora.gr.jp/cards/000305/files/57363_59643.html';
  assert.deepEqual(
    sourceHaiku.filter((source) => source.sourceUrl === oldPondEssay).map((source) => source.id),
    ['basho-old-pond'],
  );
  assert.equal(sourceHaiku.some((source) => source.sourceUrl === 'https://www.issakinenkan.com/about_issa/'), false);
});
