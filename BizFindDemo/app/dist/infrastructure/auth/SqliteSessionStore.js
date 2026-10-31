import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import session from 'express-session';
function sidHash(sid) {
    return createHash('sha256').update(sid).digest('hex');
}
/**
 * 服务端会话存储：Cookie 中只放随机 sid，数据库存 sid 的 SHA-256。
 * 单实例 SQLite；多实例时替换为 Redis/PostgreSQL。
 */
export class SqliteSessionStore extends session.Store {
    ttlMs;
    db;
    constructor(filePath, ttlMs = 8 * 60 * 60 * 1000) {
        super();
        this.ttlMs = ttlMs;
        mkdirSync(dirname(filePath), { recursive: true });
        this.db = new Database(filePath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('busy_timeout = 5000');
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        sid_hash TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires
        ON auth_sessions (expires_at);
    `);
    }
    get(sid, callback) {
        try {
            const key = sidHash(sid);
            const row = this.db
                .prepare('SELECT data, expires_at FROM auth_sessions WHERE sid_hash = ?')
                .get(key);
            if (!row) {
                callback(null, null);
                return;
            }
            if (row.expires_at <= Date.now()) {
                this.db.prepare('DELETE FROM auth_sessions WHERE sid_hash = ?').run(key);
                callback(null, null);
                return;
            }
            callback(null, JSON.parse(row.data));
        }
        catch (error) {
            callback(error);
        }
    }
    set(sid, sess, callback) {
        try {
            const expiry = sess.cookie.expires
                ? new Date(sess.cookie.expires).getTime()
                : Date.now() + this.ttlMs;
            this.db
                .prepare(`
          INSERT INTO auth_sessions (sid_hash, data, expires_at)
          VALUES (?, ?, ?)
          ON CONFLICT(sid_hash) DO UPDATE SET
            data = excluded.data,
            expires_at = excluded.expires_at
        `)
                .run(sidHash(sid), JSON.stringify(sess), expiry);
            callback?.();
        }
        catch (error) {
            callback?.(error);
        }
    }
    touch(sid, sess, callback) {
        try {
            const expiry = sess.cookie.expires
                ? new Date(sess.cookie.expires).getTime()
                : Date.now() + this.ttlMs;
            this.db
                .prepare('UPDATE auth_sessions SET expires_at = ? WHERE sid_hash = ?')
                .run(expiry, sidHash(sid));
            callback?.();
        }
        catch (error) {
            callback?.(error);
        }
    }
    destroy(sid, callback) {
        try {
            this.db.prepare('DELETE FROM auth_sessions WHERE sid_hash = ?').run(sidHash(sid));
            callback?.();
        }
        catch (error) {
            callback?.(error);
        }
    }
    clear(callback) {
        try {
            this.db.prepare('DELETE FROM auth_sessions').run();
            callback?.();
        }
        catch (error) {
            callback?.(error);
        }
    }
    close() {
        this.db.close();
    }
}
//# sourceMappingURL=SqliteSessionStore.js.map