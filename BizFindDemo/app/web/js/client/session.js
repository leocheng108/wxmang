const KEY = 'bizfind.sessionId';
function createId() {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
    }
    catch {
        // 旧浏览器或受限环境走 fallback
    }
    return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
/** 匿名会话 ID：用于隔离最近搜索，不作为身份认证。 */
export function getSessionId() {
    try {
        const existing = localStorage.getItem(KEY);
        if (existing)
            return existing;
        const created = createId();
        localStorage.setItem(KEY, created);
        return created;
    }
    catch {
        return createId();
    }
}
