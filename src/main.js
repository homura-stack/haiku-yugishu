import { loadDeck, selectDeck } from './data.js';
import { createGame } from './game.js';
import { makeDraggable } from './dragdrop.js';
import { renderResults } from './results.js';
import { setupIntro } from './intro.js';
import { setupMeiku } from './meiku.js';

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

const deckJson = await fetch('./data/deck.json').then((r) => r.json());
const seedJson = await fetch('./data/seed.json').then((r) => r.json());
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
