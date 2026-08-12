import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDraggable } from '../src/dragdrop.js';

function pointerEvent(type, values) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, values);
  return event;
}

test('pointercancelでゴースト・半透明・documentイベントを片付ける', () => {
  const previousDocument = globalThis.document;
  const documentTarget = new EventTarget();
  let appendedGhost = null;
  documentTarget.body = { appendChild: (ghost) => { appendedGhost = ghost; } };
  documentTarget.elementFromPoint = () => null;
  globalThis.document = documentTarget;

  const classes = new Set();
  let releasedPointer = null;
  const card = new EventTarget();
  card.disabled = false;
  card.style = {};
  card.dataset = {};
  card.classList = {
    add: (name) => classes.add(name),
    remove: (name) => classes.delete(name),
  };
  card.setPointerCapture = () => {};
  card.releasePointerCapture = (pointerId) => { releasedPointer = pointerId; };
  card.cloneNode = () => ({
    style: {},
    removed: false,
    remove() { this.removed = true; },
  });

  try {
    makeDraggable(card, { id: 'five', mora: 5 }, () => assert.fail('cancelled drag must not drop'));
    card.dispatchEvent(pointerEvent('pointerdown', {
      button: 0, pointerId: 7, clientX: 10, clientY: 20,
    }));
    assert.equal(classes.has('opacity-30'), true);
    documentTarget.dispatchEvent(pointerEvent('pointercancel', { pointerId: 7 }));

    assert.equal(appendedGhost.removed, true);
    assert.equal(classes.has('opacity-30'), false);
    assert.equal(releasedPointer, 7);
    const lastLeft = appendedGhost.style.left;
    documentTarget.dispatchEvent(pointerEvent('pointermove', { clientX: 99, clientY: 99 }));
    assert.equal(appendedGhost.style.left, lastLeft);
  } finally {
    globalThis.document = previousDocument;
  }
});
