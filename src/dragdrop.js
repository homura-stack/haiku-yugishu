/**
 * カード要素にポインタドラッグを付与。ドロップ時 onDrop(card, slotEl|null) を呼ぶ。
 * slot は [data-slot][data-mora] を持つ要素。mora一致のみ受理。
 */
export function makeDraggable(cardEl, card, onDrop) {
  cardEl.style.touchAction = 'none';
  cardEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const ghost = cardEl.cloneNode(true);
    Object.assign(ghost.style, {
      position: 'fixed', left: `${e.clientX}px`, top: `${e.clientY}px`,
      transform: 'translate(-50%, -50%)', pointerEvents: 'none', opacity: '0.9', zIndex: '50',
    });
    document.body.appendChild(ghost);
    cardEl.classList.add('opacity-30');

    const move = (ev) => { ghost.style.left = `${ev.clientX}px`; ghost.style.top = `${ev.clientY}px`; };
    const up = (ev) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      ghost.remove();
      cardEl.classList.remove('opacity-30');
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.slot');
      const ok = target && Number(target.dataset.mora) === card.mora;
      onDrop(card, ok ? target : null);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });
}
