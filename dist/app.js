(() => {
'use strict';

// ---- src/data.js ----
/**
 * deck.json のオブジェクトを受け取り、扱いやすい形へ整える。
 * @param {{fives: object[], sevens: object[]}} json
 */
function loadDeck(json) {
  const fives = json.fives ?? [];
  const sevens = json.sevens ?? [];
  const byId = new Map();
  for (const c of [...fives, ...sevens]) byId.set(c.id, c);
  return { fives, sevens, byId };
}

const PRESET_CARD_NUMBERS = {
  season: {
    fives: new Set([1, 2, 7, 9, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 53, 60, 63, 75]),
    sevens: new Set([1, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 39, 40, 41, 43]),
  },
  daily: {
    fives: new Set([3, 5, 10, 12, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 42, 46, 47, 48, 49, 50, 51, 52, 82]),
    sevens: new Set([3, 4, 5, 6, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 38]),
  },
  poetic: {
    fives: new Set(Array.from({ length: 24 }, (_, index) => index + 93)),
    sevens: new Set(Array.from({ length: 16 }, (_, index) => index + 64)),
  },
};

const cardNumber = (card) => Number(card.id.slice(2));

/**
 * 説明画面で選んだデッキに応じて、元データを壊さずカードプールを切り替える。
 * @param {{fives: object[], sevens: object[]}} json
 * 通常デッキはすべて五音24枚・七音16枚の計40枚。
 * @param {'season'|'daily'|'poetic'|'mixed'} preset
 */
function selectDeck(json, preset = 'mixed') {
  if (preset === 'mixed') return { fives: [...json.fives], sevens: [...json.sevens] };
  const selected = PRESET_CARD_NUMBERS[preset] ?? PRESET_CARD_NUMBERS.season;
  return {
    fives: json.fives.filter((card) => selected.fives.has(cardNumber(card))),
    sevens: json.sevens.filter((card) => selected.sevens.has(cardNumber(card))),
  };
}

// ---- src/dealer.js ----
/** 決定的な擬似乱数生成器（mulberry32）。 */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 配列から n 枚を非復元でランダム抽出（元配列は不変）。 */
function sample(arr, n, rng) {
  const pool = arr.slice();
  const out = [];
  const k = Math.min(n, pool.length);
  for (let i = 0; i < k; i++) {
    const idx = Math.floor(rng() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

/**
 * 手札を配る。デッキ全体からの抽出なので何度でも配れる（枯渇しない）。
 * @returns {{fives: object[], sevens: object[]}}
 */
function dealHand(deck, rng, { fives = 4, sevens = 3 } = {}) {
  return {
    fives: sample(deck.fives, fives, rng),
    sevens: sample(deck.sevens, sevens, rng),
  };
}

// ---- src/game.js ----
/**
 * 作句フェーズの状態機械。UIは購読側でレンダリングする。
 */
function createGame({ deck, seconds = 90, seed = Date.now(), onTick, onHand, onEnd, scheduler = globalThis }) {
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

// ---- src/dragdrop.js ----
/**
 * カード要素にポインタドラッグを付与。ドロップ時 onDrop(card, slotEl|null) を呼ぶ。
 * slot は [data-slot][data-mora] を持つ要素。mora一致のみ受理。
 */
function makeDraggable(cardEl, card, onDrop) {
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

// ---- src/scoring.js ----
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 3枚のトーンの散らばり（motion幅 + brightness幅）。小さいほど一貫。 */
function toneSpread(cards) {
  const ms = cards.map((c) => c.tone.motion);
  const bs = cards.map((c) => c.tone.brightness);
  return (Math.max(...ms) - Math.min(...ms)) + (Math.max(...bs) - Math.min(...bs));
}

/**
 * 俳句（順序付き3枚）を二軸で採点する純関数。
 * @param {object[]} cards - [5音, 7音, 5音]
 * @returns {{fuuryuu: number, surreal: number, fired: string[]}}
 */
function score(cards) {
  const fired = [];

  const hasKigo = cards.some((c) => c.kigo);
  if (hasKigo) fired.push('kigo_present');

  const spread = toneSpread(cards);
  const toneConsistent = spread <= 4;
  fired.push(toneConsistent ? 'tone_consistent' : 'tone_clash');

  const posMismatch = new Set(cards.map((c) => c.pos)).size === 3;
  if (posMismatch) fired.push('pos_mismatch');

  const surrealSum = cards.reduce((s, c) => s + c.surreal, 0);
  if (surrealSum >= 5) fired.push('high_surreal');

  const clicheCount = cards.filter((c) => c.cliche).length;
  if (clicheCount >= 2) fired.push('cliche_heavy');

  // 風流：季語＋トーン一貫の王道を強く評価。シュール要素で大きく減点（振り幅重視）。
  let fuuryuu = 15;
  if (hasKigo) fuuryuu += 40;
  fuuryuu += toneConsistent ? 30 : -20;
  if (hasKigo && toneConsistent) fuuryuu += 15; // 王道コンボ加点
  fuuryuu -= surrealSum * 5;
  fuuryuu = clamp(Math.round(fuuryuu), 0, 100);

  // シュール：トーン激突・高シュール・品詞崩しを強く加点。ベタ札で大きく減点。
  let surreal = 5;
  surreal += toneConsistent ? -10 : 45;
  surreal += surrealSum * 9;
  if (posMismatch) surreal += 20;
  surreal -= clicheCount * 15;
  surreal = clamp(Math.round(surreal), 0, 100);

  return { fuuryuu, surreal, fired };
}

// ---- src/critics.js ----
// 各俳人の人物設定と、発火ルール→講評テンプレ。優先度の高い順に最初に一致した1つを採用。
const POETS = {
  sosho: {
    name: '宗匠',
    weight: (s) => Math.round(s.fuuryuu * 0.9 + s.surreal * 0.1),
    lines: [
      ['kigo_present',    '季語がよう効いておる。趣を心得ておるな。'],
      ['tone_consistent', '景の流れに乱れなし。まずは上等。'],
      ['tone_clash',      'ふむ…景がちぐはぐじゃ。落ち着きが足りぬ。'],
      ['cliche_heavy',    '手垢のついた取り合わせよ。工夫を望む。'],
      ['*',               '悪くはない。精進あるのみ。'],
    ],
  },
  wakate: {
    name: '毒舌の若手',
    weight: (s) => Math.round(s.surreal * 0.9 + s.fuuryuu * 0.1),
    lines: [
      ['high_surreal', 'うわ、意味わからん。でもそこが最高、優勝。'],
      ['pos_mismatch', '文法崩壊してるのに成立してるの、ずるい。'],
      ['tone_clash',   '振り幅えぐい。事故と紙一重で好き。'],
      ['cliche_heavy', 'はい教科書。無難すぎて逆に眠い。'],
      ['*',            'まあ…普通。もっと壊していこ。'],
    ],
  },
  okina: {
    name: '天然の翁',
    // 翁は「一芸に秀でた句」を好む：強い方の軸を重く見る（凡庸な句ほど伸びない）。
    weight: (s) => Math.round(Math.max(s.fuuryuu, s.surreal) * 0.7 + Math.min(s.fuuryuu, s.surreal) * 0.3),
    lines: [
      ['tone_consistent', 'ほほ、なんだか穏やかでええのう。'],
      ['kigo_present',    '季節を感じるわい。茶でも飲むかの。'],
      ['high_surreal',    'ようわからんが…元気があってよろしい。'],
      ['*',               'うむ。ところで今日は良い天気じゃ。'],
    ],
  },
};

function pickLine(poet, fired) {
  for (const [rule, text] of poet.lines) {
    if (rule === '*' || fired.includes(rule)) return text;
  }
  return poet.lines[poet.lines.length - 1][1];
}

/**
 * 採点結果から3人の講評を生成する純関数。
 * @param {{fuuryuu:number, surreal:number, fired:string[]}} scoreResult
 * @returns {{poet:string, name:string, score:number, comment:string}[]}
 */
function critique(scoreResult) {
  return ['sosho', 'wakate', 'okina'].map((key) => {
    const poet = POETS[key];
    return {
      poet: key,
      name: poet.name,
      score: poet.weight(scoreResult),
      comment: pickLine(poet, scoreResult.fired),
    };
  });
}

// ---- src/ranking.js ----
/** seed.json の {author, cardIds} を、実カードを持つ Entry に変換。 */
function buildSeedEntries(seedJson, byId) {
  return seedJson
    .map((s) => ({ author: s.author, cards: s.cardIds.map((id) => byId.get(id)) }))
    .filter((e) => e.cards.every(Boolean) && e.cards.length === 3);
}

/**
 * Entry[] を採点・講評付きで並べる。順位は「3俳人の合計点（300点満点）」の降順。
 * poetTotal = 宗匠・若手・翁の点の合計（各0〜100）。
 */
function rankEntries(entries) {
  return entries
    .map((e) => {
      const s = score(e.cards);
      const critiques = critique(s);
      const poetTotal = critiques.reduce((sum, c) => sum + c.score, 0);
      return {
        ...e,
        fuuryuu: s.fuuryuu,
        surreal: s.surreal,
        total: s.fuuryuu + s.surreal,
        poetTotal,
        critiques,
      };
    })
    .sort((a, b) => b.poetTotal - a.poetTotal);
}

// ---- src/storage.js ----
const KEY = 'copipe-haiku:history';

/**
 * localStorage 互換 backend を注入して使うストア。
 * backend は getItem/setItem を持つオブジェクト。
 */
function createStore(backend = globalThis.localStorage) {
  function loadHistory() {
    try {
      const raw = backend.getItem(KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  return {
    loadHistory,
    saveSession(session) {
      try {
        const hist = loadHistory();
        hist.push(session);
        backend.setItem(KEY, JSON.stringify(hist));
        return true;
      } catch {
        return false;
      }
    },
    bestTotal() {
      return loadHistory().reduce((m, s) => Math.max(m, s.bestTotal ?? 0), 0);
    },
  };
}

// ---- src/results.js ----
/**
 * 自分の句とシード句を統合採点し、ランキングと講評を描画。セッションを保存。
 * 順位・得点は「3俳人の合計点（300点満点）」を主指標にする。
 */
function renderResults(container, { deck, seedJson, submissions, onExit = null }) {
  const mine = submissions.map((cards, i) => ({ author: `あなた#${i + 1}`, cards, isMine: true }));
  const seeds = buildSeedEntries(seedJson, deck.byId).map((e) => ({ ...e, isMine: false }));
  const ranked = rankEntries([...mine, ...seeds]);

  const myBest = ranked.filter((e) => e.isMine).reduce((m, e) => Math.max(m, e.poetTotal), 0);
  const store = createStore();
  const saved = store.saveSession({ at: new Date().toISOString(), bestTotal: myBest, count: submissions.length });

  container.innerHTML = `
    <h2 class="text-2xl font-bold text-center tracking-[0.3em]">結果発表</h2>
    <p class="text-center text-sumi-soft">
      あなたの最高得点
      <span class="text-shu font-bold text-2xl align-middle">${myBest}</span>
      <span class="text-sm">/ 300点</span>
      <span class="block text-xs mt-1">（自己ベスト ${store.bestTotal()} / 300）</span>
    </p>
    ${saved ? '' : '<p class="storage-warning text-center" role="status">今回の結果は表示できますが、端末へ記録を保存できませんでした。</p>'}
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
  again.className = 'app-primary-action block mx-auto px-10 py-3 rounded tracking-[0.3em] text-lg transition';
  again.textContent = 'もう一度';
  again.addEventListener('click', () => location.reload());
  container.appendChild(again);

  if (onExit) {
    const exit = document.createElement('button');
    exit.className = 'app-secondary-action block mx-auto mt-3 px-8 py-2 rounded';
    exit.textContent = '難易度選択へ';
    exit.addEventListener('click', onExit);
    container.appendChild(exit);
  }
}

// ---- src/intro.js ----
const PLAYED_KEY = 'copipe-haiku:played';

/**
 * 遊び方画面（#intro）とゲーム本体（#compose）の切り替えを担う。
 * 「はじめる」押下で intro を隠し、compose を表示して onStart() を呼ぶ。
 * @param {{introEl: HTMLElement, composeEl: HTMLElement, startBtn: HTMLElement, onStart: () => void}} o
 */
function setupIntro({ introEl, composeEl, startBtn, onStart }) {
  // 2回目以降はボタン文言を変えて「常連感」を出す（迷子防止＋テンポ）。
  try {
    if (localStorage.getItem(PLAYED_KEY)) startBtn.textContent = 'もう一句 詠む';
  } catch {
    // file:// で保存領域が無効でも、ゲーム開始は妨げない。
  }

  startBtn.addEventListener('click', () => {
      try {
        localStorage.setItem(PLAYED_KEY, '1');
      } catch {
        // 保存できない環境でも画面遷移とゲーム進行を優先する。
      }
      introEl.classList.add('hidden');
      composeEl.classList.remove('hidden');
      onStart();
  });
}

// ---- src/meiku.js ----
const MEIKU_QUESTIONS = [
  {
    author: '松尾芭蕉',
    parts: ['古池や', '蛙飛びこむ', '水の音'],
    blank: 1,
    readings: ['蛙飛びこむ', 'かわずとびこむ'],
    choices: ['蛙飛びこむ', '風が吹きこむ', '舟の行きかう', '月影ゆれる'],
  },
  {
    author: '松尾芭蕉',
    parts: ['夏草や', '兵どもが', '夢の跡'],
    blank: 1,
    readings: ['兵どもが', 'つわものどもが'],
    choices: ['兵どもが', '旅人たちが', '武者の声する', '鳥飛び立ちて'],
  },
  {
    author: '松尾芭蕉',
    parts: ['閑さや', '岩にしみ入る', '蝉の声'],
    blank: 1,
    readings: ['岩にしみ入る', 'いわにしみいる'],
    choices: ['岩にしみ入る', '谷へ響ける', '森をふるわす', '空に消えゆく'],
  },
  {
    author: '松尾芭蕉',
    parts: ['五月雨を', 'あつめて早し', '最上川'],
    blank: 1,
    readings: ['あつめて早し', 'あつめてはやし'],
    choices: ['あつめて早し', 'ながめて涼し', '越えてぞ遠き', '流して青し'],
  },
  {
    author: '松尾芭蕉',
    parts: ['荒海や', '佐渡によこたふ', '天の河'],
    blank: 1,
    readings: ['佐渡によこたふ', '佐渡に横たう', 'さどによこたう'],
    choices: ['佐渡によこたふ', '沖へ流るる', '波間にかかる', '越後を照らす'],
  },
  {
    author: '松尾芭蕉',
    parts: ['秋深き', '隣は何を', 'する人ぞ'],
    blank: 1,
    readings: ['隣は何を', 'となりはなにを'],
    choices: ['隣は何を', '旅人いずこ', '庵は誰を', '夕日はどこを'],
  },
  {
    author: '松尾芭蕉',
    parts: ['枯枝に', '烏のとまりけり', '秋の暮'],
    blank: 1,
    readings: ['烏のとまりけり', 'からすのとまりけり'],
    choices: ['烏のとまりけり', '月影やどりけり', '木の葉の残りけり', '時雨のかかりけり'],
  },
  {
    author: '与謝蕪村',
    parts: ['菜の花や', '月は東に', '日は西に'],
    blank: 1,
    readings: ['月は東に', 'つきはひがしに'],
    choices: ['月は東に', '雲は彼方に', '鳥はねぐらに', '風は野原に'],
  },
  {
    author: '与謝蕪村',
    parts: ['春の海', 'ひねもすのたり', 'のたりかな'],
    blank: 1,
    readings: ['ひねもすのたり'],
    choices: ['ひねもすのたり', 'きらきら光り', '霞を映し', '白波寄せて'],
  },
  {
    author: '与謝蕪村',
    parts: ['涼しさや', '鐘をはなるる', '鐘の声'],
    blank: 1,
    readings: ['鐘をはなるる', 'かねをはなるる'],
    choices: ['鐘をはなるる', '風にほどける', '山をわたりし', '空へひろがる'],
  },
  {
    author: '与謝蕪村',
    parts: ['朝顔や', '一輪深き', '淵の色'],
    blank: 1,
    readings: ['一輪深き', 'いちりんふかき'],
    choices: ['一輪深き', '雫をたたえ', '垣根に咲ける', '紫うすき'],
  },
  {
    author: '与謝蕪村',
    parts: ['月天心', '貧しき町を', '通りけり'],
    blank: 1,
    readings: ['貧しき町を', 'まずしきまちを'],
    choices: ['貧しき町を', '静かな野辺を', '白壁の上を', '都の空を'],
  },
  {
    author: '与謝蕪村',
    parts: ['不二ひとつ', '埋み残して', '若葉かな'],
    blank: 1,
    readings: ['埋み残して', 'うずみのこして'],
    choices: ['埋み残して', '雲より高く', '霞に浮かべ', '空を支えて'],
  },
  {
    author: '与謝蕪村',
    parts: ['春雨や', 'ものがたりゆく', '蓑と傘'],
    blank: 1,
    readings: ['ものがたりゆく'],
    choices: ['ものがたりゆく', '並んで歩く', 'しずくを払う', '野道を急ぐ'],
  },
  {
    author: '小林一茶',
    parts: ['雀の子', 'そこのけそこのけ', '御馬が通る'],
    blank: 1,
    readings: ['そこのけそこのけ'],
    choices: ['そこのけそこのけ', 'こちらへおいでよ', 'しずかにしておれ', 'あしたも会おうぞ'],
  },
  {
    author: '小林一茶',
    parts: ['やせ蛙', 'まけるな一茶', 'これにあり'],
    blank: 1,
    readings: ['まけるな一茶', 'まけるないっさ'],
    choices: ['まけるな一茶', 'こちらを向けよ', '田んぼへ帰れ', 'まだ跳べるはず'],
  },
  {
    author: '小林一茶',
    parts: ['名月を', '取ってくれろと', '泣く子かな'],
    blank: 1,
    readings: ['取ってくれろと', 'とってくれろと'],
    choices: ['取ってくれろと', 'そっと見上げて', 'ひとり眺めて', '待っておくれと'],
  },
  {
    author: '小林一茶',
    parts: ['めでたさも', '中くらいなり', 'おらが春'],
    blank: 1,
    readings: ['中くらいなり', 'ちゅうくらいなり'],
    choices: ['中くらいなり', '格別である', '人それぞれの', '夢のごとくに'],
  },
  {
    author: '小林一茶',
    parts: ['露の世は', '露の世ながら', 'さりながら'],
    blank: 1,
    readings: ['露の世ながら', 'つゆのよながら'],
    choices: ['露の世ながら', '夢の世なれど', '消えるものとは', 'はかなきものよ'],
  },
  {
    author: '小林一茶',
    parts: ['我と来て', '遊べや親の', 'ない雀'],
    blank: 1,
    readings: ['遊べや親の', 'あそべやおやの'],
    choices: ['遊べや親の', '鳴けよ野原の', '休めや羽根の', 'ここへおいでよ'],
  },
  {
    author: '小林一茶',
    parts: ['雪とけて', '村いっぱいの', '子どもかな'],
    blank: 1,
    readings: ['村いっぱいの', 'むらいっぱいの'],
    choices: ['村いっぱいの', '道のあちこち', '声にぎやかな', '春風吹ける'],
  },
  {
    author: '正岡子規',
    parts: ['柿食へば', '鐘が鳴るなり', '法隆寺'],
    blank: 1,
    readings: ['鐘が鳴るなり', 'かねがなるなり'],
    choices: ['鐘が鳴るなり', '鹿が振り向く', '秋風吹きぬく', '月が昇るなり'],
  },
  {
    author: '正岡子規',
    parts: ['鶏頭の', '十四五本も', 'ありぬべし'],
    blank: 1,
    readings: ['十四五本も', 'じゅうしごほんも'],
    choices: ['十四五本も', '庭いっぱいに', '赤々として', '夕日に燃えて'],
  },
  {
    author: '正岡子規',
    parts: ['春風や', '堤長うして', '家遠し'],
    blank: 1,
    readings: ['堤長うして', 'つつみなごうして'],
    choices: ['堤長うして', '柳ゆれつつ', '小川きらめき', '旅路はるけく'],
  },
  {
    author: '正岡子規',
    parts: ['いくたびも', '雪の深さを', '尋ねけり'],
    blank: 1,
    readings: ['雪の深さを', 'ゆきのふかさを'],
    choices: ['雪の深さを', '空の明るさ', '風の行方を', '春の便りを'],
  },
  {
    author: '正岡子規',
    parts: ['赤蜻蛉', '筑波に雲も', 'なかりけり'],
    blank: 1,
    readings: ['筑波に雲も', 'つくばにくもも'],
    choices: ['筑波に雲も', '野末に影も', '夕日に山も', '稲田に風も'],
  },
  {
    author: '正岡子規',
    parts: ['若鮎の', '二手になりて', '上りけり'],
    blank: 1,
    readings: ['二手になりて', 'ふたてになりて'],
    choices: ['二手になりて', '流れに光り', '岩間をぬいて', '水面を跳ねて'],
  },
  {
    author: '正岡子規',
    parts: ['夏嵐', '机上の白紙', '飛び尽す'],
    blank: 1,
    readings: ['机上の白紙', 'きじょうのはくし'],
    choices: ['机上の白紙', '庭木の若葉', '障子の明かり', '書きかけの文'],
  },
];

const MEIKU_ROUND_SIZE = 10;

function normalizeMeikuAnswer(value) {
  return String(value)
    .trim()
    .replace(/[\s　、。,.!！?？「」『』]/g, '')
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .toLowerCase();
}

function isMeikuCorrect(question, answer) {
  const normalized = normalizeMeikuAnswer(answer);
  return question.readings.some((reading) => normalizeMeikuAnswer(reading) === normalized);
}

function resolveMeikuAnswer({ correct, score, streak }) {
  if (!correct) return { locked: true, score, streak: 0, correctIncrement: 0 };
  const nextStreak = streak + 1;
  return {
    locked: true,
    score: score + 100 + Math.min(100, (nextStreak - 1) * 20),
    streak: nextStreak,
    correctIncrement: 1,
  };
}

function getMeikuRemainingSeconds(deadline, now = Date.now()) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

const shuffle = (items) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

function setupMeiku({
  introEl,
  gameEl,
  resultEl,
  startBtn,
  onExit,
}) {
  const cardEl = document.getElementById('meiku-card');
  const answersEl = document.getElementById('meiku-answers');
  const inputForm = document.getElementById('meiku-input-form');
  const inputEl = document.getElementById('meiku-input');
  const feedbackEl = document.getElementById('meiku-feedback');
  const scoreEl = document.getElementById('meiku-score');
  const streakEl = document.getElementById('meiku-streak');
  const progressEl = document.getElementById('meiku-progress');
  const remainingEl = document.getElementById('meiku-remaining');
  const resultScoreEl = document.getElementById('meiku-result-score');
  const resultCorrectEl = document.getElementById('meiku-result-correct');
  const retryBtn = document.getElementById('meiku-retry');
  const exitBtn = document.getElementById('meiku-exit');
  const katanaEl = document.getElementById('katana-illustration');

  let level = 'easy';
  let questions = [];
  let questionIndex = 0;
  let currentQuestion = null;
  let currentChoices = [];
  let score = 0;
  let streak = 0;
  let correctCount = 0;
  let timeoutId = null;
  let countdownId = null;
  let locked = false;
  let active = false;

  const clearQuestionTimers = () => {
    window.clearTimeout(timeoutId);
    window.clearInterval(countdownId);
    timeoutId = null;
    countdownId = null;
    remainingEl.textContent = '—';
  };

  const updateStatus = () => {
    scoreEl.textContent = String(score);
    streakEl.textContent = String(streak);
    progressEl.textContent = `${Math.min(questionIndex + 1, questions.length)} / ${questions.length}`;
  };

  const fillCompletedPhrase = () => {
    cardEl.querySelectorAll('.meiku-line').forEach((line, index) => {
      line.textContent = currentQuestion.parts[index];
      line.classList.remove('is-blank');
    });
  };

  const nextQuestion = () => {
    clearQuestionTimers();
    questionIndex += 1;
    if (questionIndex >= questions.length) {
      active = false;
      gameEl.classList.add('hidden');
      resultEl.classList.remove('hidden');
      resultScoreEl.textContent = String(score);
      resultCorrectEl.textContent = `${correctCount} / ${questions.length}`;
      return;
    }
    renderQuestion();
  };

  // 正誤・時間切れを同じ終了経路へ集約し、一問中の再回答を確実に防ぐ。
  const finishQuestion = ({ correct, message, cardState, delay }) => {
    if (locked) return;
    const resolution = resolveMeikuAnswer({ correct, score, streak });
    locked = resolution.locked;
    score = resolution.score;
    streak = resolution.streak;
    correctCount += resolution.correctIncrement;
    clearQuestionTimers();
    if (!correct) {
      updateStatus();
      fillCompletedPhrase();
      feedbackEl.textContent = `${message}　正解：${currentQuestion.parts[currentQuestion.blank]}`;
      feedbackEl.className = 'meiku-feedback is-wrong';
      cardEl.classList.add(cardState);
      window.setTimeout(nextQuestion, delay);
      return;
    }

    updateStatus();
    fillCompletedPhrase();
    feedbackEl.textContent = '正解　――　斬！';
    feedbackEl.className = 'meiku-feedback is-correct';
    cardEl.classList.add('is-cleared');
    katanaEl.classList.remove('is-striking');
    void katanaEl.offsetWidth;
    katanaEl.classList.add('is-striking');
    window.setTimeout(nextQuestion, delay);
  };

  const resolveQuestion = (correct, message) => {
    finishQuestion({
      correct,
      message,
      cardState: correct ? 'is-cleared' : 'is-wrong',
      delay: correct ? 1050 : 1500,
    });
  };

  const missQuestion = () => {
    finishQuestion({ correct: false, message: '時間切れ', cardState: 'is-missed', delay: 1500 });
  };

  const renderQuestion = () => {
    clearQuestionTimers();
    currentQuestion = questions[questionIndex];
    currentChoices = shuffle(currentQuestion.choices);
    locked = false;
    katanaEl.classList.remove('is-striking');
    const duration = level === 'easy' ? 11000 : 16000;
    const deadline = Date.now() + duration;
    const updateRemaining = () => {
      remainingEl.textContent = String(getMeikuRemainingSeconds(deadline));
    };
    updateRemaining();
    countdownId = window.setInterval(updateRemaining, 250);

    cardEl.className = 'meiku-card';
    cardEl.style.setProperty('--approach-duration', `${duration}ms`);
    cardEl.innerHTML = currentQuestion.parts.map((part, index) => (
      `<div class="meiku-line${index === currentQuestion.blank ? ' is-blank' : ''}">${
        index === currentQuestion.blank ? '□□□□□□□' : part
      }</div>`
    )).join('');
    cardEl.insertAdjacentHTML('beforeend', `<p class="meiku-author">${currentQuestion.author}</p>`);

    answersEl.innerHTML = '';
    inputEl.value = '';
    feedbackEl.textContent = level === 'easy'
      ? '選択肢をクリック、または数字キー 1〜4'
      : '欠けた部分を入力して Enter';
    feedbackEl.className = 'meiku-feedback';
    answersEl.classList.toggle('hidden', level !== 'easy');
    inputForm.classList.toggle('hidden', level !== 'hard');

    if (level === 'easy') {
      currentChoices.forEach((choice, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'meiku-choice';
        button.textContent = `${index + 1}　${choice}`;
        button.addEventListener('click', () => {
          resolveQuestion(isMeikuCorrect(currentQuestion, choice), '違います');
        });
        answersEl.appendChild(button);
      });
    } else {
      window.setTimeout(() => inputEl.focus(), 50);
    }

    updateStatus();
    void cardEl.offsetWidth;
    cardEl.classList.add('is-approaching');
    timeoutId = window.setTimeout(missQuestion, duration);
  };

  const start = () => {
    clearQuestionTimers();
    level = document.querySelector('input[name="meiku-level"]:checked')?.value ?? 'easy';
    questions = shuffle(MEIKU_QUESTIONS).slice(0, MEIKU_ROUND_SIZE);
    questionIndex = 0;
    score = 0;
    streak = 0;
    correctCount = 0;
    active = true;
    introEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    gameEl.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'auto' });
    gameEl.focus({ preventScroll: true });
    renderQuestion();
  };

  startBtn.addEventListener('click', start);
  retryBtn.addEventListener('click', start);
  exitBtn.addEventListener('click', () => {
    clearQuestionTimers();
    active = false;
    resultEl.classList.add('hidden');
    onExit();
  });

  inputForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!locked) resolveQuestion(isMeikuCorrect(currentQuestion, inputEl.value), '違います');
    inputEl.select();
  });

  document.addEventListener('keydown', (event) => {
    if (!active || locked || level !== 'easy') return;
    const index = Number(event.key) - 1;
    if (index >= 0 && index < currentChoices.length) {
      const choice = currentChoices[index];
      resolveQuestion(isMeikuCorrect(currentQuestion, choice), '違います');
    }
  });
}

// ---- hard mode isolated bundle ----
const { showHardIntro, isHardPlaying, abandonHardGame, hardBestScore } = (() => {
// ---- src/hard-composer.js ----
function createComposer() {
  const lines = [[], [], []];

  function validLine(index) {
    return Number.isInteger(index) && index >= 0 && index < 3;
  }

  function addKeyword(lineIndex, keywordId) {
    if (!validLine(lineIndex)) return false;
    const alreadyUsed = lines.some((line) => line.some(
      (segment) => segment.type === 'keyword' && segment.keywordId === keywordId,
    ));
    if (alreadyUsed) return false;
    lines[lineIndex].push({ type: 'keyword', keywordId });
    return true;
  }

  function addFreeText(lineIndex, display, reading) {
    if (!validLine(lineIndex)) return false;
    lines[lineIndex].push({ type: 'free', display, reading });
    return true;
  }

  function moveSegment(lineIndex, from, to) {
    if (!validLine(lineIndex) || !lines[lineIndex][from] || to < 0 || to >= lines[lineIndex].length) return false;
    const [segment] = lines[lineIndex].splice(from, 1);
    lines[lineIndex].splice(to, 0, segment);
    return true;
  }

  function removeSegment(lineIndex, position) {
    if (!validLine(lineIndex) || !lines[lineIndex][position]) return false;
    lines[lineIndex].splice(position, 1);
    return true;
  }

  function snapshot() {
    return { lines: lines.map((line) => line.map((segment) => ({ ...segment }))) };
  }

  return { addKeyword, addFreeText, moveSegment, removeSegment, snapshot };
}

// ---- src/hard-mora.js ----
const SMALL_KANA = new Set([...`ゃゅょぁぃぅぇぉゎ`]);
const IGNORED = /[\s　、。,.!！?？「」『』・]/g;

function normalizeReading(value) {
  return String(value ?? '').trim().replace(IGNORED, '');
}

function validateReading(value) {
  const normalized = normalizeReading(value);
  return {
    valid: normalized.length > 0 && /^[ぁ-ゖー]+$/.test(normalized),
    normalized,
  };
}

function countMora(value) {
  const normalized = normalizeReading(value);
  let count = 0;
  for (const char of normalized) {
    if (!SMALL_KANA.has(char)) count += 1;
  }
  return count;
}

function compositionLineReading(segments, keywordMap) {
  return segments.map((segment) => (
    segment.type === 'keyword'
      ? keywordMap.get(segment.keywordId)?.reading ?? ''
      : segment.reading ?? ''
  )).join('');
}

function compositionLineDisplay(segments, keywordMap) {
  return segments.map((segment) => (
    segment.type === 'keyword'
      ? keywordMap.get(segment.keywordId)?.display ?? ''
      : segment.display ?? ''
  )).join('');
}

function validateComposition(composition, keywordMap) {
  const targets = [5, 7, 5];
  const errors = [];
  const usedKeywordIds = [];
  const lines = composition.lines.map((segments, index) => {
    const keywordSegments = segments.filter((segment) => segment.type === 'keyword');
    if (keywordSegments.length === 0) errors.push(`line_${index}_keyword_required`);
    usedKeywordIds.push(...keywordSegments.map((segment) => segment.keywordId));

    for (const segment of segments.filter((item) => item.type === 'free')) {
      const displayPresent = String(segment.display ?? '').trim().length > 0;
      const reading = validateReading(segment.reading);
      if (!displayPresent || !reading.valid) errors.push(`line_${index}_free_text_invalid`);
    }

    const reading = compositionLineReading(segments, keywordMap);
    const mora = countMora(reading);
    const delta = mora - targets[index];
    if (delta < -2 || delta > 2) errors.push(`line_${index}_out_of_range`);
    return { reading, mora, target: targets[index], delta };
  });

  if (new Set(usedKeywordIds).size !== usedKeywordIds.length) errors.push('keyword_reused');
  return { valid: errors.length === 0, errors: [...new Set(errors)], lines };
}

// ---- src/hard-plagiarism.js ----
function buildKeywordMap(sources) {
  return new Map(sources.flatMap((source) => source.keywords).map((keyword) => [keyword.id, keyword]));
}

function levenshtein(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[b.length];
}

function similarity(a, b) {
  if (!a.length && !b.length) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);
}

function scoreAgainstSource(composition, source, keywordMap) {
  const sourceKeywordMap = new Map(source.keywords.map((keyword) => [keyword.id, keyword]));
  const totalWeight = source.keywords.reduce((sum, keyword) => sum + keyword.weight, 0);
  const selected = [];
  composition.lines.forEach((segments, lineIndex) => {
    segments.forEach((segment) => {
      const keyword = segment.type === 'keyword' ? sourceKeywordMap.get(segment.keywordId) : null;
      if (keyword) selected.push({ ...keyword, lineIndex });
    });
  });
  const matchedWeight = selected.reduce((sum, keyword) => sum + keyword.weight, 0);
  const keywordScore = Math.round(50 * matchedWeight / totalWeight);

  let orderedWeight = 0;
  let lastOrder = -1;
  for (const keyword of selected) {
    if (keyword.sourceOrder > lastOrder && keyword.sourceLine === keyword.lineIndex) {
      orderedWeight += keyword.weight;
      lastOrder = keyword.sourceOrder;
    }
  }
  const orderScore = Math.round(20 * orderedWeight / totalWeight);
  const composedReading = composition.lines
    .map((segments) => compositionLineReading(segments, keywordMap))
    .join('');
  const sourceReading = source.lines.map((line) => line.reading).join('');
  const readingScore = Math.round(30 * similarity(
    normalizeReading(composedReading),
    normalizeReading(sourceReading),
  ));
  return {
    rate: Math.max(0, Math.min(100, keywordScore + orderScore + readingScore)),
    keywordScore,
    orderScore,
    readingScore,
  };
}

function scorePlagiarism(composition, sources, keywordMap = buildKeywordMap(sources)) {
  const scored = sources.map((source) => ({
    ...scoreAgainstSource(composition, source, keywordMap),
    closestSourceId: source.id,
  })).sort((a, b) => b.rate - a.rate || a.closestSourceId.localeCompare(b.closestSourceId));
  const best = scored[0];
  return { ...best, originalityPoints: 100 - best.rate };
}

// ---- src/hard-critic.js ----
function generateCritique(result, source = null, compositionMeta = {}) {
  if (result.rate === 100) {
    return {
      level: 'copied',
      title: '一致率100%。それはあなたの句ではありません。',
      comment: source
        ? `「${source.display}」――${source.author}。名句を正確に復元した技術だけは認めます。`
        : '登録名句と完全に一致しました。',
    };
  }
  if (result.rate >= 80) {
    return {
      level: 'angry',
      title: '名句の影が濃すぎます。',
      comment: `盗作率${result.rate}%です。語を借りたというより、元句の骨格まで持ち出しています。`,
    };
  }
  if (result.rate >= 30) {
    return {
      level: 'influenced',
      title: '独立作品とはまだ呼べません。',
      comment: `盗作率${result.rate}%です。借り物同士の関係を、もう一段壊してください。`,
    };
  }
  const irregular = compositionMeta.irregularLines ?? 0;
  return {
    level: 'original',
    title: '独立作品と認定します。',
    comment: irregular > 0
      ? `盗作率${result.rate}%です。定型を外した${irregular}行が、借り物にあなたの呼吸を与えました。`
      : `盗作率${result.rate}%です。借り物だけで、元句とは別の景色を作りました。`,
  };
}

// ---- src/hard-rounds.js ----
function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffle(items, rng) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createRounds(sources, seed = Date.now()) {
  if (sources.length !== 12) throw new Error('source_count_must_be_12');
  const rng = makeRng(seed);
  const shuffledSources = shuffle(sources, rng);
  return [0, 1, 2].map((roundIndex) => {
    const group = shuffledSources.slice(roundIndex * 4, roundIndex * 4 + 4);
    return {
      index: roundIndex,
      sourceIds: group.map((source) => source.id),
      keywordIds: shuffle(group.flatMap((source) => source.keywords.map((keyword) => keyword.id)), rng),
    };
  });
}

// ---- src/hard-best.js ----
const BEST_KEY = 'haiku-anthology:plagiarism-best';

function createHardBestStore(backend = globalThis.localStorage) {
  function get() {
    try {
      const stored = backend?.getItem(BEST_KEY);
      if (stored === null || stored === undefined || stored === '') return null;
      const value = Number(stored);
      return Number.isFinite(value) && value >= 0 && value <= 300 ? value : null;
    } catch {
      return null;
    }
  }

  function record(score) {
    const current = get();
    const best = current === null ? score : Math.max(current, score);
    const isNewBest = current === null || score > current;
    try {
      backend?.setItem(BEST_KEY, String(best));
      return { best, isNewBest, persisted: true };
    } catch {
      return { best, isNewBest, persisted: false };
    }
  }

  return { get, record };
}

// ---- src/hard-feedback.js ----
// オフライン版では各モジュールを一つへ結合するため、固有名で衝突を避ける。
const HARD_GUIDANCE_LINE_NAMES = ['上五', '中七', '下五'];

function validateHardFreeText(display, reading) {
  if (!String(display ?? '').trim() || !String(reading ?? '').trim()) {
    return {
      valid: false,
      message: '表示する言葉と、ひらがなの読みを入力してください。',
    };
  }
  if (!validateReading(reading).valid) {
    return {
      valid: false,
      message: '読みは、ひらがなと長音「ー」だけで入力してください。',
    };
  }
  return { valid: true, message: '' };
}

function hardValidationGuidance(validation) {
  if (validation.valid) return '一句が整いました。批評家botへ提出できます。';

  const errors = validation.errors ?? [];
  const keywordError = errors.find((error) => /^line_[0-2]_keyword_required$/.test(error));
  if (keywordError) {
    const lineIndex = Number(keywordError.split('_')[1]);
    return `${HARD_GUIDANCE_LINE_NAMES[lineIndex]}に、名句から借りた札を1枚以上追加してください。`;
  }

  const rangeError = errors.find((error) => /^line_[0-2]_out_of_range$/.test(error));
  if (rangeError) {
    const lineIndex = Number(rangeError.split('_')[1]);
    return `${HARD_GUIDANCE_LINE_NAMES[lineIndex]}の音数を、目標の±2音以内に調整してください。`;
  }

  if (errors.includes('keyword_reused')) {
    return '同じ札は一句の中で一度だけ使えます。';
  }
  return '赤い枠の入力内容を確認してください。';
}

// ---- src/hard-mode.js ----
const sourceHaiku = [{"id":"basho-old-pond","author":"松尾芭蕉","display":"古池や　蛙飛びこむ　水の音","lines":[{"display":"古池や","reading":"ふるいけや"},{"display":"蛙飛びこむ","reading":"かわずとびこむ"},{"display":"水の音","reading":"みずのおと"}],"sourceTitle":"松尾芭蕉『古池の句の弁』（青空文庫）","sourceUrl":"https://www.aozora.gr.jp/cards/000305/files/57363_59643.html","keywords":[{"id":"basho-old-pond-old-pond","display":"古池","reading":"ふるいけ","weight":1,"sourceLine":0,"sourceOrder":0,"tags":["place","classic"]},{"id":"basho-old-pond-frog","display":"蛙","reading":"かわず","weight":1,"sourceLine":1,"sourceOrder":1,"tags":["spring","animal"]},{"id":"basho-old-pond-water-sound","display":"水の音","reading":"みずのおと","weight":1,"sourceLine":2,"sourceOrder":2,"tags":["sound","water"]}]},{"id":"basho-summer-grass","author":"松尾芭蕉","display":"夏草や　兵どもが　夢の跡","lines":[{"display":"夏草や","reading":"なつくさや"},{"display":"兵どもが","reading":"つわものどもが"},{"display":"夢の跡","reading":"ゆめのあと"}],"sourceTitle":"NDLサーチ『夏草や 兵どもが 夢の跡［拓本］』","sourceUrl":"https://ndlsearch.ndl.go.jp/books/R100000001-I47111100819303","keywords":[{"id":"basho-summer-grass-grass","display":"夏草","reading":"なつくさ","weight":1,"sourceLine":0,"sourceOrder":0,"tags":["summer","plant"]},{"id":"basho-summer-grass-warriors","display":"兵ども","reading":"つわものども","weight":1,"sourceLine":1,"sourceOrder":1,"tags":["people","war"]},{"id":"basho-summer-grass-dream","display":"夢の跡","reading":"ゆめのあと","weight":1,"sourceLine":2,"sourceOrder":2,"tags":["dream","ruin"]}]},{"id":"basho-silence","author":"松尾芭蕉","display":"閑さや　岩にしみ入る　蝉の声","lines":[{"display":"閑さや","reading":"しずけさや"},{"display":"岩にしみ入る","reading":"いわにしみいる"},{"display":"蝉の声","reading":"せみのこえ"}],"sourceTitle":"レファレンス協同データベース（宮城県図書館）","sourceUrl":"https://crd.ndl.go.jp/reference/detail?page=ref_view&id=1000310770","keywords":[{"id":"basho-silence-stillness","display":"閑さ","reading":"しずけさ","weight":1,"sourceLine":0,"sourceOrder":0,"tags":["quiet"]},{"id":"basho-silence-rock","display":"岩","reading":"いわ","weight":1,"sourceLine":1,"sourceOrder":1,"tags":["stone"]},{"id":"basho-silence-cicada","display":"蝉の声","reading":"せみのこえ","weight":1,"sourceLine":2,"sourceOrder":2,"tags":["summer","sound"]}]},{"id":"buson-rapeseed","author":"与謝蕪村","display":"菜の花や　月は東に　日は西に","lines":[{"display":"菜の花や","reading":"なのはなや"},{"display":"月は東に","reading":"つきはひがしに"},{"display":"日は西に","reading":"ひはにしに"}],"sourceTitle":"NDLサーチ『中国古典詩における「菜の花」について』","sourceUrl":"https://ndlsearch.ndl.go.jp/books/R000000004-I9461805","keywords":[{"id":"buson-rapeseed-flower","display":"菜の花","reading":"なのはな","weight":1,"sourceLine":0,"sourceOrder":0,"tags":["spring","plant"]},{"id":"buson-rapeseed-moon","display":"月","reading":"つき","weight":1,"sourceLine":1,"sourceOrder":1,"tags":["sky"]},{"id":"buson-rapeseed-sun","display":"日","reading":"ひ","weight":1,"sourceLine":2,"sourceOrder":2,"tags":["sky"]}]},{"id":"buson-spring-sea","author":"与謝蕪村","display":"春の海　ひねもすのたり　のたりかな","lines":[{"display":"春の海","reading":"はるのうみ"},{"display":"ひねもすのたり","reading":"ひねもすのたり"},{"display":"のたりかな","reading":"のたりかな"}],"sourceTitle":"レファレンス協同データベース（安城市図書情報館）","sourceUrl":"https://crd.ndl.go.jp/reference/detail?page=ref_view&id=1000162094","keywords":[{"id":"buson-spring-sea-sea","display":"春の海","reading":"はるのうみ","weight":1,"sourceLine":0,"sourceOrder":0,"tags":["spring","water"]},{"id":"buson-spring-sea-all-day","display":"ひねもす","reading":"ひねもす","weight":1,"sourceLine":1,"sourceOrder":1,"tags":["time"]},{"id":"buson-spring-sea-notari","display":"のたりかな","reading":"のたりかな","weight":1,"sourceLine":2,"sourceOrder":2,"tags":["motion"]}]},{"id":"buson-moon-zenith","author":"与謝蕪村","display":"月天心　貧しき町を　通りけり","lines":[{"display":"月天心","reading":"つきてんしん"},{"display":"貧しき町を","reading":"まずしきまちを"},{"display":"通りけり","reading":"とおりけり"}],"sourceTitle":"nippon.com『月天心 貧しき町を通りけり』","sourceUrl":"https://www.nippon.com/ja/japan-topics/b09645/","keywords":[{"id":"buson-moon-zenith-moon","display":"月","reading":"つき","weight":1,"sourceLine":0,"sourceOrder":0,"tags":["autumn","sky"]},{"id":"buson-moon-zenith-town","display":"貧しき町","reading":"まずしきまち","weight":1,"sourceLine":1,"sourceOrder":1,"tags":["place","people"]},{"id":"buson-moon-zenith-pass","display":"通りけり","reading":"とおりけり","weight":1,"sourceLine":2,"sourceOrder":2,"tags":["motion"]}]},{"id":"issa-sparrow","author":"小林一茶","display":"雀の子　そこのけそこのけ　御馬が通る","lines":[{"display":"雀の子","reading":"すずめのこ"},{"display":"そこのけそこのけ","reading":"そこのけそこのけ"},{"display":"御馬が通る","reading":"おうまがとおる"}],"sourceTitle":"レファレンス協同データベース（山梨県立図書館）","sourceUrl":"https://crd.ndl.go.jp/reference/detail?page=ref_view&id=1000001317","keywords":[{"id":"issa-sparrow-child","display":"雀の子","reading":"すずめのこ","weight":1,"sourceLine":0,"sourceOrder":0,"tags":["spring","animal"]},{"id":"issa-sparrow-move","display":"そこのけ","reading":"そこのけ","weight":1,"sourceLine":1,"sourceOrder":1,"tags":["speech"]},{"id":"issa-sparrow-horse","display":"御馬","reading":"おうま","weight":1,"sourceLine":2,"sourceOrder":2,"tags":["animal"]}]},{"id":"issa-thin-frog","author":"小林一茶","display":"やせ蛙　まけるな一茶　これにあり","lines":[{"display":"やせ蛙","reading":"やせがえる"},{"display":"まけるな一茶","reading":"まけるないっさ"},{"display":"これにあり","reading":"これにあり"}],"sourceTitle":"政府広報『小林一茶：弱い者に寄り添う俳人』","sourceUrl":"https://www.gov-online.go.jp/eng/publicity/book/hlj/html/202206/202206_12_jp.html","keywords":[{"id":"issa-thin-frog-frog","display":"やせ蛙","reading":"やせがえる","weight":1,"sourceLine":0,"sourceOrder":0,"tags":["spring","animal"]},{"id":"issa-thin-frog-dont-lose","display":"負けるな","reading":"まけるな","weight":1,"sourceLine":1,"sourceOrder":1,"tags":["speech"]},{"id":"issa-thin-frog-here","display":"これにあり","reading":"これにあり","weight":1,"sourceLine":2,"sourceOrder":2,"tags":["place"]}]},{"id":"issa-dew-world","author":"小林一茶","display":"露の世は　露の世ながら　さりながら","lines":[{"display":"露の世は","reading":"つゆのよは"},{"display":"露の世ながら","reading":"つゆのよながら"},{"display":"さりながら","reading":"さりながら"}],"sourceTitle":"『名言名句の辞典』「露の世は…」（JLogos）","sourceUrl":"https://www.jlogos.com/d006/5450149.html","keywords":[{"id":"issa-dew-world-dew","display":"露","reading":"つゆ","weight":1,"sourceLine":0,"sourceOrder":0,"tags":["autumn","water"]},{"id":"issa-dew-world-world","display":"露の世","reading":"つゆのよ","weight":1,"sourceLine":1,"sourceOrder":1,"tags":["life"]},{"id":"issa-dew-world-nevertheless","display":"さりながら","reading":"さりながら","weight":1,"sourceLine":2,"sourceOrder":2,"tags":["speech"]}]},{"id":"shiki-persimmon","author":"正岡子規","display":"柿食へば　鐘が鳴るなり　法隆寺","lines":[{"display":"柿食へば","reading":"かきくえば"},{"display":"鐘が鳴るなり","reading":"かねがなるなり"},{"display":"法隆寺","reading":"ほうりゅうじ"}],"sourceTitle":"奈良市『NARA Fragment』","sourceUrl":"https://www.city.nara.lg.jp/uploaded/attachment/208593.pdf","keywords":[{"id":"shiki-persimmon-fruit","display":"柿","reading":"かき","weight":1,"sourceLine":0,"sourceOrder":0,"tags":["autumn","food"]},{"id":"shiki-persimmon-bell","display":"鐘","reading":"かね","weight":1,"sourceLine":1,"sourceOrder":1,"tags":["sound"]},{"id":"shiki-persimmon-temple","display":"法隆寺","reading":"ほうりゅうじ","weight":1,"sourceLine":2,"sourceOrder":2,"tags":["place"]}]},{"id":"shiki-snow-depth","author":"正岡子規","display":"いくたびも　雪の深さを　尋ねけり","lines":[{"display":"いくたびも","reading":"いくたびも"},{"display":"雪の深さを","reading":"ゆきのふかさを"},{"display":"尋ねけり","reading":"たずねけり"}],"sourceTitle":"文部科学省「編修趣意書」（令和8年度版）","sourceUrl":"https://www.mext.go.jp/content/20250528-app_dev04-000042815_41.pdf","keywords":[{"id":"shiki-snow-depth-many-times","display":"いくたびも","reading":"いくたびも","weight":1,"sourceLine":0,"sourceOrder":0,"tags":["time"]},{"id":"shiki-snow-depth-snow","display":"雪の深さ","reading":"ゆきのふかさ","weight":1,"sourceLine":1,"sourceOrder":1,"tags":["winter"]},{"id":"shiki-snow-depth-ask","display":"尋ねけり","reading":"たずねけり","weight":1,"sourceLine":2,"sourceOrder":2,"tags":["motion"]}]},{"id":"shiki-summer-storm","author":"正岡子規","display":"夏嵐　机上の白紙　飛び尽す","lines":[{"display":"夏嵐","reading":"なつあらし"},{"display":"机上の白紙","reading":"きじょうのはくし"},{"display":"飛び尽す","reading":"とびつくす"}],"sourceTitle":"糸島市図書館『YA本研究会だより VOL.4』","sourceUrl":"https://www.city.itoshima.lg.jp/s032/020/040/020/H30_YAdayori4.pdf","keywords":[{"id":"shiki-summer-storm-storm","display":"夏嵐","reading":"なつあらし","weight":1,"sourceLine":0,"sourceOrder":0,"tags":["summer","weather"]},{"id":"shiki-summer-storm-paper","display":"白紙","reading":"はくし","weight":1,"sourceLine":1,"sourceOrder":1,"tags":["object"]},{"id":"shiki-summer-storm-fly","display":"飛び尽す","reading":"とびつくす","weight":1,"sourceLine":2,"sourceOrder":2,"tags":["motion"]}]}];
const sourceMap = new Map(sourceHaiku.map((source) => [source.id, source]));
const keywordMap = buildKeywordMap(sourceHaiku);

const els = {
  intro: document.getElementById('hard-intro'),
  start: document.getElementById('hard-start-button'),
  composerScreen: document.getElementById('hard-composer-screen'),
  roundTitle: document.getElementById('hard-round-title'),
  progress: document.getElementById('hard-round-progress'),
  editors: document.getElementById('hard-line-editors'),
  preview: document.getElementById('hard-poem-preview'),
  validation: document.getElementById('hard-validation-message'),
  submit: document.getElementById('hard-submit-button'),
  roundResult: document.getElementById('hard-round-result'),
  finalResult: document.getElementById('hard-final-result'),
};

const LINE_NAMES = ['上五', '中七', '下五'];
const TARGETS = [5, 7, 5];
let rounds = [];
let roundIndex = 0;
let composer = null;
let sessionResults = [];
let formMessage = '';
let playing = false;
const bestStore = createHardBestStore();

function showOnly(target) {
  for (const element of [els.intro, els.composerScreen, els.roundResult, els.finalResult]) {
    element.classList.toggle('hidden', element !== target);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function currentRound() {
  return rounds[roundIndex];
}

function usedKeywordIds(composition) {
  return new Set(composition.lines.flatMap((line) => line
    .filter((segment) => segment.type === 'keyword')
    .map((segment) => segment.keywordId)));
}

function makeButton(text, label, onClick, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.setAttribute('aria-label', label);
  button.className = className;
  button.addEventListener('click', onClick);
  return button;
}

function formatDelta(delta) {
  if (delta === 0) return '定型';
  return delta > 0 ? `字余り＋${delta}` : `字足らず${delta}`;
}

function renderProgress() {
  els.progress.innerHTML = '';
  for (let index = 0; index < 3; index += 1) {
    const dot = document.createElement('span');
    dot.className = `hard-progress-dot${index === roundIndex ? ' is-current' : ''}${index < roundIndex ? ' is-done' : ''}`;
    dot.setAttribute('aria-label', `第${index + 1}句${index < roundIndex ? '完了' : index === roundIndex ? '作句中' : '未作成'}`);
    els.progress.appendChild(dot);
  }
}

function renderSegments(lineIndex, segments) {
  const list = document.createElement('div');
  list.className = 'hard-segment-list';
  list.setAttribute('aria-label', `${LINE_NAMES[lineIndex]}の構成`);
  if (segments.length === 0) {
    const empty = document.createElement('span');
    empty.textContent = '札と自由語をここへ接続';
    empty.className = 'hard-fine-print';
    list.appendChild(empty);
    return list;
  }

  segments.forEach((segment, position) => {
    const item = document.createElement('span');
    item.className = `hard-segment${segment.type === 'free' ? ' is-free' : ''}`;
    const text = document.createElement('b');
    text.textContent = segment.type === 'keyword'
      ? keywordMap.get(segment.keywordId).display
      : segment.display;
    item.appendChild(text);
    if (position > 0) item.appendChild(makeButton('←', `${text.textContent}を左へ`, () => {
      composer.moveSegment(lineIndex, position, position - 1);
      renderComposer();
    }));
    if (position < segments.length - 1) item.appendChild(makeButton('→', `${text.textContent}を右へ`, () => {
      composer.moveSegment(lineIndex, position, position + 1);
      renderComposer();
    }));
    item.appendChild(makeButton('×', `${text.textContent}を削除`, () => {
      composer.removeSegment(lineIndex, position);
      renderComposer();
    }));
    list.appendChild(item);
  });
  return list;
}

function renderKeywordTray(lineIndex, used) {
  const tray = document.createElement('div');
  tray.className = 'hard-keyword-tray';
  tray.setAttribute('aria-label', `${LINE_NAMES[lineIndex]}へ追加できるキーワード札`);
  currentRound().keywordIds.forEach((keywordId) => {
    const keyword = keywordMap.get(keywordId);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hard-keyword-card';
    const isUsed = used.has(keywordId);
    button.disabled = isUsed;
    const label = document.createElement('span');
    label.textContent = keyword.display;
    const mora = document.createElement('small');
    mora.textContent = isUsed ? `・${countMora(keyword.reading)}音・使用済` : `・${countMora(keyword.reading)}音`;
    button.append(label, mora);
    button.addEventListener('click', () => {
      composer.addKeyword(lineIndex, keywordId);
      formMessage = '';
      renderComposer();
    });
    tray.appendChild(button);
  });
  return tray;
}

function renderFreeForm(lineIndex) {
  const form = document.createElement('form');
  form.className = 'hard-free-form';
  const displayField = document.createElement('label');
  displayField.className = 'hard-field';
  const displayLabel = document.createElement('span');
  displayLabel.textContent = '自由語（表示）';
  const display = document.createElement('input');
  display.placeholder = '例：飛び込む';
  display.setAttribute('aria-label', `${LINE_NAMES[lineIndex]}へ追加する自由語`);
  displayField.append(displayLabel, display);
  const readingField = document.createElement('label');
  readingField.className = 'hard-field';
  const readingLabel = document.createElement('span');
  readingLabel.textContent = '読み（ひらがな）';
  const reading = document.createElement('input');
  reading.placeholder = '例：とびこむ';
  reading.setAttribute('aria-label', `${LINE_NAMES[lineIndex]}へ追加する自由語の読み`);
  readingField.append(readingLabel, reading);
  const add = document.createElement('button');
  add.type = 'submit';
  add.textContent = '自由語を接続';
  add.className = 'hard-secondary-action';
  const error = document.createElement('p');
  error.className = 'hard-field-error';
  error.setAttribute('aria-live', 'polite');
  form.append(displayField, readingField, add, error);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = validateHardFreeText(display.value, reading.value);
    if (!result.valid) {
      error.textContent = result.message;
      display.classList.toggle('is-invalid', !display.value.trim());
      reading.classList.toggle('is-invalid', !validateReading(reading.value).valid);
      display.setAttribute('aria-invalid', String(!display.value.trim()));
      reading.setAttribute('aria-invalid', String(!validateReading(reading.value).valid));
      return;
    }
    composer.addFreeText(lineIndex, display.value.trim(), reading.value.trim());
    formMessage = '';
    renderComposer();
  });
  return form;
}

function renderComposer() {
  const composition = composer.snapshot();
  const validation = validateComposition(composition, keywordMap);
  const used = usedKeywordIds(composition);
  els.roundTitle.textContent = `第${roundIndex + 1}句`;
  renderProgress();
  els.editors.innerHTML = '';

  composition.lines.forEach((segments, lineIndex) => {
    const lineResult = validation.lines[lineIndex];
    const section = document.createElement('section');
    section.className = 'hard-line-editor';
    const heading = document.createElement('div');
    heading.className = 'hard-line-heading';
    const title = document.createElement('h3');
    title.textContent = LINE_NAMES[lineIndex];
    const count = document.createElement('span');
    count.className = `hard-mora-count${lineResult.delta < -2 || lineResult.delta > 2 ? ' is-invalid' : ''}`;
    count.textContent = `${lineResult.mora} / ${TARGETS[lineIndex]}音　${formatDelta(lineResult.delta)}`;
    heading.append(title, count);
    section.append(
      heading,
      renderSegments(lineIndex, segments),
      renderKeywordTray(lineIndex, used),
      renderFreeForm(lineIndex),
    );
    els.editors.appendChild(section);
  });

  els.preview.innerHTML = '';
  composition.lines.forEach((segments) => {
    const line = document.createElement('p');
    const display = compositionLineDisplay(segments, keywordMap);
    line.className = `hard-poem-line${display ? '' : ' is-empty'}`;
    line.textContent = display || '□□□□□';
    els.preview.appendChild(line);
  });
  els.submit.disabled = !validation.valid;
  els.validation.textContent = formMessage || hardValidationGuidance(validation);
  els.validation.classList.toggle('is-ready', validation.valid && !formMessage);
}

function makePoemText(composition) {
  return composition.lines.map((segments) => compositionLineDisplay(segments, keywordMap));
}

function appendText(parent, tag, text, className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  parent.appendChild(node);
  return node;
}

function renderRoundResult(entry) {
  const { result, critique, source, poem, validation } = entry;
  els.roundResult.innerHTML = '';
  appendText(els.roundResult, 'p', `第${roundIndex + 1}句　鑑定結果`, 'hard-eyebrow');
  appendText(els.roundResult, 'h2', poem.join('　'));
  const ring = document.createElement('div');
  ring.className = 'hard-score-ring';
  const ringInner = document.createElement('div');
  appendText(ringInner, 'strong', `${result.rate}%`);
  appendText(ringInner, 'span', `盗作率／${result.originalityPoints}点`);
  ring.appendChild(ringInner);
  els.roundResult.appendChild(ring);

  const breakdown = document.createElement('div');
  breakdown.className = 'hard-breakdown';
  for (const [label, value] of [
    ['語の一致', result.keywordScore],
    ['並び・位置', result.orderScore],
    ['読みの近さ', result.readingScore],
  ]) {
    const box = document.createElement('div');
    appendText(box, 'span', label);
    appendText(box, 'strong', `${value}点`);
    breakdown.appendChild(box);
  }
  els.roundResult.appendChild(breakdown);

  const critic = document.createElement('div');
  critic.className = 'hard-critique';
  appendText(critic, 'p', `批評家bot：${critique.title}`, 'hard-provocation');
  appendText(critic, 'p', critique.comment);
  els.roundResult.appendChild(critic);
  appendText(els.roundResult, 'p', `最も近い名句：${source.display}（${source.author}）`, 'hard-fine-print');
  const link = document.createElement('a');
  link.href = source.sourceUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'hard-source-link';
  link.textContent = `出典を確認：${source.sourceTitle}`;
  els.roundResult.appendChild(link);
  appendText(els.roundResult, 'p', `音数：${validation.lines.map((line) => `${line.mora}音`).join('・')}`, 'hard-fine-print');

  const next = makeButton(
    roundIndex < 2 ? '次の名句を解体する' : '三句の総評を見る',
    roundIndex < 2 ? '次の句へ進む' : '最終結果を見る',
    () => {
      if (roundIndex < 2) {
        roundIndex += 1;
        composer = createComposer();
        formMessage = '';
        showOnly(els.composerScreen);
        renderComposer();
      } else {
        renderFinalResult();
      }
    },
    'hard-primary-action',
  );
  els.roundResult.appendChild(next);
  showOnly(els.roundResult);
}

function submitCurrent() {
  const composition = composer.snapshot();
  const validation = validateComposition(composition, keywordMap);
  if (!validation.valid) return;
  const result = scorePlagiarism(composition, sourceHaiku, keywordMap);
  const source = sourceMap.get(result.closestSourceId);
  const critique = generateCritique(result, source, {
    irregularLines: validation.lines.filter((line) => line.delta !== 0).length,
  });
  const entry = { composition, validation, result, source, critique, poem: makePoemText(composition) };
  sessionResults.push(entry);
  renderRoundResult(entry);
}

function renderFinalResult() {
  els.finalResult.innerHTML = '';
  const total = sessionResults.reduce((sum, entry) => sum + entry.result.originalityPoints, 0);
  const bestResult = bestStore.record(total);
  appendText(els.finalResult, 'p', '三句総評', 'hard-eyebrow');
  appendText(els.finalResult, 'h2', `オリジナリティ合計　${total} / 300点`);
  appendText(els.finalResult, 'p', `自己ベスト　${bestResult.best} / 300点${bestResult.isNewBest ? '　新記録' : ''}`, 'hard-provocation');
  const list = document.createElement('ol');
  list.className = 'hard-result-list';
  sessionResults.forEach((entry) => {
    const item = document.createElement('li');
    appendText(item, 'p', entry.poem.join('　'));
    appendText(item, 'strong', `盗作率 ${entry.result.rate}% ／ ${entry.result.originalityPoints}点`);
    appendText(item, 'p', entry.critique.title, 'hard-fine-print');
    list.appendChild(item);
  });
  els.finalResult.appendChild(list);
  appendText(
    els.finalResult,
    'p',
    '材料はすべて借り物でした。それでも、何を選び、何をつないだかは三句とも違いました。',
    'hard-critique',
  );
  els.finalResult.appendChild(makeButton('もう一度、盗む', '新しい3句を始める', startGame, 'hard-primary-action'));
  playing = false;
  showOnly(els.finalResult);
}

function startGame() {
  rounds = createRounds(sourceHaiku, Date.now());
  roundIndex = 0;
  composer = createComposer();
  sessionResults = [];
  formMessage = '';
  playing = true;
  showOnly(els.composerScreen);
  renderComposer();
}

els.start.addEventListener('click', startGame);
els.submit.addEventListener('click', submitCurrent);

function showHardIntro() {
  playing = false;
  showOnly(els.intro);
}

function isHardPlaying() {
  return playing;
}

function abandonHardGame() {
  playing = false;
  rounds = [];
  sessionResults = [];
  showHardIntro();
}

function hardBestScore() {
  return bestStore.get();
}
return { showHardIntro, isHardPlaying, abandonHardGame, hardBestScore };
})();

// ---- src/main.js ----
const els = {
  app: document.getElementById('app'),
  mainTitle: document.getElementById('main-title'),
  shishi: document.getElementById('shishi-odoshi'),
  katana: document.getElementById('katana-illustration'),
  shishiWaterThread: document.getElementById('shishi-water-thread'),
  shishiWaterGlint: document.getElementById('shishi-water-glint'),
  timer: document.getElementById('timer'),
  timerBox: document.getElementById('timer-box'),
  hand: document.getElementById('hand'),
  slots: [...document.querySelectorAll('.slot')],
  submit: document.getElementById('submit'),
  placementMessage: document.getElementById('copy-placement-message'),
  intro: document.getElementById('intro'),
  start: document.getElementById('start'),
  compose: document.getElementById('compose'),
  timeup: document.getElementById('timeup'),
  showResults: document.getElementById('show-results'),
  results: document.getElementById('results'),
  modeSelect: document.getElementById('mode-select'),
  chooseCopy: document.getElementById('choose-copy'),
  copyModeSelect: document.getElementById('copy-mode-select'),
  chooseCopyNormal: document.getElementById('choose-copy-normal'),
  chooseCopyHard: document.getElementById('choose-copy-hard'),
  backFromCopySelect: document.getElementById('back-from-copy-select'),
  hardBestSummary: document.getElementById('hard-best-summary'),
  hardShell: document.getElementById('hard-mode-shell'),
  backFromHard: document.getElementById('back-from-hard'),
  chooseMeiku: document.getElementById('choose-meiku'),
  backFromCopy: document.getElementById('back-from-copy'),
  backFromCopyGame: document.getElementById('back-from-copy-game'),
  backFromCopyTimeup: document.getElementById('back-from-copy-timeup'),
  meikuIntro: document.getElementById('meiku-intro'),
  meikuGame: document.getElementById('meiku-game'),
  meikuResult: document.getElementById('meiku-result'),
  startMeiku: document.getElementById('start-meiku'),
  backFromMeiku: document.getElementById('back-from-meiku'),
};

const GAME_SECONDS = 90;
const SHISHI_START_ANGLE = 42;
const SHISHI_DUMP_ANGLE = 0;
let finishedSubmissions = [];
let audioContext = null;
let normalPlaying = false;
let selectedCard = null;
let activeCardElements = new Map();
let placeNormalCard = null;

// 水は常に垂直。竹の角度から「固定水線と斜め切断面が交わる高さ」だけを変える。
function updateShishiWaterPath(angle) {
  const pivot = { x: 155, y: 132 };
  const mouth = { x: 67, y: 132 };
  const waterX = 85;
  const waterStartY = 48;
  const radians = angle * Math.PI / 180;
  const dx = mouth.x - pivot.x;
  const dy = mouth.y - pivot.y;
  const mouthX = pivot.x + dx * Math.cos(radians) - dy * Math.sin(radians);
  const mouthY = pivot.y + dx * Math.sin(radians) + dy * Math.cos(radians);
  const cutAngle = (angle - SHISHI_START_ANGLE) * Math.PI / 180;
  const cutSurfaceY = mouthY + Math.tan(cutAngle) * (waterX - mouthX);
  const waterEndY = Math.max(waterStartY + 4, cutSurfaceY - 3);
  const path = `M${waterX} ${waterStartY} L${waterX} ${waterEndY.toFixed(1)}`;
  els.shishiWaterThread.setAttribute('d', path);
  els.shishiWaterGlint.setAttribute('d', path);
}

function prepareShishiSound() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  audioContext ??= new AudioContext();
  audioContext.resume();
}

// 外部音声ファイルを使わず、短い三角波を重ねて竹が石を打つ「コン」を作る。
function playShishiKnock() {
  if (!audioContext) return;
  const at = audioContext.currentTime;
  const master = audioContext.createGain();
  master.gain.setValueAtTime(0.0001, at);
  master.gain.exponentialRampToValueAtTime(0.16, at + 0.006);
  master.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
  master.connect(audioContext.destination);

  for (const [frequency, volume] of [[196, 1], [392, 0.38]]) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.78, at + 0.16);
    gain.gain.value = volume;
    oscillator.connect(gain).connect(master);
    oscillator.start(at);
    oscillator.stop(at + 0.21);
  }
}

const deckJson = {"fives":[{"id":"5-001","text":"ふるいけや","mora":5,"kigo":true,"pos":"noun","tone":{"motion":-2,"brightness":1},"surreal":0,"cliche":true},{"id":"5-002","text":"なつのよる","mora":5,"kigo":true,"pos":"noun","tone":{"motion":-1,"brightness":-2},"surreal":0,"cliche":true},{"id":"5-003","text":"コンビニで","mora":5,"kigo":false,"pos":"noun","tone":{"motion":1,"brightness":2},"surreal":2,"cliche":false},{"id":"5-004","text":"むせびなく","mora":5,"kigo":false,"pos":"verb","tone":{"motion":2,"brightness":-2},"surreal":1,"cliche":false},{"id":"5-005","text":"しずかなり","mora":5,"kigo":false,"pos":"adj","tone":{"motion":-3,"brightness":0},"surreal":0,"cliche":true},{"id":"5-006","text":"うちゅうから","mora":5,"kigo":false,"pos":"noun","tone":{"motion":2,"brightness":1},"surreal":3,"cliche":false},{"id":"5-007","text":"さくらちる","mora":5,"kigo":true,"pos":"verb","tone":{"motion":1,"brightness":2},"surreal":0,"cliche":true},{"id":"5-008","text":"むじんくん","mora":5,"kigo":false,"pos":"noun","tone":{"motion":0,"brightness":0},"surreal":3,"cliche":false},{"id":"5-009","text":"ゆきどけて","mora":5,"kigo":true,"pos":"verb","tone":{"motion":1,"brightness":2},"surreal":0,"cliche":false},{"id":"5-010","text":"かぜひいて","mora":5,"kigo":true,"pos":"verb","tone":{"motion":0,"brightness":-1},"surreal":1,"cliche":false},{"id":"5-011","text":"つきあかり","mora":5,"kigo":true,"pos":"noun","tone":{"motion":-2,"brightness":0},"surreal":0,"cliche":true},{"id":"5-012","text":"バグをふむ","mora":5,"kigo":false,"pos":"verb","tone":{"motion":2,"brightness":0},"surreal":2,"cliche":false},{"id":"5-013","text":"はるのかぜ","mora":5,"kigo":true,"pos":"noun","tone":{"motion":1,"brightness":2},"surreal":0,"cliche":true},{"id":"5-014","text":"あたたかし","mora":5,"kigo":true,"pos":"adj","tone":{"motion":0,"brightness":2},"surreal":0,"cliche":true},{"id":"5-015","text":"なつのくも","mora":5,"kigo":true,"pos":"noun","tone":{"motion":0,"brightness":3},"surreal":0,"cliche":true},{"id":"5-016","text":"せみしぐれ","mora":5,"kigo":true,"pos":"noun","tone":{"motion":3,"brightness":2},"surreal":1,"cliche":true},{"id":"5-017","text":"あきのつき","mora":5,"kigo":true,"pos":"noun","tone":{"motion":-3,"brightness":1},"surreal":0,"cliche":true},{"id":"5-018","text":"こおろぎや","mora":5,"kigo":true,"pos":"other","tone":{"motion":-1,"brightness":-2},"surreal":0,"cliche":true},{"id":"5-019","text":"ふゆぎんが","mora":5,"kigo":true,"pos":"noun","tone":{"motion":-3,"brightness":2},"surreal":1,"cliche":false},{"id":"5-020","text":"ゆきがふる","mora":5,"kigo":true,"pos":"verb","tone":{"motion":1,"brightness":1},"surreal":0,"cliche":true},{"id":"5-021","text":"つゆのあさ","mora":5,"kigo":true,"pos":"noun","tone":{"motion":-2,"brightness":-1},"surreal":0,"cliche":false},{"id":"5-022","text":"かきごおり","mora":5,"kigo":true,"pos":"noun","tone":{"motion":0,"brightness":3},"surreal":0,"cliche":true},{"id":"5-023","text":"いわしぐも","mora":5,"kigo":true,"pos":"noun","tone":{"motion":-1,"brightness":2},"surreal":1,"cliche":true},{"id":"5-024","text":"こがらしや","mora":5,"kigo":true,"pos":"other","tone":{"motion":3,"brightness":-2},"surreal":0,"cliche":true},{"id":"5-025","text":"うめかおる","mora":5,"kigo":true,"pos":"verb","tone":{"motion":-1,"brightness":2},"surreal":0,"cliche":true},{"id":"5-026","text":"ほたるまう","mora":5,"kigo":true,"pos":"verb","tone":{"motion":2,"brightness":1},"surreal":1,"cliche":true},{"id":"5-027","text":"もみじちる","mora":5,"kigo":true,"pos":"verb","tone":{"motion":1,"brightness":2},"surreal":0,"cliche":true},{"id":"5-028","text":"こたつねこ","mora":5,"kigo":true,"pos":"noun","tone":{"motion":-3,"brightness":1},"surreal":1,"cliche":false},{"id":"5-029","text":"コンビニへ","mora":5,"kigo":false,"pos":"other","tone":{"motion":1,"brightness":1},"surreal":0,"cliche":false},{"id":"5-030","text":"スマホみる","mora":5,"kigo":false,"pos":"verb","tone":{"motion":-1,"brightness":0},"surreal":0,"cliche":false},{"id":"5-031","text":"でんしゃくる","mora":5,"kigo":false,"pos":"verb","tone":{"motion":2,"brightness":0},"surreal":0,"cliche":false},{"id":"5-032","text":"レジがなく","mora":5,"kigo":false,"pos":"adj","tone":{"motion":-1,"brightness":-1},"surreal":1,"cliche":false},{"id":"5-033","text":"バグがいる","mora":5,"kigo":false,"pos":"verb","tone":{"motion":1,"brightness":-1},"surreal":2,"cliche":false},{"id":"5-034","text":"エラーです","mora":5,"kigo":false,"pos":"other","tone":{"motion":0,"brightness":-2},"surreal":2,"cliche":true},{"id":"5-035","text":"デプロイだ","mora":5,"kigo":false,"pos":"other","tone":{"motion":3,"brightness":1},"surreal":2,"cliche":false},{"id":"5-036","text":"コードかく","mora":5,"kigo":false,"pos":"verb","tone":{"motion":1,"brightness":0},"surreal":0,"cliche":false},{"id":"5-037","text":"サーバーよ","mora":5,"kigo":false,"pos":"other","tone":{"motion":-2,"brightness":-1},"surreal":2,"cliche":false},{"id":"5-038","text":"ログがない","mora":5,"kigo":false,"pos":"adj","tone":{"motion":-2,"brightness":-3},"surreal":1,"cliche":true},{"id":"5-039","text":"わくせいへ","mora":5,"kigo":false,"pos":"other","tone":{"motion":2,"brightness":2},"surreal":3,"cliche":false},{"id":"5-040","text":"つきのうら","mora":5,"kigo":false,"pos":"noun","tone":{"motion":-3,"brightness":-2},"surreal":2,"cliche":false},{"id":"5-041","text":"ロボがなく","mora":5,"kigo":false,"pos":"verb","tone":{"motion":1,"brightness":-2},"surreal":3,"cliche":false},{"id":"5-042","text":"むじんえき","mora":5,"kigo":false,"pos":"noun","tone":{"motion":-3,"brightness":-2},"surreal":1,"cliche":false},{"id":"5-043","text":"ねこがとぶ","mora":5,"kigo":false,"pos":"verb","tone":{"motion":3,"brightness":2},"surreal":3,"cliche":false},{"id":"5-044","text":"くもがわれ","mora":5,"kigo":false,"pos":"verb","tone":{"motion":3,"brightness":3},"surreal":3,"cliche":false},{"id":"5-045","text":"いしのこえ","mora":5,"kigo":false,"pos":"noun","tone":{"motion":-2,"brightness":-1},"surreal":2,"cliche":false},{"id":"5-046","text":"とけいなし","mora":5,"kigo":false,"pos":"adj","tone":{"motion":-1,"brightness":0},"surreal":2,"cliche":false},{"id":"5-047","text":"しずかだな","mora":5,"kigo":false,"pos":"adj","tone":{"motion":-3,"brightness":0},"surreal":0,"cliche":true},{"id":"5-048","text":"まっくらだ","mora":5,"kigo":false,"pos":"adj","tone":{"motion":-2,"brightness":-3},"surreal":1,"cliche":false},{"id":"5-049","text":"あかるすぎ","mora":5,"kigo":false,"pos":"adj","tone":{"motion":1,"brightness":3},"surreal":1,"cliche":false},{"id":"5-050","text":"ひとりきり","mora":5,"kigo":false,"pos":"other","tone":{"motion":-3,"brightness":-2},"surreal":0,"cliche":true},{"id":"5-051","text":"なぜかいる","mora":5,"kigo":false,"pos":"verb","tone":{"motion":0,"brightness":-1},"surreal":2,"cliche":false},{"id":"5-052","text":"まだねむい","mora":5,"kigo":false,"pos":"adj","tone":{"motion":-3,"brightness":-1},"surreal":0,"cliche":false},{"id":"5-053","text":"はるのゆめ","mora":5,"kigo":true,"pos":"noun","tone":{"motion":-1,"brightness":1},"surreal":1,"cliche":false},{"id":"5-054","text":"かすみたつ","mora":5,"kigo":true,"pos":"verb","tone":{"motion":1,"brightness":1},"surreal":0,"cliche":true},{"id":"5-055","text":"ひばりなく","mora":5,"kigo":true,"pos":"verb","tone":{"motion":2,"brightness":2},"surreal":0,"cliche":true},{"id":"5-056","text":"つくしんぼ","mora":5,"kigo":true,"pos":"noun","tone":{"motion":0,"brightness":2},"surreal":1,"cliche":false},{"id":"5-057","text":"はなのあめ","mora":5,"kigo":true,"pos":"noun","tone":{"motion":-1,"brightness":0},"surreal":0,"cliche":true},{"id":"5-058","text":"たねをまく","mora":5,"kigo":true,"pos":"verb","tone":{"motion":2,"brightness":2},"surreal":0,"cliche":false},{"id":"5-059","text":"あおたかぜ","mora":5,"kigo":true,"pos":"noun","tone":{"motion":2,"brightness":3},"surreal":0,"cliche":false},{"id":"5-060","text":"ゆうだちや","mora":5,"kigo":true,"pos":"other","tone":{"motion":3,"brightness":-1},"surreal":1,"cliche":true},{"id":"5-061","text":"かぶとむし","mora":5,"kigo":true,"pos":"noun","tone":{"motion":1,"brightness":2},"surreal":0,"cliche":true},{"id":"5-062","text":"ひるねかな","mora":5,"kigo":true,"pos":"other","tone":{"motion":-3,"brightness":1},"surreal":0,"cliche":false},{"id":"5-063","text":"あさがおや","mora":5,"kigo":true,"pos":"other","tone":{"motion":-1,"brightness":3},"surreal":1,"cliche":true},{"id":"5-064","text":"かわどこへ","mora":5,"kigo":true,"pos":"other","tone":{"motion":1,"brightness":1},"surreal":0,"cliche":false},{"id":"5-065","text":"きりのむら","mora":5,"kigo":true,"pos":"noun","tone":{"motion":-3,"brightness":-1},"surreal":0,"cliche":false},{"id":"5-066","text":"しかのこえ","mora":5,"kigo":true,"pos":"noun","tone":{"motion":-1,"brightness":-2},"surreal":1,"cliche":false},{"id":"5-067","text":"くりひろう","mora":5,"kigo":true,"pos":"verb","tone":{"motion":1,"brightness":2},"surreal":0,"cliche":false},{"id":"5-068","text":"よながかな","mora":5,"kigo":true,"pos":"other","tone":{"motion":-3,"brightness":-2},"surreal":0,"cliche":false},{"id":"5-069","text":"いなほゆれ","mora":5,"kigo":true,"pos":"verb","tone":{"motion":2,"brightness":2},"surreal":0,"cliche":false},{"id":"5-070","text":"きくびより","mora":5,"kigo":true,"pos":"noun","tone":{"motion":-2,"brightness":2},"surreal":1,"cliche":false},{"id":"5-071","text":"しもばしら","mora":5,"kigo":true,"pos":"noun","tone":{"motion":-2,"brightness":1},"surreal":1,"cliche":true},{"id":"5-072","text":"たきびあと","mora":5,"kigo":true,"pos":"noun","tone":{"motion":-3,"brightness":-1},"surreal":0,"cliche":false},{"id":"5-073","text":"みかんむく","mora":5,"kigo":true,"pos":"verb","tone":{"motion":1,"brightness":2},"surreal":0,"cliche":true},{"id":"5-074","text":"つららおち","mora":5,"kigo":true,"pos":"verb","tone":{"motion":2,"brightness":0},"surreal":1,"cliche":false},{"id":"5-075","text":"ふゆのうみ","mora":5,"kigo":true,"pos":"noun","tone":{"motion":-1,"brightness":-2},"surreal":0,"cliche":false},{"id":"5-076","text":"いきがしろ","mora":5,"kigo":true,"pos":"adj","tone":{"motion":0,"brightness":0},"surreal":0,"cliche":false},{"id":"5-077","text":"はつひので","mora":5,"kigo":true,"pos":"noun","tone":{"motion":-1,"brightness":3},"surreal":0,"cliche":true},{"id":"5-078","text":"かどまつや","mora":5,"kigo":true,"pos":"other","tone":{"motion":-2,"brightness":2},"surreal":1,"cliche":false},{"id":"5-079","text":"はつもうで","mora":5,"kigo":true,"pos":"noun","tone":{"motion":2,"brightness":2},"surreal":0,"cliche":true},{"id":"5-080","text":"もちをつく","mora":5,"kigo":true,"pos":"verb","tone":{"motion":3,"brightness":2},"surreal":0,"cliche":false},{"id":"5-081","text":"あさしずか","mora":5,"kigo":false,"pos":"adj","tone":{"motion":-3,"brightness":1},"surreal":0,"cliche":false},{"id":"5-082","text":"ちゃわんおく","mora":5,"kigo":false,"pos":"verb","tone":{"motion":0,"brightness":0},"surreal":0,"cliche":false},{"id":"5-083","text":"みちしずか","mora":5,"kigo":false,"pos":"adj","tone":{"motion":-3,"brightness":0},"surreal":0,"cliche":false},{"id":"5-084","text":"かぜつよし","mora":5,"kigo":false,"pos":"adj","tone":{"motion":3,"brightness":0},"surreal":0,"cliche":false},{"id":"5-085","text":"そらあおし","mora":5,"kigo":false,"pos":"adj","tone":{"motion":-1,"brightness":3},"surreal":0,"cliche":false},{"id":"5-086","text":"こえをまつ","mora":5,"kigo":false,"pos":"verb","tone":{"motion":-2,"brightness":-1},"surreal":1,"cliche":false},{"id":"5-087","text":"スマホふせ","mora":5,"kigo":false,"pos":"verb","tone":{"motion":-1,"brightness":0},"surreal":1,"cliche":false},{"id":"5-088","text":"バスはまだ","mora":5,"kigo":false,"pos":"other","tone":{"motion":-2,"brightness":-1},"surreal":0,"cliche":false},{"id":"5-089","text":"バグはねる","mora":5,"kigo":false,"pos":"verb","tone":{"motion":3,"brightness":0},"surreal":2,"cliche":false},{"id":"5-090","text":"ほしのドア","mora":5,"kigo":false,"pos":"noun","tone":{"motion":1,"brightness":2},"surreal":3,"cliche":false},{"id":"5-091","text":"ロボとおちゃ","mora":5,"kigo":false,"pos":"noun","tone":{"motion":-2,"brightness":1},"surreal":2,"cliche":false},{"id":"5-092","text":"ゆめのそと","mora":5,"kigo":false,"pos":"noun","tone":{"motion":-2,"brightness":-1},"surreal":1,"cliche":false},{"id":"5-093","text":"つきがとぶ","mora":5,"kigo":false,"pos":"verb","tone":{"motion":2,"brightness":1},"surreal":3,"cliche":false},{"id":"5-094","text":"ゆめをぬう","mora":5,"kigo":false,"pos":"verb","tone":{"motion":-1,"brightness":0},"surreal":3,"cliche":false},{"id":"5-095","text":"かげがさく","mora":5,"kigo":false,"pos":"verb","tone":{"motion":1,"brightness":-2},"surreal":3,"cliche":false},{"id":"5-096","text":"そらのうら","mora":5,"kigo":false,"pos":"noun","tone":{"motion":-2,"brightness":0},"surreal":3,"cliche":false},{"id":"5-097","text":"ほしをかう","mora":5,"kigo":false,"pos":"verb","tone":{"motion":0,"brightness":3},"surreal":3,"cliche":false},{"id":"5-098","text":"かぜのたま","mora":5,"kigo":false,"pos":"noun","tone":{"motion":2,"brightness":1},"surreal":2,"cliche":false},{"id":"5-099","text":"みずがねる","mora":5,"kigo":false,"pos":"verb","tone":{"motion":-3,"brightness":-1},"surreal":2,"cliche":false},{"id":"5-100","text":"よるをおる","mora":5,"kigo":false,"pos":"verb","tone":{"motion":-1,"brightness":-3},"surreal":3,"cliche":false},{"id":"5-101","text":"くもがなく","mora":5,"kigo":false,"pos":"verb","tone":{"motion":1,"brightness":-1},"surreal":2,"cliche":false},{"id":"5-102","text":"にじのこえ","mora":5,"kigo":false,"pos":"noun","tone":{"motion":0,"brightness":3},"surreal":2,"cliche":false},{"id":"5-103","text":"つきのまど","mora":5,"kigo":true,"pos":"noun","tone":{"motion":-2,"brightness":1},"surreal":2,"cliche":false},{"id":"5-104","text":"ゆめのそこ","mora":5,"kigo":false,"pos":"noun","tone":{"motion":-3,"brightness":-2},"surreal":2,"cliche":false},{"id":"5-105","text":"かがみうみ","mora":5,"kigo":false,"pos":"noun","tone":{"motion":-2,"brightness":1},"surreal":3,"cliche":false},{"id":"5-106","text":"はながとぶ","mora":5,"kigo":true,"pos":"verb","tone":{"motion":3,"brightness":3},"surreal":2,"cliche":false},{"id":"5-107","text":"そらをつむ","mora":5,"kigo":false,"pos":"verb","tone":{"motion":0,"brightness":2},"surreal":3,"cliche":false},{"id":"5-108","text":"ひかりごけ","mora":5,"kigo":true,"pos":"noun","tone":{"motion":-3,"brightness":2},"surreal":1,"cliche":false},{"id":"5-109","text":"あめのつの","mora":5,"kigo":false,"pos":"noun","tone":{"motion":1,"brightness":-1},"surreal":3,"cliche":false},{"id":"5-110","text":"とりがゆめ","mora":5,"kigo":false,"pos":"noun","tone":{"motion":1,"brightness":1},"surreal":2,"cliche":false},{"id":"5-111","text":"こえがふる","mora":5,"kigo":false,"pos":"verb","tone":{"motion":1,"brightness":-2},"surreal":2,"cliche":false},{"id":"5-112","text":"ゆきのした","mora":5,"kigo":true,"pos":"noun","tone":{"motion":-3,"brightness":0},"surreal":1,"cliche":false},{"id":"5-113","text":"つきふたつ","mora":5,"kigo":true,"pos":"noun","tone":{"motion":-2,"brightness":2},"surreal":3,"cliche":false},{"id":"5-114","text":"かぜをかむ","mora":5,"kigo":false,"pos":"verb","tone":{"motion":2,"brightness":0},"surreal":2,"cliche":false},{"id":"5-115","text":"うみのひも","mora":5,"kigo":false,"pos":"noun","tone":{"motion":1,"brightness":0},"surreal":3,"cliche":false},{"id":"5-116","text":"よるのはね","mora":5,"kigo":false,"pos":"noun","tone":{"motion":-1,"brightness":-2},"surreal":2,"cliche":false}],"sevens":[{"id":"7-001","text":"かわずとびこむ","mora":7,"kigo":true,"pos":"verb","tone":{"motion":3,"brightness":0},"surreal":0,"cliche":true},{"id":"7-002","text":"みずのおとする","mora":7,"kigo":false,"pos":"noun","tone":{"motion":1,"brightness":0},"surreal":0,"cliche":true},{"id":"7-003","text":"スマホみつめて","mora":7,"kigo":false,"pos":"verb","tone":{"motion":0,"brightness":1},"surreal":1,"cliche":false},{"id":"7-004","text":"エラーはきだす","mora":7,"kigo":false,"pos":"verb","tone":{"motion":2,"brightness":-1},"surreal":2,"cliche":false},{"id":"7-005","text":"こころもとなく","mora":7,"kigo":false,"pos":"adj","tone":{"motion":-1,"brightness":-1},"surreal":0,"cliche":true},{"id":"7-006","text":"ねこがのびして","mora":7,"kigo":false,"pos":"verb","tone":{"motion":1,"brightness":2},"surreal":1,"cliche":false},{"id":"7-007","text":"うちゅうとびたつ","mora":7,"kigo":false,"pos":"verb","tone":{"motion":3,"brightness":1},"surreal":3,"cliche":false},{"id":"7-008","text":"しずけさしみる","mora":7,"kigo":true,"pos":"adj","tone":{"motion":-3,"brightness":0},"surreal":0,"cliche":true},{"id":"7-009","text":"はるかぜのなか","mora":7,"kigo":true,"pos":"other","tone":{"motion":1,"brightness":2},"surreal":0,"cliche":true},{"id":"7-010","text":"さくらのふぶき","mora":7,"kigo":true,"pos":"noun","tone":{"motion":3,"brightness":3},"surreal":1,"cliche":true},{"id":"7-011","text":"つばめがかえる","mora":7,"kigo":true,"pos":"verb","tone":{"motion":2,"brightness":2},"surreal":0,"cliche":false},{"id":"7-012","text":"あおばがひかる","mora":7,"kigo":true,"pos":"verb","tone":{"motion":1,"brightness":3},"surreal":1,"cliche":true},{"id":"7-013","text":"なつくさしげる","mora":7,"kigo":true,"pos":"verb","tone":{"motion":1,"brightness":2},"surreal":0,"cliche":true},{"id":"7-014","text":"せみのこえだけ","mora":7,"kigo":true,"pos":"other","tone":{"motion":2,"brightness":1},"surreal":1,"cliche":false},{"id":"7-015","text":"あきかぜわたる","mora":7,"kigo":true,"pos":"verb","tone":{"motion":2,"brightness":0},"surreal":0,"cliche":true},{"id":"7-016","text":"つきかげしずか","mora":7,"kigo":true,"pos":"adj","tone":{"motion":-3,"brightness":1},"surreal":1,"cliche":true},{"id":"7-017","text":"しぐれのホーム","mora":7,"kigo":true,"pos":"noun","tone":{"motion":1,"brightness":-2},"surreal":1,"cliche":false},{"id":"7-018","text":"はつゆきのまち","mora":7,"kigo":true,"pos":"noun","tone":{"motion":-2,"brightness":2},"surreal":0,"cliche":true},{"id":"7-019","text":"ふゆぞらあおし","mora":7,"kigo":true,"pos":"adj","tone":{"motion":-2,"brightness":2},"surreal":1,"cliche":true},{"id":"7-020","text":"こたつからでず","mora":7,"kigo":true,"pos":"verb","tone":{"motion":-3,"brightness":1},"surreal":1,"cliche":false},{"id":"7-021","text":"コンビニのよる","mora":7,"kigo":false,"pos":"noun","tone":{"motion":0,"brightness":1},"surreal":1,"cliche":false},{"id":"7-022","text":"スマホがひかる","mora":7,"kigo":false,"pos":"verb","tone":{"motion":-1,"brightness":2},"surreal":1,"cliche":true},{"id":"7-023","text":"でんしゃはこない","mora":7,"kigo":false,"pos":"verb","tone":{"motion":-2,"brightness":-1},"surreal":1,"cliche":false},{"id":"7-024","text":"レジぶくろなし","mora":7,"kigo":false,"pos":"adj","tone":{"motion":0,"brightness":0},"surreal":2,"cliche":false},{"id":"7-025","text":"バグだけのこる","mora":7,"kigo":false,"pos":"verb","tone":{"motion":-1,"brightness":-2},"surreal":2,"cliche":true},{"id":"7-026","text":"エラーがわらう","mora":7,"kigo":false,"pos":"verb","tone":{"motion":2,"brightness":-1},"surreal":3,"cliche":false},{"id":"7-027","text":"デプロイのあと","mora":7,"kigo":false,"pos":"noun","tone":{"motion":-2,"brightness":0},"surreal":2,"cliche":false},{"id":"7-028","text":"コードがもえる","mora":7,"kigo":false,"pos":"verb","tone":{"motion":3,"brightness":2},"surreal":3,"cliche":false},{"id":"7-029","text":"サーバーねむる","mora":7,"kigo":false,"pos":"verb","tone":{"motion":-3,"brightness":-2},"surreal":3,"cliche":false},{"id":"7-030","text":"ログにもないよ","mora":7,"kigo":false,"pos":"adj","tone":{"motion":-1,"brightness":-3},"surreal":2,"cliche":false},{"id":"7-031","text":"うちゅうのはしで","mora":7,"kigo":false,"pos":"other","tone":{"motion":-2,"brightness":1},"surreal":3,"cliche":false},{"id":"7-032","text":"かせいでまよう","mora":7,"kigo":false,"pos":"verb","tone":{"motion":1,"brightness":-1},"surreal":3,"cliche":false},{"id":"7-033","text":"ロボットのゆめ","mora":7,"kigo":false,"pos":"noun","tone":{"motion":-2,"brightness":1},"surreal":3,"cliche":false},{"id":"7-034","text":"むじんえきから","mora":7,"kigo":false,"pos":"other","tone":{"motion":-3,"brightness":-2},"surreal":2,"cliche":false},{"id":"7-035","text":"ねこだけうかぶ","mora":7,"kigo":false,"pos":"verb","tone":{"motion":1,"brightness":2},"surreal":3,"cliche":false},{"id":"7-036","text":"じかんがとける","mora":7,"kigo":false,"pos":"verb","tone":{"motion":-1,"brightness":-1},"surreal":3,"cliche":false},{"id":"7-037","text":"ことばがきえる","mora":7,"kigo":false,"pos":"verb","tone":{"motion":-2,"brightness":-2},"surreal":2,"cliche":false},{"id":"7-038","text":"だれもいないね","mora":7,"kigo":false,"pos":"adj","tone":{"motion":-3,"brightness":-3},"surreal":1,"cliche":true},{"id":"7-039","text":"はるさめこみち","mora":7,"kigo":true,"pos":"noun","tone":{"motion":-1,"brightness":0},"surreal":0,"cliche":false},{"id":"7-040","text":"うぐいすのこえ","mora":7,"kigo":true,"pos":"noun","tone":{"motion":1,"brightness":2},"surreal":0,"cliche":true},{"id":"7-041","text":"なのはなゆれる","mora":7,"kigo":true,"pos":"verb","tone":{"motion":2,"brightness":3},"surreal":0,"cliche":true},{"id":"7-042","text":"はなびらをおう","mora":7,"kigo":true,"pos":"verb","tone":{"motion":2,"brightness":2},"surreal":1,"cliche":false},{"id":"7-043","text":"あまがえるなく","mora":7,"kigo":true,"pos":"verb","tone":{"motion":2,"brightness":1},"surreal":0,"cliche":true},{"id":"7-044","text":"ほたるびのかわ","mora":7,"kigo":true,"pos":"noun","tone":{"motion":1,"brightness":1},"surreal":1,"cliche":false},{"id":"7-045","text":"うみかぜすずし","mora":7,"kigo":true,"pos":"adj","tone":{"motion":1,"brightness":2},"surreal":0,"cliche":false},{"id":"7-046","text":"あさつゆひかる","mora":7,"kigo":true,"pos":"verb","tone":{"motion":-1,"brightness":3},"surreal":0,"cliche":false},{"id":"7-047","text":"あかとんぼとぶ","mora":7,"kigo":true,"pos":"verb","tone":{"motion":2,"brightness":2},"surreal":0,"cliche":true},{"id":"7-048","text":"すすきがそよぐ","mora":7,"kigo":true,"pos":"verb","tone":{"motion":1,"brightness":0},"surreal":1,"cliche":false},{"id":"7-049","text":"きくのかおりや","mora":7,"kigo":true,"pos":"other","tone":{"motion":-2,"brightness":2},"surreal":0,"cliche":false},{"id":"7-050","text":"おちばふみゆく","mora":7,"kigo":true,"pos":"verb","tone":{"motion":1,"brightness":0},"surreal":0,"cliche":false},{"id":"7-051","text":"ゆきみちをゆく","mora":7,"kigo":true,"pos":"verb","tone":{"motion":1,"brightness":0},"surreal":0,"cliche":true},{"id":"7-052","text":"きたかぜのまち","mora":7,"kigo":true,"pos":"noun","tone":{"motion":3,"brightness":-2},"surreal":0,"cliche":false},{"id":"7-053","text":"ふゆばれのそら","mora":7,"kigo":true,"pos":"noun","tone":{"motion":-2,"brightness":3},"surreal":0,"cliche":false},{"id":"7-054","text":"すみやきけむる","mora":7,"kigo":true,"pos":"verb","tone":{"motion":1,"brightness":-1},"surreal":1,"cliche":false},{"id":"7-055","text":"はつぞらあおぐ","mora":7,"kigo":true,"pos":"verb","tone":{"motion":1,"brightness":3},"surreal":1,"cliche":true},{"id":"7-056","text":"ななくさをつむ","mora":7,"kigo":true,"pos":"verb","tone":{"motion":1,"brightness":2},"surreal":0,"cliche":false},{"id":"7-057","text":"ゆうぐれさびし","mora":7,"kigo":false,"pos":"adj","tone":{"motion":-3,"brightness":-2},"surreal":0,"cliche":false},{"id":"7-058","text":"こころはしずか","mora":7,"kigo":false,"pos":"adj","tone":{"motion":-3,"brightness":0},"surreal":1,"cliche":false},{"id":"7-059","text":"えんがわでおちゃ","mora":7,"kigo":false,"pos":"noun","tone":{"motion":-2,"brightness":1},"surreal":1,"cliche":false},{"id":"7-060","text":"あめおとをきく","mora":7,"kigo":false,"pos":"verb","tone":{"motion":-2,"brightness":-1},"surreal":1,"cliche":false},{"id":"7-061","text":"とおくのベルね","mora":7,"kigo":false,"pos":"other","tone":{"motion":0,"brightness":-1},"surreal":2,"cliche":false},{"id":"7-062","text":"スマホをしまう","mora":7,"kigo":false,"pos":"verb","tone":{"motion":-1,"brightness":1},"surreal":2,"cliche":false},{"id":"7-063","text":"そらにロボット","mora":7,"kigo":false,"pos":"noun","tone":{"motion":1,"brightness":2},"surreal":3,"cliche":false},{"id":"7-064","text":"つきのうらがわ","mora":7,"kigo":true,"pos":"noun","tone":{"motion":-2,"brightness":0},"surreal":3,"cliche":false},{"id":"7-065","text":"そらからさかな","mora":7,"kigo":false,"pos":"noun","tone":{"motion":2,"brightness":2},"surreal":3,"cliche":false},{"id":"7-066","text":"かがみのむこう","mora":7,"kigo":false,"pos":"noun","tone":{"motion":-2,"brightness":-1},"surreal":3,"cliche":false},{"id":"7-067","text":"ゆめからかえる","mora":7,"kigo":false,"pos":"verb","tone":{"motion":1,"brightness":0},"surreal":2,"cliche":false},{"id":"7-068","text":"かげだけおどる","mora":7,"kigo":false,"pos":"verb","tone":{"motion":3,"brightness":-2},"surreal":2,"cliche":false},{"id":"7-069","text":"くもよりてがみ","mora":7,"kigo":false,"pos":"noun","tone":{"motion":0,"brightness":1},"surreal":3,"cliche":false},{"id":"7-070","text":"つきからしずく","mora":7,"kigo":true,"pos":"noun","tone":{"motion":1,"brightness":1},"surreal":2,"cliche":false},{"id":"7-071","text":"ひかりがねむる","mora":7,"kigo":false,"pos":"verb","tone":{"motion":-3,"brightness":2},"surreal":2,"cliche":false},{"id":"7-072","text":"そらにかいだん","mora":7,"kigo":false,"pos":"noun","tone":{"motion":1,"brightness":2},"surreal":3,"cliche":false},{"id":"7-073","text":"みなもにとびら","mora":7,"kigo":false,"pos":"noun","tone":{"motion":-1,"brightness":0},"surreal":3,"cliche":false},{"id":"7-074","text":"はなびらねむる","mora":7,"kigo":true,"pos":"verb","tone":{"motion":-3,"brightness":2},"surreal":2,"cliche":false},{"id":"7-075","text":"ふうりんがとぶ","mora":7,"kigo":true,"pos":"verb","tone":{"motion":3,"brightness":2},"surreal":2,"cliche":false},{"id":"7-076","text":"こおろぎのふね","mora":7,"kigo":true,"pos":"noun","tone":{"motion":0,"brightness":-1},"surreal":2,"cliche":false},{"id":"7-077","text":"ゆきうさぎまう","mora":7,"kigo":true,"pos":"verb","tone":{"motion":2,"brightness":2},"surreal":2,"cliche":false},{"id":"7-078","text":"ゆうやけをのむ","mora":7,"kigo":true,"pos":"verb","tone":{"motion":1,"brightness":3},"surreal":3,"cliche":false},{"id":"7-079","text":"ほたるのてがみ","mora":7,"kigo":true,"pos":"noun","tone":{"motion":0,"brightness":1},"surreal":2,"cliche":false}]};
const seedJson = [{"author":"詠み人知らず","cardIds":["5-001","7-001","5-011"]},{"author":"ばぐとり名人","cardIds":["5-012","7-004","5-003"]},{"author":"宇宙の旅人","cardIds":["5-006","7-007","5-008"]},{"author":"しずか","cardIds":["5-005","7-008","5-011"]},{"author":"はるがすみ","cardIds":["5-007","7-006","5-009"]},{"author":"よなよな","cardIds":["5-002","7-005","5-010"]},{"author":"月見る人","cardIds":["5-017","7-016","5-011"]},{"author":"デバッガ","cardIds":["5-033","7-025","5-034"]},{"author":"夢遊病者","cardIds":["5-039","7-028","5-043"]},{"author":"ゆきんこ","cardIds":["5-019","7-018","5-020"]},{"author":"深夜勤務","cardIds":["5-029","7-021","5-030"]},{"author":"時計工","cardIds":["5-046","7-036","5-051"]}];
let deck = null;
let game = null;

function cardEl(card) {
  const b = document.createElement('button');
  b.className = 'fuda';
  b.textContent = card.text;
  b.type = 'button';
  b.dataset.cardId = card.id;
  b.dataset.mora = String(card.mora);
  b.setAttribute('aria-pressed', 'false');
  return b;
}

function updateNormalPlacementState() {
  const placedIds = new Set(game?.getState().slots.filter(Boolean).map((card) => card.id) ?? []);
  activeCardElements.forEach((element, cardId) => {
    const isPlaced = placedIds.has(cardId);
    const isSelected = selectedCard?.id === cardId && !isPlaced;
    element.disabled = isPlaced;
    element.classList.toggle('is-selected', isSelected);
    element.classList.toggle('is-used', isPlaced);
    element.setAttribute('aria-pressed', String(isSelected));
  });
  els.slots.forEach((slot) => {
    const compatible = Boolean(selectedCard) && Number(slot.dataset.mora) === selectedCard.mora;
    const lineName = ['上五', '中七', '下五'][Number(slot.dataset.slot)];
    const placedText = slot.dataset.cardId ? `、配置済み：${slot.textContent}` : '';
    slot.classList.toggle('is-compatible', compatible);
    slot.setAttribute('aria-disabled', String(Boolean(selectedCard) && !compatible));
    slot.setAttribute('aria-label', `${lineName}の枠、${slot.dataset.mora}音${placedText}${compatible ? '、選択中の札を配置可能' : ''}`);
  });
}

function createCopyGame(selectedDeck) {
  return createGame({
    deck: selectedDeck,
    seconds: GAME_SECONDS,
    onTick: (r) => {
      els.timer.textContent = String(r);
      els.timer.classList.toggle('animate-pulse', r <= 10);
      const progress = Math.min(1, Math.max(0, (GAME_SECONDS - r) / GAME_SECONDS));
      const angle = SHISHI_START_ANGLE
        + (SHISHI_DUMP_ANGLE - SHISHI_START_ANGLE) * progress;
      els.shishi.style.setProperty('--shishi-angle', `${angle.toFixed(2)}deg`);
      updateShishiWaterPath(angle);
    },
    onHand: (hand) => {
      selectedCard = null;
      activeCardElements = new Map();
      els.placementMessage.textContent = '札はドラッグ、または選択して枠へ配置できます。';
      els.slots.forEach((slot) => {
        slot.textContent = slot.dataset.mora === '5' ? '五' : '七';
        delete slot.dataset.cardId;
      });
      els.submit.disabled = true;
      els.hand.innerHTML = '';
      placeNormalCard = (card, slot) => {
        if (!card || !slot) return;
        const result = game.placeCard(Number(slot.dataset.slot), card);
        if (!result.accepted) {
          els.placementMessage.textContent = result.reason === 'card_already_used'
            ? 'その札はすでに別の枠で使用しています。'
            : 'この枠には音数の異なる札を配置できません。';
          return;
        }
        slot.textContent = card.text;
        slot.dataset.cardId = card.id;
        selectedCard = null;
        els.submit.disabled = !result.complete;
        els.placementMessage.textContent = result.complete
          ? '一句が完成しました。提出できます。'
          : `${card.text}を配置しました。`;
        updateNormalPlacementState();
      };
      for (const card of [...hand.fives, ...hand.sevens]) {
        const el = cardEl(card);
        activeCardElements.set(card.id, el);
        el.addEventListener('click', () => {
          if (el.dataset.dragged === 'true') {
            delete el.dataset.dragged;
            return;
          }
          if (el.disabled) return;
          selectedCard = selectedCard?.id === card.id ? null : card;
          els.placementMessage.textContent = selectedCard
            ? `${card.text}を選択中です。${card.mora}音の枠を選んでください。`
            : '札の選択を解除しました。';
          updateNormalPlacementState();
        });
        makeDraggable(el, card, (c, slot) => {
          placeNormalCard(c, slot);
        });
        els.hand.appendChild(el);
      }
      updateNormalPlacementState();
    },
    onEnd: (submissions) => {
      normalPlaying = false;
      els.compose.classList.add('hidden');
      finishedSubmissions = submissions;
      els.shishi.classList.remove('is-running', 'is-idle');
      els.shishi.classList.add('is-dumping');
      els.timeup.classList.remove('hidden');
      window.setTimeout(playShishiKnock, 720);
    },
  });
}

els.submit.addEventListener('click', () => game?.submitCurrent());
els.slots.forEach((slot) => {
  const placeSelected = () => {
    if (selectedCard) placeNormalCard?.(selectedCard, slot);
  };
  slot.addEventListener('click', placeSelected);
  slot.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    placeSelected();
  });
});
els.showResults.addEventListener('click', () => {
  els.timeup.classList.add('hidden');
  els.timerBox.classList.add('hidden');
  els.timerBox.classList.remove('flex');
  els.shishi.classList.remove('is-running', 'is-dumping');
  els.shishi.classList.add('is-idle', 'is-results');
  els.shishi.style.setProperty('--shishi-angle', `${SHISHI_START_ANGLE}deg`);
  updateShishiWaterPath(SHISHI_START_ANGLE);
  // 結果発表はPC想定で画面を広く使う
  els.app.classList.remove('max-w-3xl');
  els.app.classList.add('max-w-5xl');
  els.results.innerHTML = '';
  els.results.classList.remove('hidden');
  renderResults(els.results, { deck, seedJson, submissions: finishedSubmissions, onExit: showCopyModeSelect });
});

function hideEntrySections() {
  for (const section of [els.modeSelect, els.copyModeSelect, els.intro, els.compose, els.timeup,
    els.results, els.hardShell, els.meikuIntro, els.meikuGame, els.meikuResult]) {
    section.classList.add('hidden');
  }
}

function setIllustrations(mode) {
  const isSelection = mode === 'selection';
  const isMeiku = mode === 'meiku';
  els.shishi.classList.toggle('hidden', isMeiku);
  els.katana.classList.toggle('hidden', !isSelection && !isMeiku);
  els.katana.classList.toggle('is-meiku', isMeiku);
  if (!isMeiku) els.katana.classList.remove('is-striking');
}

function showModeSelect() {
  hideEntrySections();
  els.modeSelect.classList.remove('hidden');
  els.mainTitle.textContent = '俳句遊戯集';
  els.app.classList.add('max-w-3xl');
  els.app.classList.remove('max-w-5xl');
  setIllustrations('selection');
  els.shishi.classList.add('is-idle');
}

function showCopyModeSelect() {
  hideEntrySections();
  els.copyModeSelect.classList.remove('hidden');
  els.mainTitle.textContent = 'コピペ俳句';
  const best = hardBestScore();
  els.hardBestSummary.textContent = best === null ? '自己ベスト　未記録' : `自己ベスト　${best} / 300点`;
  els.app.classList.add('max-w-3xl');
  els.app.classList.remove('max-w-5xl');
  setIllustrations('selection');
}

function showCopyIntro() {
  hideEntrySections();
  els.intro.classList.remove('hidden');
  els.mainTitle.textContent = 'コピペ俳句';
  els.app.classList.add('max-w-3xl');
  els.app.classList.remove('max-w-5xl');
  setIllustrations('copy');
}

function showMeikuIntro() {
  hideEntrySections();
  els.meikuIntro.classList.remove('hidden');
  els.mainTitle.textContent = '名句斬り';
  els.app.classList.remove('max-w-3xl');
  els.app.classList.add('max-w-5xl');
  setIllustrations('meiku');
}

function showHardMode() {
  hideEntrySections();
  els.hardShell.classList.remove('hidden');
  els.mainTitle.textContent = '盗作率鑑定所';
  els.app.classList.remove('max-w-3xl');
  els.app.classList.add('max-w-5xl');
  setIllustrations('copy');
  showHardIntro();
}

function leaveNormalGame() {
  if (normalPlaying && !window.confirm('作句途中の内容を破棄して戻りますか？')) return;
  game?.cancel();
  normalPlaying = false;
  els.timerBox.classList.add('hidden');
  els.timerBox.classList.remove('flex');
  showCopyModeSelect();
}

function leaveHardGame() {
  if (isHardPlaying() && !window.confirm('作句途中の内容を破棄して戻りますか？')) return;
  abandonHardGame();
  showCopyModeSelect();
}

els.chooseCopy.addEventListener('click', showCopyModeSelect);
els.chooseMeiku.addEventListener('click', showMeikuIntro);
els.backFromCopySelect.addEventListener('click', showModeSelect);
els.chooseCopyNormal.addEventListener('click', showCopyIntro);
els.chooseCopyHard.addEventListener('click', showHardMode);
els.backFromCopy.addEventListener('click', leaveNormalGame);
els.backFromCopyGame.addEventListener('click', leaveNormalGame);
els.backFromCopyTimeup.addEventListener('click', leaveNormalGame);
els.backFromHard.addEventListener('click', leaveHardGame);
els.backFromMeiku.addEventListener('click', showModeSelect);

setupIntro({
  introEl: els.intro,
  composeEl: els.compose,
  startBtn: els.start,
  onStart: () => {
    const preset = document.querySelector('input[name="copy-deck"]:checked')?.value ?? 'season';
    deck = loadDeck(selectDeck(deckJson, preset));
    game = createCopyGame(deck);
    normalPlaying = true;
    prepareShishiSound();
    els.timerBox.classList.remove('hidden'); // ゲーム中のみタイマー表示
    els.timerBox.classList.add('flex');
    els.shishi.classList.remove('is-idle', 'is-dumping', 'is-results');
    els.shishi.classList.add('is-running');
    window.scrollTo({ top: 0, behavior: 'auto' });
    els.compose.focus({ preventScroll: true });
    game.start();
  },
});

setupMeiku({
  introEl: els.meikuIntro,
  gameEl: els.meikuGame,
  resultEl: els.meikuResult,
  startBtn: els.startMeiku,
  onExit: showModeSelect,
});

updateShishiWaterPath(SHISHI_START_ANGLE);
})();
