/** 決定的な擬似乱数生成器（mulberry32）。 */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 配列から n 枚を非復元でランダム抽出（元配列は不変）。 */
function sample(arr, n, rng) {
  const pool = arr.slice();
  const out = [];
  const k = Math.min(n, pool.length);
  for (let i = 0; i < k; i++) {
    const idx = Math.floor(rng() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

/**
 * 手札を配る。デッキ全体からの抽出なので何度でも配れる（枯渇しない）。
 * @returns {{fives: object[], sevens: object[]}}
 */
export function dealHand(deck, rng, { fives = 4, sevens = 3 } = {}) {
  return {
    fives: sample(deck.fives, fives, rng),
    sevens: sample(deck.sevens, sevens, rng),
  };
}
