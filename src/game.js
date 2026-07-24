import { dealHand, makeRng } from './dealer.js';

/**
 * 作句フェーズの状態機械。UIは購読側でレンダリングする。
 */
export function createGame({ deck, seconds = 90, seed = Date.now(), onTick, onHand, onEnd }) {
  const rng = makeRng(seed);
  const slots = [null, null, null]; // [5,7,5]
  const submissions = [];
  let remaining = seconds;
  let timerId = null;

  function newHand() {
    slots[0] = slots[1] = slots[2] = null;
    onHand?.(dealHand(deck, rng, { fives: 6, sevens: 4 }), slots);
  }
  function placeCard(slotIndex, card) {
    if (Number.isInteger(slotIndex)) slots[slotIndex] = card;
    return slots.every(Boolean);
  }
  function canSubmit() { return slots.every(Boolean); }
  function submitCurrent() {
    if (!canSubmit()) return false;
    submissions.push([slots[0], slots[1], slots[2]]);
    newHand();
    return true;
  }
  function start() {
    remaining = seconds;
    newHand();
    onTick?.(remaining);
    timerId = setInterval(() => {
      remaining -= 1;
      onTick?.(remaining);
      if (remaining <= 0) { clearInterval(timerId); onEnd?.(submissions); }
    }, 1000);
  }
  return { start, placeCard, submitCurrent, canSubmit,
           getState: () => ({ remaining, slots: [...slots], submissions: [...submissions] }) };
}
