import { compositionLineReading, normalizeReading } from './hard-mora.js';

export function buildKeywordMap(sources) {
  return new Map(sources.flatMap((source) => source.keywords).map((keyword) => [keyword.id, keyword]));
}

function levenshtein(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[b.length];
}

function similarity(a, b) {
  if (!a.length && !b.length) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);
}

function scoreAgainstSource(composition, source, keywordMap) {
  const sourceKeywordMap = new Map(source.keywords.map((keyword) => [keyword.id, keyword]));
  const totalWeight = source.keywords.reduce((sum, keyword) => sum + keyword.weight, 0);
  const selected = [];
  composition.lines.forEach((segments, lineIndex) => {
    segments.forEach((segment) => {
      const keyword = segment.type === 'keyword' ? sourceKeywordMap.get(segment.keywordId) : null;
      if (keyword) selected.push({ ...keyword, lineIndex });
    });
  });
  const matchedWeight = selected.reduce((sum, keyword) => sum + keyword.weight, 0);
  const keywordScore = Math.round(50 * matchedWeight / totalWeight);

  let orderedWeight = 0;
  let lastOrder = -1;
  for (const keyword of selected) {
    if (keyword.sourceOrder > lastOrder && keyword.sourceLine === keyword.lineIndex) {
      orderedWeight += keyword.weight;
      lastOrder = keyword.sourceOrder;
    }
  }
  const orderScore = Math.round(20 * orderedWeight / totalWeight);
  const composedReading = composition.lines
    .map((segments) => compositionLineReading(segments, keywordMap))
    .join('');
  const sourceReading = source.lines.map((line) => line.reading).join('');
  const readingScore = Math.round(30 * similarity(
    normalizeReading(composedReading),
    normalizeReading(sourceReading),
  ));
  return {
    rate: Math.max(0, Math.min(100, keywordScore + orderScore + readingScore)),
    keywordScore,
    orderScore,
    readingScore,
  };
}

export function scorePlagiarism(composition, sources, keywordMap = buildKeywordMap(sources)) {
  const scored = sources.map((source) => ({
    ...scoreAgainstSource(composition, source, keywordMap),
    closestSourceId: source.id,
  })).sort((a, b) => b.rate - a.rate || a.closestSourceId.localeCompare(b.closestSourceId));
  const best = scored[0];
  return { ...best, originalityPoints: 100 - best.rate };
}
