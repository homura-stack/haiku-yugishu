export function createComposer() {
  const lines = [[], [], []];

  function validLine(index) {
    return Number.isInteger(index) && index >= 0 && index < 3;
  }

  function addKeyword(lineIndex, keywordId) {
    if (!validLine(lineIndex)) return false;
    const alreadyUsed = lines.some((line) => line.some(
      (segment) => segment.type === 'keyword' && segment.keywordId === keywordId,
    ));
    if (alreadyUsed) return false;
    lines[lineIndex].push({ type: 'keyword', keywordId });
    return true;
  }

  function addFreeText(lineIndex, display, reading) {
    if (!validLine(lineIndex)) return false;
    lines[lineIndex].push({ type: 'free', display, reading });
    return true;
  }

  function moveSegment(lineIndex, from, to) {
    if (!validLine(lineIndex) || !lines[lineIndex][from] || to < 0 || to >= lines[lineIndex].length) return false;
    const [segment] = lines[lineIndex].splice(from, 1);
    lines[lineIndex].splice(to, 0, segment);
    return true;
  }

  function removeSegment(lineIndex, position) {
    if (!validLine(lineIndex) || !lines[lineIndex][position]) return false;
    lines[lineIndex].splice(position, 1);
    return true;
  }

  function snapshot() {
    return { lines: lines.map((line) => line.map((segment) => ({ ...segment }))) };
  }

  return { addKeyword, addFreeText, moveSegment, removeSegment, snapshot };
}
