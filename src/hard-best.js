const BEST_KEY = 'haiku-anthology:plagiarism-best';

export function createHardBestStore(backend = globalThis.localStorage) {
  function get() {
    try {
      const stored = backend?.getItem(BEST_KEY);
      if (stored === null || stored === undefined || stored === '') return null;
      const value = Number(stored);
      return Number.isFinite(value) && value >= 0 && value <= 300 ? value : null;
    } catch {
      return null;
    }
  }

  function record(score) {
    const current = get();
    const best = current === null ? score : Math.max(current, score);
    const isNewBest = current === null || score > current;
    try {
      backend?.setItem(BEST_KEY, String(best));
      return { best, isNewBest, persisted: true };
    } catch {
      return { best, isNewBest, persisted: false };
    }
  }

  return { get, record };
}
