import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
function toUser(row) {
    return {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        role: row.role,
        disabled: Boolean(row.disabled),
        createdAt: row.created_at,
    };
}
export class SqliteUserStore {
    db;
    constructor(filePath) {
        mkdirSync(dirname(filePath), { recursive: true });
        this.db = new Database(filePath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('busy_timeout = 5000');
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS local_users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
        disabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_local_users_role ON local_users (role);
    `);
    }
    findByUsername(username) {
        const row = this.db
            .prepare('SELECT * FROM local_users WHERE username = ? AND disabled = 0')
            .get(username.trim());
        if (!row)
            return null;
        return { ...toUser(row), passwordHash: row.password_hash };
    }
    hasAdmin() {
        const row = this.db
            .prepare("SELECT 1 FROM local_users WHERE role = 'admin' AND disabled = 0 LIMIT 1")
            .get();
        return Boolean(row);
    }
    list() {
        return this.db
            .prepare('SELECT * FROM local_users ORDER BY role DESC, created_at ASC')
            .all().map(toUser);
    }
    create(input) {
        const now = new Date().toISOString();
        this.db
            .prepare(`INSERT INTO local_users
          (id, username, password_hash, display_name, role, disabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`)
            .run(input.id, input.username.trim(), input.passwordHash, input.displayName.trim(), input.role, now, now);
        return {
            id: input.id,
            username: input.username.trim(),
            displayName: input.displayName.trim(),
            role: input.role,
            disabled: false,
            createdAt: now,
        };
    }
    close() {
        this.db.close();
    }
}
//# sourceMappingURL=SqliteUserStore.js.map