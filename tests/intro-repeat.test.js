import test from 'node:test';
import assert from 'node:assert/strict';
import { setupIntro } from '../src/intro.js';

function fakeElement() {
  const classes = new Set();
  return {
    textContent: '',
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
    },
  };
}

test('通常モードは途中退出後にもう一度開始できる', () => {
  const startBtn = new EventTarget();
  startBtn.textContent = 'はじめる';
  const introEl = fakeElement();
  const composeEl = fakeElement();
  let starts = 0;
  setupIntro({ introEl, composeEl, startBtn, onStart: () => { starts += 1; } });
  startBtn.dispatchEvent(new Event('click'));
  introEl.classList.remove('hidden');
  composeEl.classList.add('hidden');
  startBtn.dispatchEvent(new Event('click'));
  assert.equal(starts, 2);
  assert.equal(introEl.classList.contains('hidden'), true);
  assert.equal(composeEl.classList.contains('hidden'), false);
});
