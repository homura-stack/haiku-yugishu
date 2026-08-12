import test from 'node:test';
import assert from 'node:assert/strict';
import sourceHaiku from '../data/hard-source-haiku.json' with { type: 'json' };
import { createRounds } from '../src/hard-rounds.js';

test('3ラウンドで12名句を一度ずつ使い各回12札を配る', () => {
  const rounds = createRounds(sourceHaiku, 1234);
  assert.equal(rounds.length, 3);
  assert.deepEqual(rounds.map((round) => round.keywordIds.length), [12, 12, 12]);
  const sourceIds = rounds.flatMap((round) => round.sourceIds);
  assert.equal(new Set(sourceIds).size, 12);
});
