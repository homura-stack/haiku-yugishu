export function generateCritique(result, source = null, compositionMeta = {}) {
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
      title: 'ゲーム内一致率が高すぎます。',
      comment: `ゲーム内一致率${result.rate}%です。元句との近さを測る遊びとしては、骨格まで重なっています。`,
    };
  }
  if (result.rate >= 30) {
    return {
      level: 'influenced',
      title: 'ゲーム内では元句に近い判定です。',
      comment: `ゲーム内一致率${result.rate}%です。借り物同士の関係を、もう一段壊してください。`,
    };
  }
  const irregular = compositionMeta.irregularLines ?? 0;
  return {
    level: 'original',
    title: 'ゲーム内では元句から離れた判定です。',
    comment: irregular > 0
      ? `ゲーム内一致率${result.rate}%です。定型を外した${irregular}行が、借り物にあなたの呼吸を与えました。`
      : `ゲーム内一致率${result.rate}%です。借り物だけで、元句とは別の景色を作りました。`,
  };
}
