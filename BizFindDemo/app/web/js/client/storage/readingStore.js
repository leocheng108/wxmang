/**
 * 本地记录的唯一入口。
 * 进度、读完、访问次数、阅读偏好都放在同一个 JSON 里：
 * 清缓存只会丢一处，将来要导出或同步也只处理一份数据。
 */
const KEY = 'bizfind:store';
const LEGACY = {
    reading: 'bizfind:reading:',
    finished: 'bizfind:finished:',
    visits: 'bizfind:visits:',
    prefs: 'bizfind:prefs',
};
const DEFAULT_PREFS = { theme: 'paper', layout: 'normal' };
let storage = typeof localStorage === 'undefined' ? null : localStorage;
/** 测试用：替换底层存储；传 null 表示不可用 */
export function configureStorage(next) {
    storage = next;
}
function emptyStore() {
    return { version: 1, docs: {}, clicks: [] };
}
function readRaw() {
    if (!storage)
        return emptyStore();
    try {
        const raw = storage.getItem(KEY);
        if (!raw)
            return emptyStore();
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || typeof parsed.docs !== 'object') {
            return emptyStore();
        }
        return {
            version: 1,
            prefs: parsed.prefs,
            docs: parsed.docs ?? {},
            clicks: Array.isArray(parsed.clicks) ? parsed.clicks : [],
        };
    }
    catch {
        return emptyStore();
    }
}
function writeRaw(store) {
    if (!storage)
        return;
    try {
        storage.setItem(KEY, JSON.stringify(store));
    }
    catch {
        // 存储不可用时静默
    }
}
/** 把旧的四套 key 合并进来；只在首次运行时做一次 */
export function migrateLegacy() {
    if (!storage)
        return;
    try {
        if (storage.getItem(KEY))
            return;
        const store = emptyStore();
        const keys = [];
        for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index);
            if (key)
                keys.push(key);
        }
        for (const key of keys) {
            if (key.startsWith(LEGACY.reading)) {
                const docId = key.slice(LEGACY.reading.length);
                const raw = storage.getItem(key);
                if (!raw)
                    continue;
                const parsed = JSON.parse(raw);
                store.docs[docId] = {
                    ...store.docs[docId],
                    ...(Number.isFinite(parsed.para) ? { para: parsed.para } : {}),
                    ...(Number.isFinite(parsed.ratio) ? { ratio: parsed.ratio } : {}),
                    ...(typeof parsed.at === 'string' ? { at: parsed.at } : {}),
                    ...(typeof parsed.title === 'string' ? { title: parsed.title } : {}),
                };
            }
            else if (key.startsWith(LEGACY.finished)) {
                const docId = key.slice(LEGACY.finished.length);
                const value = storage.getItem(key);
                if (value) {
                    store.docs[docId] = { ...store.docs[docId], finishedAt: value };
                }
            }
            else if (key.startsWith(LEGACY.visits)) {
                const docId = key.slice(LEGACY.visits.length);
                const raw = storage.getItem(key);
                if (!raw)
                    continue;
                const parsed = JSON.parse(raw);
                if (parsed && Number.isFinite(parsed.count)) {
                    store.docs[docId] = { ...store.docs[docId], visits: parsed };
                }
            }
            else if (key === LEGACY.prefs) {
                const raw = storage.getItem(key);
                if (!raw)
                    continue;
                const parsed = JSON.parse(raw);
                store.prefs = { ...store.prefs, ...parsed };
            }
        }
        writeRaw(store);
        for (const key of keys) {
            if (key.startsWith(LEGACY.reading) ||
                key.startsWith(LEGACY.finished) ||
                key.startsWith(LEGACY.visits) ||
                key === LEGACY.prefs) {
                storage.removeItem(key);
            }
        }
    }
    catch {
        // 迁移失败就保持旧数据不动
    }
}
export function getPrefs() {
    const store = readRaw();
    return {
        theme: store.prefs?.theme === 'night' ? 'night' : DEFAULT_PREFS.theme,
        layout: store.prefs?.layout === 'tight' || store.prefs?.layout === 'wide'
            ? store.prefs.layout
            : DEFAULT_PREFS.layout,
    };
}
export function setPrefs(patch) {
    const store = readRaw();
    const next = { ...getPrefs(), ...patch };
    store.prefs = next;
    writeRaw(store);
    return next;
}
export function getDoc(docId) {
    return readRaw().docs[docId];
}
export function setProgress(docId, progress) {
    const store = readRaw();
    const existing = store.docs[docId] ?? {};
    store.docs[docId] = {
        ...existing,
        ...(Number.isFinite(progress.para) ? { para: progress.para } : {}),
        ...(Number.isFinite(progress.total) ? { total: progress.total } : {}),
        ...(Number.isFinite(progress.ratio) ? { ratio: progress.ratio } : {}),
        ...(typeof progress.title === 'string' && progress.title ? { title: progress.title } : {}),
        at: progress.at ?? new Date().toISOString(),
    };
    writeRaw(store);
}
export function markFinished(docId, at = new Date().toISOString()) {
    const store = readRaw();
    const existing = store.docs[docId] ?? {};
    if (existing.finishedAt)
        return;
    store.docs[docId] = { ...existing, finishedAt: at };
    writeRaw(store);
}
export function recordVisit(docId, at = new Date().toISOString()) {
    const store = readRaw();
    const existing = store.docs[docId] ?? {};
    const visits = existing.visits ?? { count: 0, firstAt: at, lastAt: at };
    const next = {
        ...existing,
        visits: {
            count: visits.count + 1,
            firstAt: visits.firstAt || at,
            lastAt: at,
        },
    };
    store.docs[docId] = next;
    writeRaw(store);
    return next;
}
/** 记一次推荐点击；最多保留 200 条，避免无限增长 */
export function recordClick(docId, from) {
    if (!storage)
        return;
    const store = readRaw();
    const clicks = [...(store.clicks ?? []), { docId, from, at: new Date().toISOString() }];
    store.clicks = clicks.slice(-200);
    writeRaw(store);
}
export function listClicks() {
    return readRaw().clicks ?? [];
}
/** 清空本机全部阅读记录（进度、读完、访问次数、偏好），不影响服务器数据 */
export function clearAllLocal() {
    if (!storage)
        return;
    try {
        storage.removeItem(KEY);
        const keys = [];
        for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index);
            if (key)
                keys.push(key);
        }
        for (const key of keys) {
            if (key.startsWith(LEGACY.reading) ||
                key.startsWith(LEGACY.finished) ||
                key.startsWith(LEGACY.visits) ||
                key === LEGACY.prefs) {
                storage.removeItem(key);
            }
        }
    }
    catch {
        // 存储不可用时静默
    }
}
/** 未读完的文档，按最近阅读时间倒序 */
export function listUnfinished(limit = 3) {
    const store = readRaw();
    return Object.entries(store.docs)
        .filter(([, record]) => !record.finishedAt && Number.isFinite(record.ratio))
        .sort((a, b) => (b[1].at ?? '').localeCompare(a[1].at ?? ''))
        .slice(0, limit)
        .map(([docId, record]) => ({ docId, record }));
}
