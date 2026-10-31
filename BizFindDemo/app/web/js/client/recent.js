const KEY = 'bizfind.recent';
const LIMIT = 6;
export function getRecentSearches() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return [];
        return parsed.filter((item) => typeof item === 'string').slice(0, LIMIT);
    }
    catch {
        return [];
    }
}
export function addRecentSearch(query) {
    const value = query.trim();
    if (!value)
        return;
    const next = [value, ...getRecentSearches().filter((item) => item !== value)].slice(0, LIMIT);
    try {
        localStorage.setItem(KEY, JSON.stringify(next));
    }
    catch {
        // 隐私模式下 localStorage 可能不可用
    }
}
export function clearRecentSearches() {
    try {
        localStorage.removeItem(KEY);
    }
    catch {
        // 忽略
    }
}
export function removeRecentSearch(query) {
    const value = query.trim();
    if (!value)
        return;
    try {
        const next = getRecentSearches().filter((item) => item !== value);
        localStorage.setItem(KEY, JSON.stringify(next));
    }
    catch {
        // 忽略
    }
}
