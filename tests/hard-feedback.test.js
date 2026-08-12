import test from 'node:test';
import assert from 'node:assert/strict';
import { hardValidationGuidance, validateHardFreeText } from '../src/hard-feedback.js';

test('自由語の空欄と不正な読みを具体的に案内する', () => {
  assert.deepEqual(validateHardFreeText('', ''), {
    valid: false,
    message: '表示する言葉と、ひらがなの読みを入力してください。',
  });
  assert.deepEqual(validateHardFreeText('飛び込む', 'トビコム'), {
    valid: false,
    message: '読みは、ひらがなと長音「ー」だけで入力してください。',
  });
  assert.deepEqual(validateHardFreeText('飛び込む', 'とびこむ'), {
    valid: true,
    message: '',
  });
});

test('提出不可の理由を札不足と音数超過に分けて案内する', () => {
  assert.equal(
    hardValidationGuidance({ valid: false, errors: ['line_1_keyword_required'] }),
    '中七に、名句から借りた札を1枚以上追加してください。',
  );
  assert.equal(
    hardValidationGuidance({ valid: false, errors: ['line_2_out_of_range'] }),
    '下五の音数を、目標の±2音以内に調整してください。',
  );
  assert.equal(
    hardValidationGuidance({ valid: true, errors: [] }),
    '一句が整いました。批評家botへ提出できます。',
  );
});
