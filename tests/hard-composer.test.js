import test from 'node:test';
import assert from 'node:assert/strict';
import { createComposer } from '../src/hard-composer.js';

test('札と自由語を追加・移動・削除できる', () => {
  const composer = createComposer();
  assert.equal(composer.addKeyword(0, 'old-pond'), true);
  assert.equal(composer.addFreeText(0, 'や', 'や'), true);
  assert.equal(composer.moveSegment(0, 1, 0), true);
  assert.deepEqual(composer.snapshot().lines[0].map((segment) => segment.type), ['free', 'keyword']);
  assert.equal(composer.removeSegment(0, 0), true);
  assert.equal(composer.snapshot().lines[0].length, 1);
});

test('同じ札は一句に二度追加できず削除後は再利用できる', () => {
  const composer = createComposer();
  assert.equal(composer.addKeyword(0, 'frog'), true);
  assert.equal(composer.addKeyword(1, 'frog'), false);
  composer.removeSegment(0, 0);
  assert.equal(composer.addKeyword(1, 'frog'), true);
});

test('snapshotは内部状態を変更できないコピーを返す', () => {
  const composer = createComposer();
  composer.addKeyword(0, 'frog');
  const snapshot = composer.snapshot();
  snapshot.lines[0].length = 0;
  assert.equal(composer.snapshot().lines[0].length, 1);
});
