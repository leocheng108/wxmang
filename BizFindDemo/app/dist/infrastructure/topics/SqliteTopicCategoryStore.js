import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
function normalizeName(raw) {
    return raw
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\|+$/g, '')
        .slice(0, 40);
}
function categoryId(name) {
    return `cat-${createHash('sha1').update(name).digest('hex').slice(0, 12)}`;
}
/**
 * 分类管理的分类存储。
 * 分类和主帖是显式多对多关系；只由主帖页面的归类操作写入。
 * 当前只允许两级：parent_id 指向一级分类，二级分类不能再有子分类。
 */
export class SqliteTopicCategoryStore {
    db;
    constructor(dbPath) {
        mkdirSync(dirname(dbPath), { recursive: true });
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS topic_categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        parent_id TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS topic_assignments (
        category_id TEXT NOT NULL,
        doc_id TEXT NOT NULL,
        assigned_at TEXT NOT NULL,
        PRIMARY KEY (category_id, doc_id)
      );
      CREATE INDEX IF NOT EXISTS topic_assignments_doc ON topic_assignments(doc_id);
    `);
        const columns = this.db.pragma('table_info(topic_categories)');
        if (!columns.some((column) => column.name === 'parent_id')) {
            this.db.exec('ALTER TABLE topic_categories ADD COLUMN parent_id TEXT');
        }
        this.db.exec('CREATE INDEX IF NOT EXISTS topic_categories_parent ON topic_categories(parent_id)');
    }
    list() {
        return this.db
            .prepare(`SELECT c.id, c.name, c.parent_id AS parentId,
                COUNT(a.doc_id) AS count,
                COUNT(a.doc_id) AS directCount
           FROM topic_categories c
           LEFT JOIN topic_assignments a ON a.category_id = c.id
          GROUP BY c.id, c.name, c.parent_id
          ORDER BY count DESC, c.name COLLATE NOCASE`)
            .all();
    }
    find(id) {
        return this.db
            .prepare(`SELECT c.id, c.name, c.parent_id AS parentId,
                (SELECT COUNT(*) FROM topic_assignments a WHERE a.category_id = c.id) AS count
           FROM topic_categories c
          WHERE c.id = ?`)
            .get(id);
    }
    findByName(name) {
        return this.db
            .prepare(`SELECT c.id, c.name, c.parent_id AS parentId,
                (SELECT COUNT(*) FROM topic_assignments a WHERE a.category_id = c.id) AS count
           FROM topic_categories c
          WHERE c.name = ?`)
            .get(normalizeName(name));
    }
    children(parentId) {
        return this.db
            .prepare(`SELECT c.id, c.name, c.parent_id AS parentId,
                COUNT(a.doc_id) AS count,
                COUNT(a.doc_id) AS directCount
           FROM topic_categories c
           LEFT JOIN topic_assignments a ON a.category_id = c.id
          WHERE c.parent_id = ?
          GROUP BY c.id, c.name, c.parent_id
          ORDER BY count DESC, c.name COLLATE NOCASE`)
            .all(parentId);
    }
    ensure(name, parentId) {
        const clean = normalizeName(name);
        if (!clean)
            throw new Error('分类名称不能为空');
        const parent = parentId ? this.find(parentId) : undefined;
        if (parentId && !parent)
            throw new Error('父分类不存在');
        if (parent?.parentId)
            throw new Error('二级分类不能再创建下级分类');
        const existing = this.findByName(clean);
        if (existing) {
            const existingParent = existing.parentId ?? null;
            const requestedParent = parentId ?? null;
            if (existingParent !== requestedParent) {
                throw new Error('该名称已存在于其他分类层级');
            }
            return { ...existing, count: this.count(existing.id) };
        }
        const id = categoryId(clean);
        this.db
            .prepare('INSERT OR IGNORE INTO topic_categories(id, name, parent_id, created_at) VALUES (?, ?, ?, ?)')
            .run(id, clean, parentId ?? null, new Date().toISOString());
        return { id, name: clean, parentId: parentId ?? undefined, count: 0 };
    }
    /** 反查：这篇文档被归到哪些分类（子分类优先） */
    categoriesOfDoc(docId) {
        return this.db
            .prepare(`SELECT c.id, c.name, c.parent_id AS parentId
           FROM topic_categories c
           JOIN topic_assignments a ON a.category_id = c.id
          WHERE a.doc_id = ?
          ORDER BY (c.parent_id IS NOT NULL) DESC, c.name`)
            .all(docId);
    }
    count(id) {
        const row = this.db
            .prepare('SELECT COUNT(*) AS count FROM topic_assignments WHERE category_id = ?')
            .get(id);
        return Number(row.count);
    }
    docIds(categoryId) {
        const rows = this.db
            .prepare('SELECT doc_id FROM topic_assignments WHERE category_id = ? ORDER BY doc_id')
            .all(categoryId);
        return rows.map((row) => row.doc_id);
    }
    /** 一级分类检索包含自身以及所有二级子分类的主帖。 */
    docIdsDeep(categoryId) {
        const rows = this.db
            .prepare(`SELECT DISTINCT doc_id FROM topic_assignments
          WHERE category_id = ?
             OR category_id IN (SELECT id FROM topic_categories WHERE parent_id = ?)
          ORDER BY doc_id`)
            .all(categoryId, categoryId);
        return rows.map((row) => row.doc_id);
    }
    /**
     * 删除分类：子分类一并删除，归档关系解除，文档本身不受影响。
     * 只删结构，不删内容——这是记录与推断的分界。
     */
    deleteCategory(id) {
        const category = this.find(id);
        if (!category)
            throw new Error('分类不存在');
        const children = this.children(id).map((child) => child.id);
        const targets = [id, ...children];
        const placeholders = targets.map(() => "?").join(",");
        const transaction = this.db.transaction(() => {
            const unassign = this.db.prepare(`DELETE FROM topic_assignments WHERE category_id IN (${placeholders})`);
            const removed = unassign.run(...targets).changes;
            const drop = this.db.prepare(`DELETE FROM topic_categories WHERE id IN (${placeholders})`);
            drop.run(...targets);
            return removed;
        });
        const unassigned = transaction();
        return { unassigned, deleted: targets, categories: this.list() };
    }
    assignedDocCount() {
        const row = this.db
            .prepare('SELECT COUNT(DISTINCT doc_id) AS count FROM topic_assignments')
            .get();
        return Number(row.count);
    }
    assign(docIds, input) {
        const category = input.categoryId
            ? this.find(input.categoryId)
            : input.categoryName
                ? this.ensure(input.categoryName)
                : undefined;
        if (!category)
            throw new Error('请选择分类或输入新分类');
        const unique = [...new Set(docIds.map((id) => id.trim()).filter(Boolean))];
        if (unique.length === 0)
            throw new Error('请先选择主帖');
        if (unique.length > 200)
            throw new Error('单次最多归类 200 条主帖');
        const insert = this.db.prepare('INSERT OR IGNORE INTO topic_assignments(category_id, doc_id, assigned_at) VALUES (?, ?, ?)');
        const now = new Date().toISOString();
        const transaction = this.db.transaction((ids) => {
            let added = 0;
            for (const id of ids) {
                added += insert.run(category.id, id, now).changes;
            }
            return added;
        });
        const added = transaction(unique);
        return {
            category: { ...category, count: this.count(category.id) },
            added,
        };
    }
    unassign(docIds, categoryId) {
        const category = this.find(categoryId);
        if (!category)
            throw new Error('分类不存在');
        const unique = [...new Set(docIds.map((id) => id.trim()).filter(Boolean))];
        if (unique.length === 0)
            throw new Error('请先选择主帖');
        const remove = this.db.prepare('DELETE FROM topic_assignments WHERE category_id = ? AND doc_id = ?');
        const transaction = this.db.transaction((ids) => {
            let removed = 0;
            for (const id of ids)
                removed += remove.run(category.id, id).changes;
            return removed;
        });
        const removed = transaction(unique);
        return {
            category: { ...category, count: this.count(category.id) },
            removed,
        };
    }
    seed(assignments) {
        const transaction = this.db.transaction(() => {
            for (const [name, ids] of assignments) {
                const clean = normalizeName(name);
                if (!clean)
                    continue;
                const category = this.ensure(clean);
                const insert = this.db.prepare('INSERT OR IGNORE INTO topic_assignments(category_id, doc_id, assigned_at) VALUES (?, ?, ?)');
                const now = new Date().toISOString();
                for (const id of ids) {
                    if (id.trim())
                        insert.run(category.id, id.trim(), now);
                }
            }
        });
        transaction();
    }
    close() {
        this.db.close();
    }
}
//# sourceMappingURL=SqliteTopicCategoryStore.js.map