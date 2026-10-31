import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
function normalizeKeyword(keyword) {
    return keyword.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}
function exclusion(query) {
    const cores = (query.excludeCores ?? []).filter((core) => core.length > 0);
    if (cores.length === 0)
        return { clause: '', params: [] };
    return {
        clause: ` AND core NOT IN (${cores.map(() => '?').join(', ')})`,
        params: cores,
    };
}
/**
 * 本地 SQLite 检索历史存储。
 * 单进程、WAL 模式；事件表和日聚合表在同一个事务里更新。
 */
export class SqliteHistoryStore {
    db;
    constructor(filePath) {
        mkdirSync(dirname(filePath), { recursive: true });
        this.db = new Database(filePath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('busy_timeout = 5000');
        this.migrate();
        const insertEvent = this.db.prepare(`
      INSERT OR IGNORE INTO search_events
        (event_id, session_id, keyword, keyword_norm, core, search_day, created_at, source)
      VALUES
        (@eventId, @sessionId, @keyword, @keywordNorm, @core, @searchDay, @createdAt, @source)
    `);
        const bumpDaily = this.db.prepare(`
      INSERT INTO search_daily (search_day, core, keyword_norm, count)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(search_day, core, keyword_norm)
      DO UPDATE SET count = count + 1
    `);
        const unhide = this.db.prepare(`
      DELETE FROM hidden_recent
      WHERE session_id = ? AND keyword_norm = ?
    `);
        this.recordTransaction = this.db.transaction((event) => {
            const result = insertEvent.run({
                eventId: event.eventId,
                sessionId: event.sessionId,
                keyword: event.keyword,
                keywordNorm: normalizeKeyword(event.keywordNorm),
                core: event.core,
                searchDay: event.searchDay,
                createdAt: event.createdAt,
                source: event.source ?? null,
            });
            if (result.changes > 0) {
                bumpDaily.run(event.searchDay, event.core, normalizeKeyword(event.keywordNorm));
            }
            // 再次提交同一检索词时，软隐藏自动解除
            unhide.run(event.sessionId, normalizeKeyword(event.keywordNorm));
        });
    }
    recordTransaction;
    migrate() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS search_events (
        event_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        keyword TEXT NOT NULL,
        keyword_norm TEXT NOT NULL,
        core TEXT NOT NULL,
        search_day TEXT NOT NULL,
        created_at TEXT NOT NULL,
        source TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_events_day
        ON search_events (search_day);

      CREATE INDEX IF NOT EXISTS idx_events_session
        ON search_events (session_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_events_keyword
        ON search_events (search_day, keyword_norm);

      CREATE TABLE IF NOT EXISTS search_daily (
        search_day TEXT NOT NULL,
        core TEXT NOT NULL,
        keyword_norm TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (search_day, core, keyword_norm)
      );

      CREATE INDEX IF NOT EXISTS idx_daily_keyword
        ON search_daily (search_day, keyword_norm);

      CREATE TABLE IF NOT EXISTS hidden_recent (
        session_id TEXT NOT NULL,
        keyword_norm TEXT NOT NULL,
        hidden_at TEXT NOT NULL,
        PRIMARY KEY (session_id, keyword_norm)
      );
    `);
    }
    async record(event) {
        this.recordTransaction({ ...event, keywordNorm: normalizeKeyword(event.keywordNorm) });
    }
    async recent(sessionId, sinceDay, limit) {
        const rows = this.db
            .prepare(`
        SELECT e.keyword, MAX(e.created_at) AS lastUsedAt
        FROM search_events e
        WHERE e.session_id = ? AND e.search_day >= ?
          AND NOT EXISTS (
            SELECT 1 FROM hidden_recent h
            WHERE h.session_id = e.session_id
              AND h.keyword_norm = e.keyword_norm
          )
        GROUP BY e.keyword_norm
        ORDER BY lastUsedAt DESC
        LIMIT ?
      `)
            .all(sessionId, sinceDay, limit);
        return rows.map((row) => ({ keyword: row.keyword, lastUsedAt: row.lastUsedAt }));
    }
    async hideRecent(sessionId, keywordNorm) {
        this.db
            .prepare(`
        INSERT INTO hidden_recent (session_id, keyword_norm, hidden_at)
        VALUES (?, ?, ?)
        ON CONFLICT(session_id, keyword_norm)
        DO UPDATE SET hidden_at = excluded.hidden_at
      `)
            .run(sessionId, normalizeKeyword(keywordNorm), new Date().toISOString());
    }
    async daily(query) {
        const ex = exclusion(query);
        const rows = this.db
            .prepare(`
        SELECT search_day AS date, SUM(count) AS count
        FROM search_daily
        WHERE search_day BETWEEN ? AND ?
          AND (? IS NULL OR core = ?)
          AND (? IS NULL OR keyword_norm = ?)
          ${ex.clause}
        GROUP BY search_day
        ORDER BY search_day
      `)
            .all(query.fromDay, query.toDay, query.core ?? null, query.core ?? null, query.keyword ? normalizeKeyword(query.keyword) : null, query.keyword ? normalizeKeyword(query.keyword) : null, ...ex.params);
        return rows.map((row) => ({ date: row.date, count: Number(row.count) }));
    }
    async topKeywords(query, limit) {
        const ex = exclusion(query);
        const rows = this.db
            .prepare(`
        SELECT keyword, COUNT(*) AS count
        FROM search_events
        WHERE search_day BETWEEN ? AND ?
          AND (? IS NULL OR core = ?)
          AND (? IS NULL OR keyword_norm = ?)
          ${ex.clause}
        GROUP BY keyword_norm
        ORDER BY count DESC
        LIMIT ?
      `)
            .all(query.fromDay, query.toDay, query.core ?? null, query.core ?? null, query.keyword ? normalizeKeyword(query.keyword) : null, query.keyword ? normalizeKeyword(query.keyword) : null, ...ex.params, limit);
        return rows.map((row) => ({ keyword: row.keyword, count: Number(row.count) }));
    }
    async byCore(query) {
        const ex = exclusion(query);
        const rows = this.db
            .prepare(`
        SELECT core, SUM(count) AS count
        FROM search_daily
        WHERE search_day BETWEEN ? AND ?
          AND (? IS NULL OR core = ?)
          AND (? IS NULL OR keyword_norm = ?)
          ${ex.clause}
        GROUP BY core
        ORDER BY count DESC
      `)
            .all(query.fromDay, query.toDay, query.core ?? null, query.core ?? null, query.keyword ? normalizeKeyword(query.keyword) : null, query.keyword ? normalizeKeyword(query.keyword) : null, ...ex.params);
        return rows.map((row) => ({ core: row.core, count: Number(row.count) }));
    }
    async total(query) {
        const ex = exclusion(query);
        const row = this.db
            .prepare(`
        SELECT COUNT(*) AS total, COUNT(DISTINCT session_id) AS sessions
        FROM search_events
        WHERE search_day BETWEEN ? AND ?
          AND (? IS NULL OR core = ?)
          AND (? IS NULL OR keyword_norm = ?)
          ${ex.clause}
      `)
            .get(query.fromDay, query.toDay, query.core ?? null, query.core ?? null, query.keyword ? normalizeKeyword(query.keyword) : null, query.keyword ? normalizeKeyword(query.keyword) : null, ...ex.params);
        return { total: Number(row.total), sessions: Number(row.sessions) };
    }
    async purge(beforeDay) {
        return this.db.transaction(() => {
            const events = this.db.prepare('DELETE FROM search_events WHERE search_day < ?').run(beforeDay);
            const daily = this.db.prepare('DELETE FROM search_daily WHERE search_day < ?').run(beforeDay);
            return { events: events.changes, daily: daily.changes };
        })();
    }
    close() {
        this.db.close();
    }
}
//# sourceMappingURL=SqliteHistoryStore.js.map