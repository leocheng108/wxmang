import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
/**
 * 外部网页正文的本地缓存。
 * 只缓存抓取成功的正文，避免重复计费；内容不进入 Solr。
 */
export class DeepSeekDocumentCache {
    db;
    constructor(filePath) {
        mkdirSync(dirname(filePath), { recursive: true });
        this.db = new Database(filePath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('busy_timeout = 5000');
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS external_documents (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        source TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_external_fetched
        ON external_documents (fetched_at);
    `);
    }
    get(id) {
        const row = this.db
            .prepare('SELECT id, url, title, content, source, updated_at AS updatedAt, fetched_at AS fetchedAt FROM external_documents WHERE id = ?')
            .get(id);
        return row ?? null;
    }
    put(document) {
        this.db
            .prepare(`
        INSERT INTO external_documents (id, url, title, content, source, updated_at, fetched_at)
        VALUES (@id, @url, @title, @content, @source, @updatedAt, @fetchedAt)
        ON CONFLICT(id) DO UPDATE SET
          url = excluded.url,
          title = excluded.title,
          content = excluded.content,
          source = excluded.source,
          updated_at = excluded.updated_at,
          fetched_at = excluded.fetched_at
      `)
            .run(document);
    }
    purgeBefore(beforeIso) {
        return this.db.prepare('DELETE FROM external_documents WHERE fetched_at < ?').run(beforeIso)
            .changes;
    }
    close() {
        this.db.close();
    }
}
//# sourceMappingURL=DeepSeekDocumentCache.js.map