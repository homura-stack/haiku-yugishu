import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createOfflineBundle } from '../scripts/build-offline.mjs';

test('index.html は file:// でも読める通常スクリプトを使う', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<script defer src="\.\/dist\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /type="module"/);
});

test('オフライン用JSは実行時に import・export・fetch を使わない', async () => {
  const bundle = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(bundle, /^import\s/m);
  assert.doesNotMatch(bundle, /\bexport\s/);
  assert.doesNotMatch(bundle, /\bfetch\s*\(/);
});

test('dist/app.js は現在のソースから生成した内容と一致する', async () => {
  const actual = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
  assert.equal(actual, await createOfflineBundle());
});
