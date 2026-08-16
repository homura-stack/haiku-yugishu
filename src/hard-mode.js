import { createComposer } from './hard-composer.js';
import {
  compositionLineDisplay,
  countMora,
  validateComposition,
  validateReading,
} from './hard-mora.js';
import { buildKeywordMap, scorePlagiarism } from './hard-plagiarism.js';
import { generateCritique } from './hard-critic.js';
import { createRounds } from './hard-rounds.js';
import { createHardBestStore } from './hard-best.js';
import { hardValidationGuidance, validateHardFreeText } from './hard-feedback.js';

const sourceHaiku = await fetch('./data/hard-source-haiku.json').then((response) => response.json());
const sourceMap = new Map(sourceHaiku.map((source) => [source.id, source]));
const keywordMap = buildKeywordMap(sourceHaiku);

const els = {
  intro: document.getElementById('hard-intro'),
  start: document.getElementById('hard-start-button'),
  composerScreen: document.getElementById('hard-composer-screen'),
  roundTitle: document.getElementById('hard-round-title'),
  progress: document.getElementById('hard-round-progress'),
  editors: document.getElementById('hard-line-editors'),
  activeLineStatus: document.getElementById('hard-active-line-status'),
  lineTargets: document.getElementById('hard-line-targets'),
  keywordTray: document.getElementById('hard-shared-keyword-tray'),
  freeForm: document.getElementById('hard-shared-free-form'),
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
let activeLine = 0;
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

function renderKeywordTray(used) {
  const tray = document.createElement('div');
  tray.setAttribute('aria-label', `選択中の${LINE_NAMES[activeLine]}へ追加できるキーワード札`);
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
      composer.addKeyword(activeLine, keywordId);
      formMessage = '';
      renderComposer();
    });
    tray.appendChild(button);
  });
  return tray;
}

function renderFreeForm() {
  const form = document.createElement('form');
  form.className = 'hard-free-form';
  const displayField = document.createElement('label');
  displayField.className = 'hard-field';
  const displayLabel = document.createElement('span');
  displayLabel.textContent = '自由語（表示）';
  const display = document.createElement('input');
  display.placeholder = '例：飛び込む';
  display.setAttribute('aria-label', `選択中の${LINE_NAMES[activeLine]}へ追加する自由語`);
  displayField.append(displayLabel, display);
  const readingField = document.createElement('label');
  readingField.className = 'hard-field';
  const readingLabel = document.createElement('span');
  readingLabel.textContent = '読み（ひらがな）';
  const reading = document.createElement('input');
  reading.placeholder = '例：とびこむ';
  reading.setAttribute('aria-label', `選択中の${LINE_NAMES[activeLine]}へ追加する自由語の読み`);
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
    composer.addFreeText(activeLine, display.value.trim(), reading.value.trim());
    formMessage = '';
    renderComposer();
  });
  return form;
}

function renderLineTargets() {
  els.lineTargets.innerHTML = '';
  els.activeLineStatus.textContent = `追加先：${LINE_NAMES[activeLine]}（選択中）`;
  LINE_NAMES.forEach((lineName, lineIndex) => {
    const target = makeButton(
      lineName,
      `${lineName}を追加先として選択${lineIndex === activeLine ? '中' : ''}`,
      () => {
        activeLine = lineIndex;
        formMessage = '';
        renderComposer();
      },
      `hard-line-target${lineIndex === activeLine ? ' is-active' : ''}`,
    );
    target.dataset.hardLineTarget = String(lineIndex);
    target.setAttribute('aria-pressed', String(lineIndex === activeLine));
    target.setAttribute('aria-controls', `hard-line-editor-${lineIndex}`);
    els.lineTargets.appendChild(target);
  });
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
    section.id = `hard-line-editor-${lineIndex}`;
    section.className = `hard-line-editor${lineIndex === activeLine ? ' is-active' : ''}`;
    section.setAttribute('aria-label', `${LINE_NAMES[lineIndex]}${lineIndex === activeLine ? '、追加先として選択中' : ''}`);
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
    );
    els.editors.appendChild(section);
  });

  renderLineTargets();
  els.keywordTray.replaceChildren(renderKeywordTray(used));
  els.freeForm.replaceChildren(renderFreeForm());

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
  appendText(els.roundResult, 'p', '盗作率は、収録したパブリックドメイン名句12句とのゲーム内一致率であり、実在の盗作判定ではありません。', 'hard-game-disclaimer');
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
        activeLine = 0;
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
  appendText(els.finalResult, 'p', '盗作率は、収録したパブリックドメイン名句12句とのゲーム内一致率であり、実在の盗作判定ではありません。', 'hard-game-disclaimer');
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
  activeLine = 0;
  playing = true;
  showOnly(els.composerScreen);
  renderComposer();
}

els.start.addEventListener('click', startGame);
els.submit.addEventListener('click', submitCurrent);

export function showHardIntro() {
  playing = false;
  showOnly(els.intro);
}

export function isHardPlaying() {
  return playing;
}

export function abandonHardGame() {
  playing = false;
  rounds = [];
  sessionResults = [];
  showHardIntro();
}

export function hardBestScore() {
  return bestStore.get();
}
