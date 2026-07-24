const PLAYED_KEY = 'copipe-haiku:played';

/**
 * 遊び方画面（#intro）とゲーム本体（#compose）の切り替えを担う。
 * 「はじめる」押下で intro を隠し、compose を表示して onStart() を呼ぶ。
 * @param {{introEl: HTMLElement, composeEl: HTMLElement, startBtn: HTMLElement, onStart: () => void}} o
 */
export function setupIntro({ introEl, composeEl, startBtn, onStart }) {
  // 2回目以降はボタン文言を変えて「常連感」を出す（迷子防止＋テンポ）。
  try {
    if (localStorage.getItem(PLAYED_KEY)) startBtn.textContent = 'もう一句 詠む';
  } catch {
    // file:// で保存領域が無効でも、ゲーム開始は妨げない。
  }

  startBtn.addEventListener(
    'click',
    () => {
      try {
        localStorage.setItem(PLAYED_KEY, '1');
      } catch {
        // 保存できない環境でも画面遷移とゲーム進行を優先する。
      }
      introEl.classList.add('hidden');
      composeEl.classList.remove('hidden');
      onStart();
    },
    { once: true },
  );
}
