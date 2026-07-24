import { score } from './scoring.js';
import { critique } from './critics.js';

/** seed.json の {author, cardIds} を、実カードを持つ Entry に変換。 */
export function buildSeedEntries(seedJson, byId) {
  return seedJson
    .map((s) => ({ author: s.author, cards: s.cardIds.map((id) => byId.get(id)) }))
    .filter((e) => e.cards.every(Boolean) && e.cards.length === 3);
}

/**
 * Entry[] を採点・講評付きで並べる。順位は「3俳人の合計点（300点満点）」の降順。
 * poetTotal = 宗匠・若手・翁の点の合計（各0〜100）。
 */
export function rankEntries(entries) {
  return entries
    .map((e) => {
      const s = score(e.cards);
      const critiques = critique(s);
      const poetTotal = critiques.reduce((sum, c) => sum + c.score, 0);
      return {
        ...e,
        fuuryuu: s.fuuryuu,
        surreal: s.surreal,
        total: s.fuuryuu + s.surreal,
        poetTotal,
        critiques,
      };
    })
    .sort((a, b) => b.poetTotal - a.poetTotal);
}
