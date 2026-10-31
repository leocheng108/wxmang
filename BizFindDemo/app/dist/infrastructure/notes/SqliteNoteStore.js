import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { classifyAnnotation, familyOf, isMarkFamily, isMarkKind, } from '../../domain/content/marks.js';
const MAX_NOTE_LENGTH = 20_000;
const SELECT_COLUMNS = `id, doc_id AS docId, kind, content,
  start_offset AS startOffset, end_offset AS endOffset,
  quote, prefix, suffix, paragraph_index AS paragraphIndex,
  mark_family AS markFamily, mark_kind AS markKind, mark_source AS markSource,
  resolved_at AS resolvedAt,
  created_at AS createdAt, updated_at AS updatedAt`;
/**
 * 独立的个人笔记库。
 * 普通笔记与正文批注共用一张表；批注额外保存文本锚点与笔法。
 */
export class SqliteNoteStore {
    db;
    constructor(dbPath) {
        mkdirSync(dirname(dbPath), { recursive: true });
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS document_note_entries (
        id TEXT PRIMARY KEY,
        user_sub TEXT NOT NULL,
        doc_id TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'note',
        content TEXT NOT NULL,
        start_offset INTEGER,
        end_offset INTEGER,
        quote TEXT,
        prefix TEXT,
        suffix TEXT,
        paragraph_index INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS document_note_entries_user_doc
        ON document_note_entries(user_sub, doc_id);
    `);
        this.migrateColumns();
        this.migrateLegacyNotes();
    }
    migrateColumns() {
        const columns = this.db.pragma('table_info(document_note_entries)');
        const names = new Set(columns.map((column) => column.name));
        const additions = [
            ['kind', "TEXT NOT NULL DEFAULT 'note'"],
            ['start_offset', 'INTEGER'],
            ['end_offset', 'INTEGER'],
            ['quote', 'TEXT'],
            ['prefix', 'TEXT'],
            ['suffix', 'TEXT'],
            ['paragraph_index', 'INTEGER'],
            ['mark_family', 'TEXT'],
            ['mark_kind', 'TEXT'],
            ['mark_source', 'TEXT'],
            ['resolved_at', 'TEXT'],
        ];
        for (const [name, definition] of additions) {
            if (names.has(name))
                continue;
            this.db.exec(`ALTER TABLE document_note_entries ADD COLUMN ${name} ${definition}`);
        }
    }
    migrateLegacyNotes() {
        const legacy = this.db
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'document_notes'")
            .get();
        if (!legacy)
            return;
        this.db.exec(`
      INSERT OR IGNORE INTO document_note_entries
        (id, user_sub, doc_id, kind, content, created_at, updated_at)
      SELECT id, user_sub, doc_id, 'note', content, created_at, updated_at FROM document_notes
    `);
    }
    /** 读库时补齐旧数据的笔法：只算不写，保持「读不改数据」 */
    decorate(row) {
        const base = {
            id: row.id,
            docId: row.docId,
            kind: row.kind === 'annotation' ? 'annotation' : 'note',
            content: row.content,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            ...(row.startOffset !== null ? { startOffset: row.startOffset } : {}),
            ...(row.endOffset !== null ? { endOffset: row.endOffset } : {}),
            ...(row.quote ? { quote: row.quote } : {}),
            ...(row.prefix ? { prefix: row.prefix } : {}),
            ...(row.suffix ? { suffix: row.suffix } : {}),
            ...(row.paragraphIndex !== null ? { paragraphIndex: row.paragraphIndex } : {}),
            ...(row.resolvedAt ? { resolvedAt: row.resolvedAt } : {}),
        };
        if (base.kind !== 'annotation')
            return base;
        // 用户手动改过的笔法才冻结；auto 的一律按当前规则重算，规则改进后旧批注也能跟上
        const isUserMark = row.markSource === 'user';
        const storedKind = isMarkKind(row.markKind) ? row.markKind : null;
        if (isUserMark && storedKind) {
            const family = isMarkFamily(row.markFamily)
                ? row.markFamily
                : familyOf(storedKind);
            return { ...base, markKind: storedKind, markFamily: family, markSource: 'user' };
        }
        const computed = classifyAnnotation({ content: base.content, quote: base.quote });
        return {
            ...base,
            markKind: computed.kind,
            markFamily: computed.family,
            markSource: 'auto',
        };
    }
    list(userId, docId) {
        const rows = this.db
            .prepare(`SELECT ${SELECT_COLUMNS} FROM document_note_entries
          WHERE user_sub = ? AND doc_id = ?
          ORDER BY created_at ASC, id ASC`)
            .all(userId, docId);
        return rows.map((row) => this.decorate(row));
    }
    listAll() {
        const rows = this.db
            .prepare(`SELECT user_sub AS userId, ${SELECT_COLUMNS} FROM document_note_entries
          ORDER BY created_at ASC, id ASC`)
            .all();
        return rows.map((row) => ({ ...this.decorate(row), userId: row.userId }));
    }
    save(userId, docId, input) {
        const text = input.content.trim();
        if (!text)
            throw new Error('笔记内容不能为空');
        if (text.length > MAX_NOTE_LENGTH) {
            throw new Error(`笔记不能超过 ${MAX_NOTE_LENGTH} 个字符`);
        }
        const kind = input.kind === 'annotation' ? 'annotation' : 'note';
        if (kind === 'annotation') {
            if (!Number.isInteger(input.startOffset) ||
                !Number.isInteger(input.endOffset) ||
                (input.startOffset ?? -1) < 0 ||
                (input.endOffset ?? -1) <= (input.startOffset ?? -1)) {
                throw new Error('批注缺少有效的正文位置');
            }
            if (!input.quote?.trim())
                throw new Error('批注缺少选中的原文');
        }
        const now = new Date().toISOString();
        const note = {
            id: `note-${randomUUID()}`,
            docId,
            kind,
            content: text,
            ...(kind === 'annotation'
                ? {
                    startOffset: input.startOffset,
                    endOffset: input.endOffset,
                    quote: input.quote?.trim(),
                    prefix: input.prefix?.trim() || undefined,
                    suffix: input.suffix?.trim() || undefined,
                    paragraphIndex: input.paragraphIndex,
                }
                : {}),
            createdAt: now,
            updatedAt: now,
        };
        if (kind === 'annotation') {
            const mark = classifyAnnotation({ content: text, quote: note.quote });
            note.markKind = mark.kind;
            note.markFamily = mark.family;
            note.markSource = 'auto';
        }
        this.db
            .prepare(`INSERT INTO document_note_entries
          (id, user_sub, doc_id, kind, content, start_offset, end_offset, quote, prefix, suffix,
           paragraph_index, mark_family, mark_kind, mark_source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(note.id, userId, docId, note.kind ?? 'note', note.content, note.startOffset ?? null, note.endOffset ?? null, note.quote ?? null, note.prefix ?? null, note.suffix ?? null, note.paragraphIndex ?? null, note.markFamily ?? null, note.markKind ?? null, note.markSource ?? null, note.createdAt, note.updatedAt);
        return note;
    }
    updateMark(userId, noteId, kind) {
        if (!isMarkKind(kind))
            return null;
        const now = new Date().toISOString();
        const result = this.db
            .prepare(`UPDATE document_note_entries
            SET mark_kind = ?, mark_family = ?, mark_source = 'user', updated_at = ?
          WHERE id = ? AND user_sub = ? AND kind = 'annotation'`)
            .run(kind, familyOf(kind), now, noteId, userId);
        if (result.changes === 0)
            return null;
        const row = this.db
            .prepare(`SELECT ${SELECT_COLUMNS} FROM document_note_entries WHERE id = ?`)
            .get(noteId);
        return row ? this.decorate(row) : null;
    }
    setResolved(userId, noteId, resolved) {
        const now = new Date().toISOString();
        const result = this.db
            .prepare(`UPDATE document_note_entries SET resolved_at = ?, updated_at = ?
          WHERE id = ? AND user_sub = ? AND kind = 'annotation'`)
            .run(resolved ? now : null, now, noteId, userId);
        if (result.changes === 0)
            return null;
        const row = this.db
            .prepare(`SELECT ${SELECT_COLUMNS} FROM document_note_entries WHERE id = ?`)
            .get(noteId);
        return row ? this.decorate(row) : null;
    }
    delete(userId, noteId) {
        const result = this.db
            .prepare("DELETE FROM document_note_entries WHERE id = ? AND user_sub = ? AND kind = 'annotation'")
            .run(noteId, userId);
        return result.changes > 0;
    }
    close() {
        this.db.close();
    }
}
//# sourceMappingURL=SqliteNoteStore.js.map