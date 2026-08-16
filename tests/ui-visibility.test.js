import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../styles/input.css', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('CSSに単独記号がなく、盗作率鑑定所の操作クラスが専用名で閉じている', () => {
  assert.doesNotMatch(css, /^\s*\+\s*$/m);
  assert.match(html, /class="hard-primary-action"/);
  assert.doesNotMatch(html, /class="primary-button"/);
  assert.doesNotMatch(css, /^\.primary-button/m);
  assert.doesNotMatch(css, /^\.free-form/m);
  assert.doesNotMatch(css, /^\.keyword-card/m);
  assert.doesNotMatch(css, /^\.hard-(?!mode-shell)/m);
});

test('主要操作と補助操作に通常・hover・active・focus・disabled状態がある', () => {
  for (const selector of [
    '.hard-mode-shell .hard-primary-action {',
    '.hard-mode-shell .hard-primary-action:hover',
    '.hard-mode-shell .hard-primary-action:active',
    '.hard-mode-shell .hard-primary-action:focus-visible',
    '.hard-mode-shell .hard-primary-action:disabled',
    '.hard-mode-shell .hard-secondary-action {',
    '.hard-mode-shell .hard-secondary-action:hover',
    '.hard-mode-shell .hard-secondary-action:focus-visible',
  ]) {
    assert.equal(css.includes(selector), true, selector);
  }
  const disabledRule = css.match(/\.hard-mode-shell \.hard-primary-action:disabled\s*\{([^}]+)\}/)?.[1] ?? '';
  assert.match(disabledRule, /background:/);
  assert.match(disabledRule, /color:/);
  assert.doesNotMatch(disabledRule, /opacity:/);
});

test('共通の戻るボタンとキーボードフォーカスに十分な操作領域がある', () => {
  const backRule = css.match(/\.back-button\s*\{([^}]+)\}/)?.[1] ?? '';
  assert.match(backRule, /min-height:\s*44px/);
  assert.match(css, /:focus-visible/);
});

test('盗作率鑑定所は共有札箱とゲーム内一致率の注意書きを備える', () => {
  assert.match(html, /id="hard-line-targets"/);
  assert.match(html, /id="hard-shared-keyword-tray"/);
  assert.match(html, /id="hard-shared-free-form"/);
  assert.match(html, /ゲーム内一致率であり、実在の盗作判定ではありません/);
  assert.match(css, /\.hard-mode-shell \.hard-line-target\.is-active/);
  assert.match(css, /\.hard-mode-shell \.hard-line-editor\.is-active/);
});

test('名句斬りは残り秒数を表示し、動き抑制時に接近を停止する', () => {
  assert.match(html, /id="meiku-remaining"/);
  const reducedMotion = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]+?)\n\}/)?.[1] ?? '';
  assert.doesNotMatch(reducedMotion, /animation-duration:\s*30s/);
  assert.match(reducedMotion, /\.meiku-card\.is-approaching[\s\S]*animation:\s*none\s*!important/);
});
