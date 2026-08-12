import { validateReading } from './hard-mora.js';

// オフライン版では各モジュールを一つへ結合するため、固有名で衝突を避ける。
const HARD_GUIDANCE_LINE_NAMES = ['上五', '中七', '下五'];

export function validateHardFreeText(display, reading) {
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

export function hardValidationGuidance(validation) {
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
