/**
 * カード要素にポインタドラッグを付与。ドロップ時 onDrop(card, slotEl|null) を呼ぶ。
 * slot は [data-slot][data-mora] を持つ要素。mora一致のみ受理。
 */
export function makeDraggable(cardEl, card, onDrop) {
  cardEl.style.touchAction = 'none';
  cardEl.addEventListener('pointerdown', (e) => {
    if (cardEl.disabled || e.button !== 0) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    const ghost = cardEl.cloneNode(true);
    Object.assign(ghost.style, {
      position: 'fixed', left: `${e.clientX}px`, top: `${e.clientY}px`,
      transform: 'translate(-50%, -50%)', pointerEvents: 'none', opacity: '0.9', zIndex: '50',
    });
    document.body.appendChild(ghost);
    cardEl.classList.add('opacity-30');

    cardEl.setPointerCapture?.(e.pointerId);
    const move = (ev) => {
      if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 6) moved = true;
      ghost.style.left = `${ev.clientX}px`;
      ghost.style.top = `${ev.clientY}px`;
    };
    const cleanup = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
      cardEl.releasePointerCapture?.(e.pointerId);
      ghost.remove();
      cardEl.classList.remove('opacity-30');
    };
    const up = (ev) => {
      cleanup();
      if (!moved) return;
      cardEl.dataset.dragged = 'true';
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.slot');
      const ok = target && Number(target.dataset.mora) === card.mora;
      onDrop(card, ok ? target : null);
    };
    const cancel = () => cleanup();
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
  });
}
