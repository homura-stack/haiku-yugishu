import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEIKU_QUESTIONS,
  MEIKU_ROUND_SIZE,
  isMeikuCorrect,
  normalizeMeikuAnswer,
} from '../src/meiku.js';

test('名句問題は五・七・五の3区切りと正解を持つ', () => {
  assert.equal(MEIKU_QUESTIONS.length, 28);
  assert.equal(MEIKU_ROUND_SIZE, 10);
  for (const question of MEIKU_QUESTIONS) {
    assert.equal(question.parts.length, 3);
    assert.ok(question.blank >= 0 && question.blank <= 2);
    assert.equal(question.choices.length, 4);
    assert.ok(question.choices.includes(question.parts[question.blank]));
    assert.ok(question.readings.length >= 1);
    assert.equal(
      new Set(question.choices.map(normalizeMeikuAnswer)).size,
      4,
      `${question.parts.join(' ')}の選択肢が重複している`,
    );
  }
});

test('古典4俳人を各7句ずつ収録している', () => {
  const counts = Object.groupBy(MEIKU_QUESTIONS, (question) => question.author);
  assert.deepEqual(
    Object.fromEntries(Object.entries(counts).map(([author, questions]) => [author, questions.length])),
    {
      松尾芭蕉: 7,
      与謝蕪村: 7,
      小林一茶: 7,
      正岡子規: 7,
    },
  );
});

test('上級入力は空白・句読点・カタカナの違いを吸収する', () => {
  assert.equal(normalizeMeikuAnswer('　カワズ トビコム。'), 'かわずとびこむ');
});

test('漢字と読みのどちらでも正解になる', () => {
  const question = MEIKU_QUESTIONS[0];
  assert.equal(isMeikuCorrect(question, '蛙飛びこむ'), true);
  assert.equal(isMeikuCorrect(question, 'かわずとびこむ'), true);
  assert.equal(isMeikuCorrect(question, '風が吹きこむ'), false);
});
