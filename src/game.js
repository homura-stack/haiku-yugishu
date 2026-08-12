import { dealHand, makeRng } from './dealer.js';

/**
 * 作句フェーズの状態機械。UIは購読側でレンダリングする。
 */
export function createGame({ deck, seconds = 90, seed = Date.now(), onTick, onHand, onEnd, scheduler = globalThis }) {
  const rng = makeRng(seed);
  const slotMoras = [5, 7, 5];
  const slots = [null, null, null]; // [5,7,5]
  const submissions = [];
  let remaining = seconds;
  let timerId = null;

  function newHand() {
    slots[0] = slots[1] = slots[2] = null;
    onHand?.(dealHand(deck, rng, { fives: 6, sevens: 4 }), slots);
  }
  function placeCard(slotIndex, card) {
    const rejected = (reason) => ({
      accepted: false,
      complete: slots.every(Boolean),
      replacedCard: null,
      reason,
    });
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slots.length) return rejected('invalid_slot');
    if (!card || card.mora !== slotMoras[slotIndex]) return rejected('mora_mismatch');
    const duplicateIndex = slots.findIndex((placed, index) => index !== slotIndex && placed?.id === card.id);
    if (duplicateIndex !== -1) return rejected('card_already_used');
    const replacedCard = slots[slotIndex];
    slots[slotIndex] = card;
    return {
      accepted: true,
      complete: slots.every(Boolean),
      replacedCard,
      reason: null,
    };
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
    timerId = scheduler.setInterval(() => {
      remaining -= 1;
      onTick?.(remaining);
      if (remaining <= 0) { scheduler.clearInterval(timerId); timerId = null; onEnd?.(submissions); }
    }, 1000);
  }
  function cancel() {
    if (timerId !== null) scheduler.clearInterval(timerId);
    timerId = null;
  }
  return { start, cancel, placeCard, submitCurrent, canSubmit,
           getState: () => ({ remaining, running: timerId !== null, slots: [...slots], submissions: [...submissions] }) };
}
