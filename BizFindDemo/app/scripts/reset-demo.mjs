#!/usr/bin/env node
/**
 * 把 Demo 恢复到“刚交付”的状态。
 *
 * 清空：笔记与批注、分类与归类、检索历史与最近搜索、登录会话、notes core 文档
 * 保留：用户账号（默认，可用 --reset-users 只留 admin）、索引数据
 *
 * 用法：
 *   node scripts/reset-demo.mjs                 # 交互确认
 *   node scripts/reset-demo.mjs --yes           # 不确认
 *   node scripts/reset-demo.mjs --reset-users    # 顺带删除 admin 以外的账号
 *   node scripts/reset-demo.mjs --yes --no-solr  # 不动 Solr 的 notes core
 *
 * 注意：应用运行中执行也可以，但分类要等下次启动才会重新播种；建议先停止应用。
 */
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, '..'); // scripts/.. → 应用根目录
const dataDir = join(appDir, 'data');
const args = new Set(process.argv.slice(2));
const assumeYes = args.has('--yes');
const resetUsers = args.has('--reset-users');
const skipSolr = args.has('--no-solr');

const solrBase = (process.env.SOLR_URL ?? 'http://127.0.0.1:8983/solr').replace(/\/+$/, '');
const notesCore = process.env.NOTES_SOLR_CORE ?? 'notes_demo';

function openDb(name) {
  const path = join(dataDir, name);
  if (!existsSync(path)) return null;
  return new Database(path);
}

function clearTable(db, table) {
  if (!db) return 0;
  const exists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(table);
  if (!exists) return 0;
  const result = db.prepare(`DELETE FROM ${table}`).run();
  return result.changes;
}

async function confirm() {
  if (assumeYes) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((done) => rl.question('确认清空演示数据？(y/N) ', done));
  rl.close();
  return answer.trim().toLowerCase() === 'y';
}

async function clearNotesCore() {
  if (skipSolr) return 'skipped';
  try {
    const response = await fetch(`${solrBase}/${encodeURIComponent(notesCore)}/update?commit=true`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ delete: { query: '*:*' } }),
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok ? 'ok' : `HTTP ${response.status}`;
  } catch (error) {
    return `跳过（${error instanceof Error ? error.message : String(error)}）`;
  }
}

if (!(await confirm())) {
  console.log('已取消。');
  process.exit(0);
}

const summary = [];

for (const [file, tables] of [
  ['notes.db', ['document_note_entries']],
  ['topic-categories.db', ['topic_assignments', 'topic_categories']],
  ['history.db', ['search_events', 'search_daily', 'hidden_recent']],
  ['auth-session.db', ['auth_sessions']],
]) {
  const db = openDb(file);
  if (!db) {
    summary.push(`${file.padEnd(22)} 不存在，跳过`);
    continue;
  }
  let removed = 0;
  for (const table of tables) removed += clearTable(db, table);
  db.close();
  summary.push(`${file.padEnd(22)} 清理 ${removed} 行`);
}

if (resetUsers) {
  const db = openDb('users.db');
  const removed = db
    ? db.prepare("DELETE FROM local_users WHERE role <> 'admin'").run().changes
    : 0;
  db?.close();
  summary.push(`${'users.db'.padEnd(22)} 删除普通用户 ${removed} 个（保留 admin）`);
}

summary.push(`${'notes core'.padEnd(22)} ${await clearNotesCore()}`);

console.log('重置结果：');
for (const line of summary) console.log('  ' + line);
console.log('\n提示：启动应用后，分类会按 wxmang_demo 的 tagName 重新播种（17 个分类 / 1292 条归类）。');
