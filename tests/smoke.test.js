import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('初期画面と主要3モードのDOM契約が揃っている', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<section id="mode-select" class="(?![^"]*hidden)[^"]*"/);
  for (const id of [
    'choose-copy', 'choose-copy-normal', 'choose-copy-hard', 'choose-meiku',
    'compose', 'hard-mode-shell', 'meiku-game',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
});

test('オフラインバンドルは即時実行形式で初期化処理を含む', async () => {
  const bundle = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
  assert.match(bundle, /^\(\(\) => \{/);
  assert.match(bundle, /setupIntro\(\{/);
  assert.match(bundle, /setupMeiku\(\{/);
  assert.match(bundle, /showHardIntro/);
});
