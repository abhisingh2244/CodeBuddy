// src/db.js
// Provides run history persistence. If `better-sqlite3` is available
// we use it; otherwise fall back to a lightweight in-memory+JSON
// implementation so the app can run without native build tools.

const path = require('path');
const fs = require('fs');

let db = null;
let _impl = null;

try {
  const Database = require('better-sqlite3');
  const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'codebuddy.db');
  db = new Database(DB_PATH);

  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      language TEXT NOT NULL,
      source_preview TEXT NOT NULL,
      status TEXT NOT NULL,
      exec_time_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at);
    CREATE INDEX IF NOT EXISTS idx_runs_language ON runs(language);
    CREATE INDEX IF NOT EXISTS idx_runs_session ON runs(session_id);
  `);

  const insertRun = db.prepare(`
    INSERT INTO runs (session_id, language, source_preview, status, exec_time_ms)
    VALUES (@session_id, @language, @source_preview, @status, @exec_time_ms)
  `);

  _impl = {
    recordRun({ sessionId, language, source, status, execTimeMs }) {
      const preview = (source || '').slice(0, 120);
      insertRun.run({
        session_id: sessionId,
        language,
        source_preview: preview,
        status,
        exec_time_ms: execTimeMs ?? null,
      });
    },

    getRecentRuns(sessionId, limit = 20) {
      return db
        .prepare('SELECT id, language, source_preview, status, exec_time_ms, created_at FROM runs WHERE session_id = ? ORDER BY id DESC LIMIT ?')
        .all(sessionId, limit);
    },

    getStats(sessionId) {
      const totals = db
        .prepare("SELECT COUNT(*) AS total_runs, SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successful_runs FROM runs WHERE session_id = ?")
        .get(sessionId);

      const byLanguage = db
        .prepare(`
          SELECT language, COUNT(*) AS count, AVG(exec_time_ms) AS avg_exec_ms
          FROM runs
          WHERE session_id = ?
          GROUP BY language
          ORDER BY count DESC
        `)
        .all(sessionId);

      return {
        total_runs: totals.total_runs || 0,
        successful_runs: totals.successful_runs || 0,
        success_rate: totals.total_runs ? (totals.successful_runs / totals.total_runs) : 0,
        by_language: byLanguage,
      };
    },
  };
} catch (err) {
  // Fallback: in-memory store optionally persisted to JSON file.
  const JSON_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'codebuddy.json');
  let store = [];

  try {
    if (fs.existsSync(JSON_PATH)) {
      const raw = fs.readFileSync(JSON_PATH, 'utf8');
      store = JSON.parse(raw || '[]');
    }
  } catch (e) {
    store = [];
  }

  function persist() {
    try {
      fs.writeFileSync(JSON_PATH, JSON.stringify(store, null, 2), 'utf8');
    } catch (e) {
      // ignore persistence errors
    }
  }

  _impl = {
    recordRun({ sessionId, language, source, status, execTimeMs }) {
      const id = store.length ? (store[store.length - 1].id + 1) : 1;
      const preview = (source || '').slice(0, 120);
      const entry = {
        id,
        session_id: sessionId,
        language,
        source_preview: preview,
        status,
        exec_time_ms: execTimeMs ?? null,
        created_at: new Date().toISOString(),
      };
      store.push(entry);
      persist();
    },

    getRecentRuns(sessionId, limit = 20) {
      const items = store.filter(r => r.session_id === sessionId).slice(-limit).reverse();
      return items;
    },

    getStats(sessionId) {
      const sessionRuns = store.filter(r => r.session_id === sessionId);
      const total_runs = sessionRuns.length;
      const successful_runs = sessionRuns.filter(r => r.status === 'success').length;
      const by_language_map = {};
      for (const r of sessionRuns) {
        const lang = r.language || 'unknown';
        if (!by_language_map[lang]) by_language_map[lang] = { language: lang, count: 0, total_ms: 0 };
        by_language_map[lang].count += 1;
        if (typeof r.exec_time_ms === 'number') by_language_map[lang].total_ms += r.exec_time_ms;
      }
      const by_language = Object.values(by_language_map).map(x => ({ language: x.language, count: x.count, avg_exec_ms: x.count ? Math.round(x.total_ms / x.count) : null }));
      by_language.sort((a, b) => b.count - a.count);

      return {
        total_runs,
        successful_runs,
        success_rate: total_runs ? (successful_runs / total_runs) : 0,
        by_language,
      };
    },
  };
}

module.exports = { recordRun: (...args) => _impl.recordRun(...args), getRecentRuns: (...args) => _impl.getRecentRuns(...args), getStats: (...args) => _impl.getStats(...args), db };
