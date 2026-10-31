import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
/**
 * 外部 API 调用账本。与内部检索历史分开存储，避免把“用户检索”和“API 调用”混在一起。
 */
export class SqliteExternalUsageStore {
    db;
    insert;
    constructor(filePath) {
        mkdirSync(dirname(filePath), { recursive: true });
        this.db = new Database(filePath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('busy_timeout = 5000');
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS external_usage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_day TEXT NOT NULL,
        operation TEXT NOT NULL,
        outcome TEXT NOT NULL,
        billable INTEGER NOT NULL DEFAULT 0,
        cost_yuan REAL NOT NULL DEFAULT 0,
        latency_ms INTEGER,
        error TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_external_usage_day
        ON external_usage_events (event_day, operation, outcome);
    `);
        this.insert = this.db.prepare(`
      INSERT INTO external_usage_events
        (event_day, operation, outcome, billable, cost_yuan, latency_ms, error, created_at)
      VALUES
        (@eventDay, @operation, @outcome, @billable, @costYuan, @latencyMs, @error, @createdAt)
    `);
    }
    record(event) {
        this.insert.run({
            eventDay: event.eventDay,
            operation: event.operation,
            outcome: event.outcome,
            billable: event.billable ? 1 : 0,
            costYuan: event.costYuan,
            latencyMs: event.latencyMs ?? null,
            error: event.error ?? null,
            createdAt: event.createdAt,
        });
    }
    async daily(fromDay, toDay) {
        const rows = this.db
            .prepare(`
        SELECT
          event_day AS date,
          operation,
          outcome,
          COUNT(*) AS count,
          COALESCE(SUM(cost_yuan), 0) AS costYuan
        FROM external_usage_events
        WHERE event_day BETWEEN ? AND ?
        GROUP BY event_day, operation, outcome
        ORDER BY event_day
      `)
            .all(fromDay, toDay);
        return rows.map((row) => ({ ...row, count: Number(row.count), costYuan: Number(row.costYuan) }));
    }
    async purge(beforeDay) {
        return this.db.prepare('DELETE FROM external_usage_events WHERE event_day < ?').run(beforeDay)
            .changes;
    }
    close() {
        this.db.close();
    }
}
//# sourceMappingURL=SqliteExternalUsageStore.js.map