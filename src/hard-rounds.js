function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffle(items, rng) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function createRounds(sources, seed = Date.now()) {
  if (sources.length !== 12) throw new Error('source_count_must_be_12');
  const rng = makeRng(seed);
  const shuffledSources = shuffle(sources, rng);
  return [0, 1, 2].map((roundIndex) => {
    const group = shuffledSources.slice(roundIndex * 4, roundIndex * 4 + 4);
    return {
      index: roundIndex,
      sourceIds: group.map((source) => source.id),
      keywordIds: shuffle(group.flatMap((source) => source.keywords.map((keyword) => keyword.id)), rng),
    };
  });
}
