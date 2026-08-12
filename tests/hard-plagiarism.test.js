import test from 'node:test';
import assert from 'node:assert/strict';
import sourceHaiku from '../data/hard-source-haiku.json' with { type: 'json' };
import { buildKeywordMap, scorePlagiarism } from '../src/hard-plagiarism.js';
import { generateCritique } from '../src/hard-critic.js';

const keywords = buildKeywordMap(sourceHaiku);
const free = (display, reading) => ({ type: 'free', display, reading });
const key = (keywordId) => ({ type: 'keyword', keywordId });

test('古池の句を完全再現すると盗作率100%', () => {
  const composition = { lines: [
    [key('basho-old-pond-old-pond'), free('や', 'や')],
    [key('basho-old-pond-frog'), free('飛び込む', 'とびこむ')],
    [key('basho-old-pond-water-sound')],
  ] };
  const result = scorePlagiarism(composition, sourceHaiku, keywords);
  assert.equal(result.rate, 100);
  assert.equal(result.originalityPoints, 0);
  assert.equal(result.closestSourceId, 'basho-old-pond');
  assert.deepEqual([result.keywordScore, result.orderScore, result.readingScore], [50, 20, 30]);
});

test('収録12句はすべて完全再現で盗作率100%になる', () => {
  for (const source of sourceHaiku) {
    const lines = source.lines.map((line, lineIndex) => {
      const keyword = source.keywords.find((item) => item.sourceLine === lineIndex);
      assert.ok(keyword, `${source.id} line ${lineIndex} needs a keyword`);
      const at = line.reading.indexOf(keyword.reading);
      assert.notEqual(at, -1, `${keyword.id} reading must occur in its source line`);
      const before = line.reading.slice(0, at);
      const after = line.reading.slice(at + keyword.reading.length);
      return [
        ...(before ? [free(before, before)] : []),
        key(keyword.id),
        ...(after ? [free(after, after)] : []),
      ];
    });
    const result = scorePlagiarism({ lines }, sourceHaiku, keywords);
    assert.equal(result.rate, 100, source.id);
    assert.equal(result.closestSourceId, source.id);
  }
});

test('同じキーワードを別の関係へ組み替えると盗作率が下がる', () => {
  const composition = { lines: [
    [key('basho-old-pond-frog'), free('と眠る', 'とねむる')],
    [key('basho-old-pond-water-sound'), free('を馬が聞く', 'をうまがきく')],
    [key('basho-old-pond-old-pond')],
  ] };
  const result = scorePlagiarism(composition, sourceHaiku, keywords);
  assert.ok(result.rate < 100);
  assert.ok(result.orderScore < 20);
});

test('批評家botは30%未満だけを独立作品として扱う', () => {
  assert.equal(generateCritique({ rate: 29, closestSourceId: 'x' }).level, 'original');
  assert.equal(generateCritique({ rate: 30, closestSourceId: 'x' }).level, 'influenced');
  assert.equal(generateCritique({ rate: 80, closestSourceId: 'x' }).level, 'angry');
  assert.equal(generateCritique({ rate: 100, closestSourceId: 'x' }, { author: '松尾芭蕉', display: '古池や　蛙飛びこむ　水の音' }).level, 'copied');
});
