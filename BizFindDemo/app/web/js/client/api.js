async function fetchJson(url, signal) {
    const response = await fetch(url, {
        signal,
        headers: { accept: 'application/json' },
    });
    if (!response.ok) {
        let message = `请求失败（HTTP ${response.status}）`;
        try {
            const body = (await response.json());
            if (body.message)
                message = body.message;
        }
        catch {
            // 非 JSON 错误响应时使用默认文案
        }
        throw new Error(message);
    }
    return (await response.json());
}
export function fetchHealth() {
    return fetchJson('/api/health');
}
export function fetchMe() {
    return fetchJson('/api/me');
}
export function fetchUsers(signal) {
    return fetchJson('/api/admin/users', signal);
}
export async function createUser(input) {
    const response = await fetch('/api/admin/users', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(input),
    });
    if (!response.ok) {
        let message = `创建用户失败（HTTP ${response.status}）`;
        try {
            const body = (await response.json());
            if (body.message)
                message = body.message;
        }
        catch {
            // 非 JSON 错误
        }
        throw new Error(message);
    }
    return (await response.json());
}
export async function logout() {
    const response = await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
    });
    if (!response.ok)
        return '/';
    const body = (await response.json());
    return body.redirectTo ?? '/';
}
export function fetchStats(core) {
    const query = core ? `?core=${encodeURIComponent(core)}` : '';
    return fetchJson(`/api/stats${query}`);
}
export function fetchSearch(route, signal) {
    const params = new URLSearchParams({
        q: route.q,
        page: String(route.page),
        pageSize: '10',
        sort: route.sort,
    });
    if (route.core)
        params.set('core', route.core);
    if (route.userName)
        params.set('userName', route.userName);
    if (route.category)
        params.set('category', route.category);
    if (route.source)
        params.set('source', route.source);
    if (route.department)
        params.set('department', route.department);
    return fetchJson(`/api/search?${params.toString()}`, signal);
}
export function fetchSuggest(q, core, signal) {
    const params = new URLSearchParams({ q, limit: '7' });
    if (core)
        params.set('core', core);
    return fetchJson(`/api/suggest?${params.toString()}`, signal);
}
export async function recordSearch(input) {
    const response = await fetch('/api/history', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(input),
    });
    if (!response.ok)
        throw new Error(`记录检索历史失败（HTTP ${response.status}）`);
}
export function fetchRecentKeywords(sessionId, limit = 10, signal) {
    const params = new URLSearchParams({ sessionId, limit: String(limit) });
    return fetchJson(`/api/history/recent?${params.toString()}`, signal);
}
export async function hideRecentKeyword(sessionId, keyword) {
    const response = await fetch('/api/history/recent/hide', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sessionId, keyword }),
    });
    if (!response.ok)
        throw new Error(`隐藏最近搜索失败（HTTP ${response.status}）`);
}
export function fetchAnalytics(params, signal) {
    const query = new URLSearchParams();
    if (params.from)
        query.set('from', params.from);
    if (params.to)
        query.set('to', params.to);
    if (params.core)
        query.set('core', params.core);
    if (params.keyword)
        query.set('keyword', params.keyword);
    return fetchJson(`/api/analytics/search?${query.toString()}`, signal);
}
export function fetchExternalUsage(params, signal) {
    const query = new URLSearchParams();
    if (params.from)
        query.set('from', params.from);
    if (params.to)
        query.set('to', params.to);
    return fetchJson(`/api/external/usage?${query.toString()}`, signal);
}
export function fetchDetail(id, q, core, url, signal) {
    const params = new URLSearchParams();
    if (q)
        params.set('q', q);
    if (core)
        params.set('core', core);
    if (url)
        params.set('url', url);
    const suffix = params.size > 0 ? `?${params.toString()}` : '';
    return fetchJson(`/api/doc/${encodeURIComponent(id)}${suffix}`, signal);
}
export function fetchThreadReplies(rootId, parentId, q, core, signal) {
    const params = new URLSearchParams({ parent: parentId });
    if (q)
        params.set('q', q);
    if (core)
        params.set('core', core);
    return fetchJson(`/api/thread/${encodeURIComponent(rootId)}/descendants?${params.toString()}`, signal);
}
export function fetchTopicCategories(signal) {
    return fetchJson('/api/topics/categories', signal);
}
export async function deleteAnnotation(noteId) {
    const response = await fetch(`/api/annotations/${encodeURIComponent(noteId)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
    });
    if (!response.ok) {
        let message = `删除失败（HTTP ${response.status}）`;
        try {
            const body = (await response.json());
            if (body.message)
                message = body.message;
        }
        catch {
            // 非 JSON 错误响应
        }
        throw new Error(message);
    }
}
/** 每个分类里我批过多少篇 */
export async function deleteTopicCategory(id) {
    const response = await fetch(`/api/topics/categories/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
    });
    if (!response.ok)
        throw new Error(`删除分类失败（HTTP ${response.status}）`);
    return (await response.json());
}
export function fetchTopicTraces() {
    return fetchJson('/api/topics/traces');
}
/** 这批文档里我批过多少条 */
export function fetchNoteTraces(ids) {
    const query = new URLSearchParams({ ids: ids.join(',') });
    return fetchJson(`/api/notes/traces?${query.toString()}`);
}
/** 系列前后篇：同作者、同标题主干、编号相邻 */
export function fetchDocSeries(docId) {
    return fetchJson(`/api/doc/${encodeURIComponent(docId)}/series`);
}
/** 疑问清单：把「疑问 / 依据」型批注聚成待解决问题 */
export function fetchQuestions(status = 'open', limit = 50) {
    const query = new URLSearchParams({ status, limit: String(limit) });
    return fetchJson(`/api/notes/questions?${query.toString()}`);
}
/** 标记想通 / 重新打开一条疑问 */
export async function resolveQuestion(noteId, resolved) {
    const response = await fetch(`/api/notes/${encodeURIComponent(noteId)}/resolve`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ resolved }),
    });
    if (!response.ok) {
        let message = `更新失败（HTTP ${response.status}）`;
        try {
            const body = (await response.json());
            if (body.message)
                message = body.message;
        }
        catch {
            // 非 JSON 错误
        }
        throw new Error(message);
    }
}
/** 当前文档已归类时，取同分类下的其他文档 */
export function fetchSameCategoryRelated(docId, limit = 3) {
    const query = new URLSearchParams({ docId, limit: String(limit) });
    return fetchJson(`/api/related/same-category?${query.toString()}`);
}
/** 按批注内容找相关帖子；没有达标结果时返回空列表 */
export function fetchAnnotationRecommendations(docId, text, limit = 2) {
    const query = new URLSearchParams({ docId, q: text, limit: String(limit) });
    return fetchJson(`/api/related/from-annotation?${query.toString()}`);
}
/** 修改批注笔法；返回更新后的笔记 */
export async function updateAnnotationMark(noteId, kind) {
    const response = await fetch(`/api/annotations/${encodeURIComponent(noteId)}/mark`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ kind }),
    });
    if (!response.ok) {
        let message = `修改笔法失败（HTTP ${response.status}）`;
        try {
            const body = (await response.json());
            if (body.message)
                message = body.message;
        }
        catch {
            // 非 JSON 错误
        }
        throw new Error(message);
    }
    const body = (await response.json());
    return body.note;
}
export function fetchNote(docId, signal) {
    return fetchJson(`/api/notes/${encodeURIComponent(docId)}`, signal);
}
export function searchNotes(q, signal, limit = 100) {
    const query = new URLSearchParams({ q, limit: String(limit) });
    return fetchJson(`/api/notes/search?${query.toString()}`, signal);
}
export async function saveNote(docId, content, anchor) {
    const response = await fetch(`/api/notes/${encodeURIComponent(docId)}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ content, ...anchor }),
    });
    let payload = null;
    try {
        payload = await response.json();
    }
    catch {
        payload = null;
    }
    if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'message' in payload
            ? String(payload.message)
            : `保存失败（HTTP ${response.status}）`;
        throw new Error(message);
    }
    return payload;
}
export function fetchTopics(params, signal) {
    const query = new URLSearchParams({
        q: params.q,
        page: String(params.page),
        pageSize: String(params.pageSize),
    });
    if (params.categoryId)
        query.set('category', params.categoryId);
    return fetchJson(`/api/topics/search?${query.toString()}`, signal);
}
async function postJson(url, body) {
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
    let payload = null;
    try {
        payload = await response.json();
    }
    catch {
        payload = null;
    }
    if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'message' in payload
            ? String(payload.message)
            : `请求失败（HTTP ${response.status}）`;
        throw new Error(message);
    }
    return payload;
}
export function assignTopics(input) {
    return postJson('/api/topics/assign', input);
}
export function unassignTopics(input) {
    return postJson('/api/topics/unassign', input);
}
export function createTopicCategory(name, parentId) {
    return postJson('/api/topics/categories', { name, parentId });
}
