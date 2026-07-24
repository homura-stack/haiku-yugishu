// 各俳人の人物設定と、発火ルール→講評テンプレ。優先度の高い順に最初に一致した1つを採用。
const POETS = {
  sosho: {
    name: '宗匠',
    weight: (s) => Math.round(s.fuuryuu * 0.9 + s.surreal * 0.1),
    lines: [
      ['kigo_present',    '季語がよう効いておる。趣を心得ておるな。'],
      ['tone_consistent', '景の流れに乱れなし。まずは上等。'],
      ['tone_clash',      'ふむ…景がちぐはぐじゃ。落ち着きが足りぬ。'],
      ['cliche_heavy',    '手垢のついた取り合わせよ。工夫を望む。'],
      ['*',               '悪くはない。精進あるのみ。'],
    ],
  },
  wakate: {
    name: '毒舌の若手',
    weight: (s) => Math.round(s.surreal * 0.9 + s.fuuryuu * 0.1),
    lines: [
      ['high_surreal', 'うわ、意味わからん。でもそこが最高、優勝。'],
      ['pos_mismatch', '文法崩壊してるのに成立してるの、ずるい。'],
      ['tone_clash',   '振り幅えぐい。事故と紙一重で好き。'],
      ['cliche_heavy', 'はい教科書。無難すぎて逆に眠い。'],
      ['*',            'まあ…普通。もっと壊していこ。'],
    ],
  },
  okina: {
    name: '天然の翁',
    // 翁は「一芸に秀でた句」を好む：強い方の軸を重く見る（凡庸な句ほど伸びない）。
    weight: (s) => Math.round(Math.max(s.fuuryuu, s.surreal) * 0.7 + Math.min(s.fuuryuu, s.surreal) * 0.3),
    lines: [
      ['tone_consistent', 'ほほ、なんだか穏やかでええのう。'],
      ['kigo_present',    '季節を感じるわい。茶でも飲むかの。'],
      ['high_surreal',    'ようわからんが…元気があってよろしい。'],
      ['*',               'うむ。ところで今日は良い天気じゃ。'],
    ],
  },
};

function pickLine(poet, fired) {
  for (const [rule, text] of poet.lines) {
    if (rule === '*' || fired.includes(rule)) return text;
  }
  return poet.lines[poet.lines.length - 1][1];
}

/**
 * 採点結果から3人の講評を生成する純関数。
 * @param {{fuuryuu:number, surreal:number, fired:string[]}} scoreResult
 * @returns {{poet:string, name:string, score:number, comment:string}[]}
 */
export function critique(scoreResult) {
  return ['sosho', 'wakate', 'okina'].map((key) => {
    const poet = POETS[key];
    return {
      poet: key,
      name: poet.name,
      score: poet.weight(scoreResult),
      comment: pickLine(poet, scoreResult.fired),
    };
  });
}
