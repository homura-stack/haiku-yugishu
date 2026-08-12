const SMALL_KANA = new Set([...`ゃゅょぁぃぅぇぉゎ`]);
const IGNORED = /[\s　、。,.!！?？「」『』・]/g;

export function normalizeReading(value) {
  return String(value ?? '').trim().replace(IGNORED, '');
}

export function validateReading(value) {
  const normalized = normalizeReading(value);
  return {
    valid: normalized.length > 0 && /^[ぁ-ゖー]+$/.test(normalized),
    normalized,
  };
}

export function countMora(value) {
  const normalized = normalizeReading(value);
  let count = 0;
  for (const char of normalized) {
    if (!SMALL_KANA.has(char)) count += 1;
  }
  return count;
}

export function compositionLineReading(segments, keywordMap) {
  return segments.map((segment) => (
    segment.type === 'keyword'
      ? keywordMap.get(segment.keywordId)?.reading ?? ''
      : segment.reading ?? ''
  )).join('');
}

export function compositionLineDisplay(segments, keywordMap) {
  return segments.map((segment) => (
    segment.type === 'keyword'
      ? keywordMap.get(segment.keywordId)?.display ?? ''
      : segment.display ?? ''
  )).join('');
}

export function validateComposition(composition, keywordMap) {
  const targets = [5, 7, 5];
  const errors = [];
  const usedKeywordIds = [];
  const lines = composition.lines.map((segments, index) => {
    const keywordSegments = segments.filter((segment) => segment.type === 'keyword');
    if (keywordSegments.length === 0) errors.push(`line_${index}_keyword_required`);
    usedKeywordIds.push(...keywordSegments.map((segment) => segment.keywordId));

    for (const segment of segments.filter((item) => item.type === 'free')) {
      const displayPresent = String(segment.display ?? '').trim().length > 0;
      const reading = validateReading(segment.reading);
      if (!displayPresent || !reading.valid) errors.push(`line_${index}_free_text_invalid`);
    }

    const reading = compositionLineReading(segments, keywordMap);
    const mora = countMora(reading);
    const delta = mora - targets[index];
    if (delta < -2 || delta > 2) errors.push(`line_${index}_out_of_range`);
    return { reading, mora, target: targets[index], delta };
  });

  if (new Set(usedKeywordIds).size !== usedKeywordIds.length) errors.push('keyword_reused');
  return { valid: errors.length === 0, errors: [...new Set(errors)], lines };
}
