let activeCore;
export function setActiveCore(core) {
    activeCore = core;
}
export function getActiveCore() {
    return activeCore;
}
function clampPage(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return 1;
    return Math.min(10_000, Math.max(1, Math.floor(parsed)));
}
function clampAnalyticsDays(value) {
    const parsed = Number(value);
    return [7, 30, 90, 180].includes(parsed) ? parsed : 30;
}
function toSort(value) {
    return value === 'date' || value === 'parentId' || value === 'userName' ? value : 'relevance';
}
function optional(value) {
    return value && value.trim().length > 0 ? value : undefined;
}
export function parseRoute(hash = window.location.hash) {
    const raw = hash.replace(/^#/, '') || '/';
    const [path, search = ''] = raw.split('?');
    const params = new URLSearchParams(search);
    const core = optional(params.get('core'));
    if (core)
        activeCore = core;
    if (path.startsWith('/doc/')) {
        let id = path.slice('/doc/'.length);
        try {
            id = decodeURIComponent(id);
        }
        catch {
            // 非法编码时保留原始路径片段，由 API 返回 404
        }
        return {
            name: 'detail',
            id,
            q: params.get('q') ?? '',
            core,
            p: optional(params.get('p')),
            url: optional(params.get('url')),
        };
    }
    if (path === '/topics') {
        return {
            name: 'topics',
            q: params.get('q') ?? '',
            category: optional(params.get('category')),
            page: clampPage(params.get('page')),
        };
    }
    if (path === '/knowledge') {
        return { name: 'knowledge' };
    }
    if (path === '/notes') {
        return { name: 'notes', q: params.get('q') ?? '' };
    }
    if (path === '/search') {
        const q = params.get('q') ?? '';
        if (!q.trim())
            return { name: 'home', core };
        return {
            name: 'search',
            q,
            page: clampPage(params.get('page')),
            sort: toSort(params.get('sort')),
            core,
            userName: optional(params.get('userName')),
            category: optional(params.get('category')),
            source: optional(params.get('source')),
            department: optional(params.get('department')),
        };
    }
    if (path === '/admin/users') {
        return { name: 'adminUsers' };
    }
    if (path === '/analytics') {
        return { name: 'analytics', core, days: clampAnalyticsDays(params.get('days')) };
    }
    if (path === '/external-usage') {
        return { name: 'externalUsage', days: clampAnalyticsDays(params.get('days')) };
    }
    return { name: 'home', core };
}
export function buildSearchHash(params) {
    const search = new URLSearchParams();
    search.set('q', params.q);
    if (params.page && params.page > 1)
        search.set('page', String(params.page));
    if (params.sort && params.sort !== 'relevance')
        search.set('sort', params.sort);
    const core = params.core ?? activeCore;
    if (core)
        search.set('core', core);
    if (params.userName)
        search.set('userName', params.userName);
    if (params.category)
        search.set('category', params.category);
    if (params.source)
        search.set('source', params.source);
    if (params.department)
        search.set('department', params.department);
    return `#/search?${search.toString()}`;
}
export function buildHomeHash(core) {
    const selected = core ?? activeCore;
    return selected ? `#/?core=${encodeURIComponent(selected)}` : '#/';
}
export function buildTopicsHash(params = {}) {
    const search = new URLSearchParams();
    if (params.q)
        search.set('q', params.q);
    if (params.category)
        search.set('category', params.category);
    if (params.page && params.page > 1)
        search.set('page', String(params.page));
    return `#/topics${search.size > 0 ? `?${search.toString()}` : ''}`;
}
export function buildKnowledgeHash() {
    return '#/knowledge';
}
export function buildNotesHash(params = {}) {
    const q = params.q?.trim();
    return q ? `#/notes?q=${encodeURIComponent(q)}` : '#/notes';
}
export function buildAnalyticsHash(params = {}) {
    const search = new URLSearchParams();
    search.set('days', String(params.days ?? 30));
    const core = params.core === null ? undefined : (params.core ?? activeCore);
    if (core)
        search.set('core', core);
    return `#/analytics?${search.toString()}`;
}
export function buildAdminUsersHash() {
    return '#/admin/users';
}
export function buildExternalUsageHash(days = 30) {
    return `#/external-usage?days=${days}`;
}
export function buildDocHash(id, q, core, url) {
    const search = new URLSearchParams();
    if (q)
        search.set('q', q);
    const selected = core ?? activeCore;
    if (selected)
        search.set('core', selected);
    if (url)
        search.set('url', url);
    return `#/doc/${encodeURIComponent(id)}${search.size > 0 ? `?${search.toString()}` : ''}`;
}
/** 在当前检索条件下切换某个分面，重复点击则取消该筛选 */
export function toggleFacetHash(route, field, value) {
    const next = {
        q: route.q,
        page: 1,
        sort: route.sort,
        core: route.core,
        userName: route.userName,
        category: route.category,
        source: route.source,
        department: route.department,
    };
    next[field] = route[field] === value ? undefined : value;
    return buildSearchHash(next);
}
