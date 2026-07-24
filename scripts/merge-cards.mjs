// data/deck.json へ新規カードを検証つきで追記マージするツール。
// 使い方: node scripts/merge-cards.mjs <新規カードJSONへのパス>
//   新規カードJSONの形式は { "fives": [...], "sevens": [...] }（deck.jsonと同形式）。
// 検証: モーラ数の実測（拗音は前の字と結合／促音・撥音・長音は1モーラ）、
//       id重複、text重複（警告のみ）、mora/kigo/pos/tone/surreal/cliche の型・範囲。
// 1件でもエラーがあればマージせず終了する（exit 1）。

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const DECK = path.join(here, '..', 'data', 'deck.json');

const newCardsPath = process.argv[2];
if (!newCardsPath) {
  console.error('使い方: node scripts/merge-cards.mjs <新規カードJSONへのパス>');
  process.exit(1);
}

// 小書き仮名（拗音・小母音）は前のモーラに結合＝カウントしない。
// 促音っ/ッ・撥音ん/ン・長音ー はそれぞれ1モーラ（カウントする）。
const SMALL = new Set([...'ゃゅょぁぃぅぇぉゎゕゖ' + 'ャュョァィゥェォヮヵヶ']);
const moraCount = (t) => [...t].filter((ch) => !SMALL.has(ch)).length;

const POS = ['noun', 'verb', 'adj', 'other'];
const errors = [];
const warns = [];

function validate(c) {
  const m = moraCount(c.text);
  if (m !== c.mora) errors.push(`${c.id} "${c.text}" mora=${c.mora} だが実モーラ=${m}`);
  if (![5, 7].includes(c.mora)) errors.push(`${c.id} mora不正:${c.mora}`);
  if (typeof c.kigo !== 'boolean') errors.push(`${c.id} kigo非boolean`);
  if (!POS.includes(c.pos)) errors.push(`${c.id} pos不正:${c.pos}`);
  for (const k of ['motion', 'brightness']) {
    const v = c.tone?.[k];
    if (typeof v !== 'number' || v < -3 || v > 3) errors.push(`${c.id} tone.${k}範囲外:${v}`);
  }
  if (!(c.surreal >= 0 && c.surreal <= 3)) errors.push(`${c.id} surreal範囲外:${c.surreal}`);
  if (typeof c.cliche !== 'boolean') errors.push(`${c.id} cliche非boolean`);
}

const deck = JSON.parse(await readFile(DECK, 'utf8'));
const add = JSON.parse(await readFile(newCardsPath, 'utf8'));

const allIds = new Set();
const allTexts = new Map();
for (const [grp, expectMora] of [['fives', 5], ['sevens', 7]]) {
  for (const c of [...deck[grp], ...(add[grp] ?? [])]) {
    if (allIds.has(c.id)) errors.push(`id重複: ${c.id}`);
    allIds.add(c.id);
    if (allTexts.has(c.text)) warns.push(`text重複: "${c.text}" (${allTexts.get(c.text)} と ${c.id})`);
    else allTexts.set(c.text, c.id);
    if (c.mora !== expectMora) errors.push(`${c.id} は ${grp} だが mora=${c.mora}`);
    validate(c);
  }
}

console.log('=== 検証 ===');
console.log(`fives: ${deck.fives.length}+${(add.fives ?? []).length}=${deck.fives.length + (add.fives ?? []).length}`);
console.log(`sevens: ${deck.sevens.length}+${(add.sevens ?? []).length}=${deck.sevens.length + (add.sevens ?? []).length}`);
if (warns.length) { console.log('--- 警告 ---'); warns.forEach((w) => console.log('WARN ' + w)); }
if (errors.length) {
  console.log('--- エラー ---');
  errors.forEach((e) => console.log('ERROR ' + e));
  console.log(`\nエラー ${errors.length} 件。マージ中止。`);
  process.exit(1);
}

const merged = {
  fives: [...deck.fives, ...(add.fives ?? [])],
  sevens: [...deck.sevens, ...(add.sevens ?? [])],
};
await writeFile(DECK, JSON.stringify(merged, null, 2) + '\n', 'utf8');
console.log('\n✅ 全カード検証OK・マージ完了。');
