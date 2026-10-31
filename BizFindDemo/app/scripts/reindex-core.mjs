#!/usr/bin/env node
/**
 * 把源 core 的文档流式复制到目标 core（cursorMark 分页，纯 HTTP，不复制索引文件）。
 *
 * 用途：给 Demo 准备独立索引，或客户机器上重建 wxmang_demo。
 *
 * 用法：
 *   node scripts/reindex-core.mjs                        # wxmang → wxmang_demo
 *   node scripts/reindex-core.mjs --source wxmang --target wxmang_demo
 *   node scripts/reindex-core.mjs --rows 200             # 小批量，弱机器用
 *
 * 前置：目标 core 必须已存在（用 wxmang 的 conf 建 configset 再 CREATE）。
 * 结束时会核对两边 numFound 与 isRoot 数量，不一致直接以非零码退出。
 */
const BASE = (process.env.SOLR_URL ?? 'http://127.0.0.1:8983/solr').replace(/\/+$/, '');

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
}

const SOURCE = arg('source', process.env.SOURCE_CORE ?? 'wxmang');
const TARGET = arg('target', process.env.TARGET_CORE ?? 'wxmang_demo');
const rows = Number(arg('rows', process.env.REINDEX_ROWS ?? 500)) || 500;

// 这些字段由 Solr 自己维护，回灌时丢掉，否则会带上旧版本号
const strip = new Set(['_version_', 'score', '_root_']);

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`GET ${url} → HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body, (key, value) => (strip.has(key) ? undefined : value)),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`POST ${url} → HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return response.json();
}

const started = Date.now();
let cursorMark = '*';
let total = 0;
let batches = 0;
let expected = null;

console.log(`复制 ${SOURCE} → ${TARGET}（每批 ${rows} 篇）`);

for (;;) {
  const params = new URLSearchParams({
    q: '*:*',
    fl: '*',
    rows: String(rows),
    sort: 'id asc',
    cursorMark,
    wt: 'json',
  });
  const page = await getJson(`${BASE}/${encodeURIComponent(SOURCE)}/select?${params}`);
  const docs = page.response?.docs ?? [];
  if (expected === null) expected = page.response?.numFound ?? 0;
  if (docs.length === 0) break;

  await postJson(`${BASE}/${encodeURIComponent(TARGET)}/update?commit=false&wt=json`, docs);
  total += docs.length;
  batches += 1;
  if (batches % 20 === 0 || total === expected) {
    console.log(`  ${total}/${expected}  ${((Date.now() - started) / 1000).toFixed(1)}s`);
  }

  const next = page.nextCursorMark;
  if (!next || next === cursorMark) break;
  cursorMark = next;
}

await postJson(`${BASE}/${encodeURIComponent(TARGET)}/update?commit=true&wt=json`, {});

const [sourceCount, targetCount, sourceRoots, targetRoots] = await Promise.all([
  getJson(`${BASE}/${encodeURIComponent(SOURCE)}/select?q=*:*&rows=0&wt=json`),
  getJson(`${BASE}/${encodeURIComponent(TARGET)}/select?q=*:*&rows=0&wt=json`),
  getJson(`${BASE}/${encodeURIComponent(SOURCE)}/select?q=isRoot:1&rows=0&wt=json`),
  getJson(`${BASE}/${encodeURIComponent(TARGET)}/select?q=isRoot:1&rows=0&wt=json`),
]);

const summary = {
  复制: total,
  源文档数: sourceCount.response.numFound,
  目标文档数: targetCount.response.numFound,
  源主帖: sourceRoots.response.numFound,
  目标主帖: targetRoots.response.numFound,
  耗时秒: Math.round((Date.now() - started) / 1000),
};
console.log(JSON.stringify(summary, null, 2));

if (targetCount.response.numFound !== sourceCount.response.numFound) {
  console.error('数量不一致：复制未完成');
  process.exit(1);
}
console.log('完成，数量一致。');
