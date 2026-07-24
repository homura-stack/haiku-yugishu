/**
 * deck.json のオブジェクトを受け取り、扱いやすい形へ整える。
 * @param {{fives: object[], sevens: object[]}} json
 */
export function loadDeck(json) {
  const fives = json.fives ?? [];
  const sevens = json.sevens ?? [];
  const byId = new Map();
  for (const c of [...fives, ...sevens]) byId.set(c.id, c);
  return { fives, sevens, byId };
}

const PRESET_CARD_NUMBERS = {
  season: {
    fives: new Set([1, 2, 7, 9, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 53, 60, 63, 75]),
    sevens: new Set([1, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 39, 40, 41, 43]),
  },
  daily: {
    fives: new Set([3, 5, 10, 12, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 42, 46, 47, 48, 49, 50, 51, 52, 82]),
    sevens: new Set([3, 4, 5, 6, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 38]),
  },
  poetic: {
    fives: new Set(Array.from({ length: 24 }, (_, index) => index + 93)),
    sevens: new Set(Array.from({ length: 16 }, (_, index) => index + 64)),
  },
};

const cardNumber = (card) => Number(card.id.slice(2));

/**
 * 説明画面で選んだデッキに応じて、元データを壊さずカードプールを切り替える。
 * @param {{fives: object[], sevens: object[]}} json
 * 通常デッキはすべて五音24枚・七音16枚の計40枚。
 * @param {'season'|'daily'|'poetic'|'mixed'} preset
 */
export function selectDeck(json, preset = 'mixed') {
  if (preset === 'mixed') return { fives: [...json.fives], sevens: [...json.sevens] };
  const selected = PRESET_CARD_NUMBERS[preset] ?? PRESET_CARD_NUMBERS.season;
  return {
    fives: json.fives.filter((card) => selected.fives.has(cardNumber(card))),
    sevens: json.sevens.filter((card) => selected.sevens.has(cardNumber(card))),
  };
}
