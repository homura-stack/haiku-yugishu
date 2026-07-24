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
function createGame({ deck, seconds = 90, seed = Date.now(), onTick, onHand, onEnd }) {
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

// ---- src/dragdrop.js ----
/**
 * カード要素にポインタドラッグを付与。ドロップ時 onDrop(card, slotEl|null) を呼ぶ。
 * slot は [data-slot][data-mora] を持つ要素。mora一致のみ受理。
 */
function makeDraggable(cardEl, card, onDrop) {
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
      const hist = loadHistory();
      hist.push(session);
      backend.setItem(KEY, JSON.stringify(hist));
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
function renderResults(container, { deck, seedJson, submissions }) {
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
  let locked = false;
  let active = false;

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

  const resolveQuestion = (correct, message) => {
    if (locked) return;
    if (!correct) {
      streak = 0;
      updateStatus();
      feedbackEl.textContent = message;
      feedbackEl.className = 'meiku-feedback is-wrong';
      cardEl.classList.add('is-wrong');
      window.setTimeout(() => cardEl.classList.remove('is-wrong'), 300);
      return;
    }

    locked = true;
    window.clearTimeout(timeoutId);
    streak += 1;
    correctCount += 1;
    score += 100 + Math.min(100, (streak - 1) * 20);
    updateStatus();
    fillCompletedPhrase();
    feedbackEl.textContent = '正解　――　斬！';
    feedbackEl.className = 'meiku-feedback is-correct';
    cardEl.classList.add('is-cleared');
    katanaEl.classList.remove('is-striking');
    void katanaEl.offsetWidth;
    katanaEl.classList.add('is-striking');
    window.setTimeout(nextQuestion, 1050);
  };

  const missQuestion = () => {
    if (locked) return;
    locked = true;
    streak = 0;
    updateStatus();
    fillCompletedPhrase();
    feedbackEl.textContent = `時間切れ　正解：${currentQuestion.parts[currentQuestion.blank]}`;
    feedbackEl.className = 'meiku-feedback is-wrong';
    cardEl.classList.add('is-missed');
    window.setTimeout(nextQuestion, 1500);
  };

  const renderQuestion = () => {
    currentQuestion = questions[questionIndex];
    currentChoices = shuffle(currentQuestion.choices);
    locked = false;
    katanaEl.classList.remove('is-striking');
    const duration = level === 'easy' ? 11000 : 16000;

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
    renderQuestion();
  };

  startBtn.addEventListener('click', start);
  retryBtn.addEventListener('click', start);
  exitBtn.addEventListener('click', () => {
    window.clearTimeout(timeoutId);
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
  intro: document.getElementById('intro'),
  start: document.getElementById('start'),
  compose: document.getElementById('compose'),
  timeup: document.getElementById('timeup'),
  showResults: document.getElementById('show-results'),
  results: document.getElementById('results'),
  modeSelect: document.getElementById('mode-select'),
  chooseCopy: document.getElementById('choose-copy'),
  chooseMeiku: document.getElementById('choose-meiku'),
  backFromCopy: document.getElementById('back-from-copy'),
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
  return b;
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
      els.slots.forEach((s) => { s.textContent = s.dataset.mora === '5' ? '五' : '七'; });
      els.submit.disabled = true;
      els.hand.innerHTML = '';
      for (const card of [...hand.fives, ...hand.sevens]) {
        const el = cardEl(card);
        makeDraggable(el, card, (c, slot) => {
          if (!slot) return;
          const idx = Number(slot.dataset.slot);
          slot.textContent = c.text;
          const full = game.placeCard(idx, c);
          els.submit.disabled = !full;
        });
        els.hand.appendChild(el);
      }
    },
    onEnd: (submissions) => {
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
  els.results.classList.remove('hidden');
  renderResults(els.results, { deck, seedJson, submissions: finishedSubmissions });
}, { once: true });

function hideEntrySections() {
  for (const section of [els.modeSelect, els.intro, els.meikuIntro, els.meikuGame, els.meikuResult]) {
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
  els.mainTitle.textContent = '俳句遊戯';
  els.app.classList.add('max-w-3xl');
  els.app.classList.remove('max-w-5xl');
  setIllustrations('selection');
  els.shishi.classList.add('is-idle');
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

els.chooseCopy.addEventListener('click', showCopyIntro);
els.chooseMeiku.addEventListener('click', showMeikuIntro);
els.backFromCopy.addEventListener('click', showModeSelect);
els.backFromMeiku.addEventListener('click', showModeSelect);

setupIntro({
  introEl: els.intro,
  composeEl: els.compose,
  startBtn: els.start,
  onStart: () => {
    const preset = document.querySelector('input[name="copy-deck"]:checked')?.value ?? 'season';
    deck = loadDeck(selectDeck(deckJson, preset));
    game = createCopyGame(deck);
    prepareShishiSound();
    els.timerBox.classList.remove('hidden'); // ゲーム中のみタイマー表示
    els.timerBox.classList.add('flex');
    els.shishi.classList.remove('is-idle', 'is-dumping', 'is-results');
    els.shishi.classList.add('is-running');
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
