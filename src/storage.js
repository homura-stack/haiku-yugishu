const KEY = 'copipe-haiku:history';

/**
 * localStorage 互換 backend を注入して使うストア。
 * backend は getItem/setItem を持つオブジェクト。
 */
export function createStore(backend = globalThis.localStorage) {
  function loadHistory() {
    try {
      const raw = backend.getItem(KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  return {
    loadHistory,
    saveSession(session) {
      try {
        const hist = loadHistory();
        hist.push(session);
        backend.setItem(KEY, JSON.stringify(hist));
        return true;
      } catch {
        return false;
      }
    },
    bestTotal() {
      return loadHistory().reduce((m, s) => Math.max(m, s.bestTotal ?? 0), 0);
    },
  };
}
