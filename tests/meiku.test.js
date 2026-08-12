import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEIKU_QUESTIONS,
  MEIKU_ROUND_SIZE,
  isMeikuCorrect,
  getMeikuRemainingSeconds,
  resolveMeikuAnswer,
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

test('誤答は一問一答で終了し得点と連斬を加算しない', () => {
  assert.deepEqual(resolveMeikuAnswer({ correct: false, score: 240, streak: 2 }), {
    locked: true, score: 240, streak: 0, correctIncrement: 0,
  });
});

test('正答は連斬に応じて得点を加算する', () => {
  assert.deepEqual(resolveMeikuAnswer({ correct: true, score: 240, streak: 2 }), {
    locked: true, score: 380, streak: 3, correctIncrement: 1,
  });
});

test('名句斬りの残り秒数は切り上げ表示し0未満にならない', () => {
  assert.equal(getMeikuRemainingSeconds(11000, 0), 11);
  assert.equal(getMeikuRemainingSeconds(11000, 1000), 10);
  assert.equal(getMeikuRemainingSeconds(11000, 10999), 1);
  assert.equal(getMeikuRemainingSeconds(11000, 11000), 0);
  assert.equal(getMeikuRemainingSeconds(11000, 12000), 0);
});
