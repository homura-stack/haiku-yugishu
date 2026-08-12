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
      title: '名句の影が濃すぎます。',
      comment: `盗作率${result.rate}%です。語を借りたというより、元句の骨格まで持ち出しています。`,
    };
  }
  if (result.rate >= 30) {
    return {
      level: 'influenced',
      title: '独立作品とはまだ呼べません。',
      comment: `盗作率${result.rate}%です。借り物同士の関係を、もう一段壊してください。`,
    };
  }
  const irregular = compositionMeta.irregularLines ?? 0;
  return {
    level: 'original',
    title: '独立作品と認定します。',
    comment: irregular > 0
      ? `盗作率${result.rate}%です。定型を外した${irregular}行が、借り物にあなたの呼吸を与えました。`
      : `盗作率${result.rate}%です。借り物だけで、元句とは別の景色を作りました。`,
  };
}
