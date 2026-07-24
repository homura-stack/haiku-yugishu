import { test } from 'node:test';
import assert from 'node:assert/strict';
import { critique } from '../src/critics.js';

test('3人ぶんの講評が返り、poetが重複しない', () => {
  const rs = critique({ fuuryuu: 70, surreal: 30, fired: ['kigo_present', 'tone_consistent'] });
  assert.equal(rs.length, 3);
  assert.deepEqual(
    rs.map((r) => r.poet).sort(),
    ['okina', 'sosho', 'wakate'],
  );
});

test('宗匠は風流点、若手はシュール点をおおむね反映', () => {
  const rs = critique({ fuuryuu: 90, surreal: 10, fired: ['kigo_present', 'tone_consistent'] });
  const sosho = rs.find((r) => r.poet === 'sosho');
  const wakate = rs.find((r) => r.poet === 'wakate');
  assert.ok(sosho.score > wakate.score);
});

test('各講評コメントは非空文字列', () => {
  const rs = critique({ fuuryuu: 50, surreal: 50, fired: ['tone_clash', 'high_surreal', 'pos_mismatch'] });
  for (const r of rs) {
    assert.equal(typeof r.comment, 'string');
    assert.ok(r.comment.length > 0);
  }
});

test('決定的（同入力→同出力）', () => {
  const input = { fuuryuu: 60, surreal: 40, fired: ['kigo_present'] };
  assert.deepEqual(critique(input), critique(input));
});
