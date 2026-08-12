import { loadDeck, selectDeck } from './data.js';
import { createGame } from './game.js';
import { makeDraggable } from './dragdrop.js';
import { renderResults } from './results.js';
import { setupIntro } from './intro.js';
import { setupMeiku } from './meiku.js';
import { showHardIntro, isHardPlaying, abandonHardGame, hardBestScore } from './hard-mode.js';

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

const deckJson = await fetch('./data/deck.json').then((r) => r.json());
const seedJson = await fetch('./data/seed.json').then((r) => r.json());
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
