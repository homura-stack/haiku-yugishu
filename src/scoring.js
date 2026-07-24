const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 3枚のトーンの散らばり（motion幅 + brightness幅）。小さいほど一貫。 */
function toneSpread(cards) {
  const ms = cards.map((c) => c.tone.motion);
  const bs = cards.map((c) => c.tone.brightness);
  return (Math.max(...ms) - Math.min(...ms)) + (Math.max(...bs) - Math.min(...bs));
}

/**
 * 俳句（順序付き3枚）を二軸で採点する純関数。
 * @param {object[]} cards - [5音, 7音, 5音]
 * @returns {{fuuryuu: number, surreal: number, fired: string[]}}
 */
export function score(cards) {
  const fired = [];

  const hasKigo = cards.some((c) => c.kigo);
  if (hasKigo) fired.push('kigo_present');

  const spread = toneSpread(cards);
  const toneConsistent = spread <= 4;
  fired.push(toneConsistent ? 'tone_consistent' : 'tone_clash');

  const posMismatch = new Set(cards.map((c) => c.pos)).size === 3;
  if (posMismatch) fired.push('pos_mismatch');

  const surrealSum = cards.reduce((s, c) => s + c.surreal, 0);
  if (surrealSum >= 5) fired.push('high_surreal');

  const clicheCount = cards.filter((c) => c.cliche).length;
  if (clicheCount >= 2) fired.push('cliche_heavy');

  // 風流：季語＋トーン一貫の王道を強く評価。シュール要素で大きく減点（振り幅重視）。
  let fuuryuu = 15;
  if (hasKigo) fuuryuu += 40;
  fuuryuu += toneConsistent ? 30 : -20;
  if (hasKigo && toneConsistent) fuuryuu += 15; // 王道コンボ加点
  fuuryuu -= surrealSum * 5;
  fuuryuu = clamp(Math.round(fuuryuu), 0, 100);

  // シュール：トーン激突・高シュール・品詞崩しを強く加点。ベタ札で大きく減点。
  let surreal = 5;
  surreal += toneConsistent ? -10 : 45;
  surreal += surrealSum * 9;
  if (posMismatch) surreal += 20;
  surreal -= clicheCount * 15;
  surreal = clamp(Math.round(surreal), 0, 100);

  return { fuuryuu, surreal, fired };
}
