import test from 'node:test';
import assert from 'node:assert/strict';
import { countMora, validateReading, validateComposition } from '../src/hard-mora.js';

test('ひらがなのモーラを数える', () => {
  assert.equal(countMora('きょう'), 2);
  assert.equal(countMora('がっこう'), 4);
  assert.equal(countMora('らーめん'), 4);
  assert.equal(countMora('みずのおと。'), 5);
});

test('自由語の読みはひらがなと長音だけを許可する', () => {
  assert.equal(validateReading('とびこむ').valid, true);
  assert.equal(validateReading('らーめん').valid, true);
  assert.equal(validateReading('飛び込む').valid, false);
});

test('各行は五七五からプラスマイナス2音まで許可する', () => {
  const keywords = new Map([
    ['k1', { id: 'k1', reading: 'ふるいけ' }],
    ['k2', { id: 'k2', reading: 'かわず' }],
    ['k3', { id: 'k3', reading: 'みずのおと' }],
  ]);
  const composition = {
    lines: [
      [{ type: 'keyword', keywordId: 'k1' }],
      [{ type: 'keyword', keywordId: 'k2' }, { type: 'free', display: '飛ぶ', reading: 'とぶ' }],
      [{ type: 'keyword', keywordId: 'k3' }],
    ],
  };
  const result = validateComposition(composition, keywords);
  assert.equal(result.valid, true);
  assert.deepEqual(result.lines.map((line) => line.delta), [-1, -2, 0]);
});

test('範囲外とキーワード未使用行を拒否する', () => {
  const keywords = new Map([['k1', { id: 'k1', reading: 'ふるいけ' }]]);
  const composition = {
    lines: [
      [{ type: 'keyword', keywordId: 'k1' }, { type: 'free', display: 'どこまでも', reading: 'どこまでも' }],
      [{ type: 'free', display: '自由', reading: 'じゆう' }],
      [{ type: 'keyword', keywordId: 'k1' }],
    ],
  };
  const result = validateComposition(composition, keywords);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('line_0_out_of_range'));
  assert.ok(result.errors.includes('line_1_keyword_required'));
  assert.ok(result.errors.includes('keyword_reused'));
});
