import { buildSeedEntries, rankEntries } from './ranking.js';
import { createStore } from './storage.js';

/**
 * 自分の句とシード句を統合採点し、ランキングと講評を描画。セッションを保存。
 * 順位・得点は「3俳人の合計点（300点満点）」を主指標にする。
 */
export function renderResults(container, { deck, seedJson, submissions }) {
  const mine = submissions.map((cards, i) => ({ author: `あなた#${i + 1}`, cards, isMine: true }));
  const seeds = buildSeedEntries(seedJson, deck.byId).map((e) => ({ ...e, isMine: false }));
  const ranked = rankEntries([...mine, ...seeds]);

  const myBest = ranked.filter((e) => e.isMine).reduce((m, e) => Math.max(m, e.poetTotal), 0);
  const store = createStore();
  store.saveSession({ at: new Date().toISOString(), bestTotal: myBest, count: submissions.length });

  container.innerHTML = `
    <h2 class="text-2xl font-bold text-center tracking-[0.3em]">結果発表</h2>
    <p class="text-center text-sumi-soft">
      あなたの最高得点
      <span class="text-shu font-bold text-2xl align-middle">${myBest}</span>
      <span class="text-sm">/ 300点</span>
      <span class="block text-xs mt-1">（自己ベスト ${store.bestTotal()} / 300）</span>
    </p>
  `;

  const grid = document.createElement('div');
  grid.className = 'grid gap-4 md:grid-cols-2';

  ranked.forEach((e, i) => {
    const card = document.createElement('div');
    card.className = `rounded-lg p-4 flex gap-4 items-stretch ${
      e.isMine ? 'bg-shu/10 border border-shu' : 'bg-washi-dark/50 border border-sumi/20'
    }`;
    // 上五・中七・下五を縦書きの3列で（右→左）並べる。
    const phrase = e.cards
      .map((c) => `<span class="tategaki text-2xl leading-tight">${c.text}</span>`)
      .join('');
    const critiques = e.critiques
      .map(
        (c) => `<li class="leading-snug">
          <span class="inline-block w-12 text-sumi-soft">${c.name}</span>
          <span class="tabular-nums text-shu font-bold mr-2">${c.score}</span>${c.comment}
        </li>`,
      )
      .join('');
    card.innerHTML = `
      <div class="flex-1 space-y-2 min-w-0">
        <div class="flex justify-between items-baseline">
          <span class="font-bold">第${i + 1}位　${e.author}</span>
          <span class="tabular-nums">
            <span class="text-shu font-bold text-2xl">${e.poetTotal}</span>
            <span class="text-sumi-soft text-sm"> / 300点</span>
          </span>
        </div>
        <ul class="text-sm space-y-1">${critiques}</ul>
        <p class="text-xs text-sumi-soft">（風流 ${e.fuuryuu}／シュール ${e.surreal}）</p>
      </div>
      <div class="flex flex-row-reverse gap-2 self-center shrink-0">${phrase}</div>
    `;
    grid.appendChild(card);
  });
  container.appendChild(grid);

  const again = document.createElement('button');
  again.className = 'block mx-auto px-10 py-3 rounded bg-shu text-washi font-bold tracking-[0.3em] text-lg hover:opacity-90 transition';
  again.textContent = 'もう一度';
  again.addEventListener('click', () => location.reload());
  container.appendChild(again);
}
