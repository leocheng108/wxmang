import { Router } from 'express';
import { cleanQuery } from '../../domain/content/text.js';
import { readBuildInfo } from '../../infrastructure/config/buildInfo.js';
import { MARK_KINDS } from '../../domain/content/marks.js';
import { AnnotationRecommendationService } from '../../application/related/AnnotationRecommendationService.js';
import { DocumentSeriesService } from '../../application/series/DocumentSeriesService.js';
import { toApiDocDetail, toApiSearchHit, toApiSearchPage, } from './dto/searchResponseAssembler.js';
class HttpError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
    }
}
function firstValue(value) {
    if (typeof value === 'string')
        return value;
    if (Array.isArray(value) && typeof value[0] === 'string')
        return value[0];
    return undefined;
}
function toInt(value, fallback, min, max) {
    const parsed = Number(firstValue(value));
    if (!Number.isFinite(parsed))
        return fallback;
    return Math.min(max, Math.max(min, Math.floor(parsed)));
}
function toSort(value) {
    const sort = firstValue(value);
    return sort === 'date' || sort === 'parentId' || sort === 'userName' ? sort : 'relevance';
}
function optionalFacet(value) {
    const text = cleanQuery(firstValue(value) ?? '');
    return text.length > 0 ? text.slice(0, 80) : undefined;
}
function wrap(handler) {
    return (req, res, next) => {
        handler(req, res).catch(next);
    };
}
function errorBody(status, message) {
    const names = {
        400: 'Bad Request',
        404: 'Not Found',
        429: 'Too Many Requests',
        502: 'Bad Gateway',
        500: 'Internal Server Error',
    };
    return { error: names[status] ?? 'Error', message, status };
}
export function createApiRouter(runtime) {
    const router = Router();
    // core=wxmang 是切到独立 core 之前的历史链接，按默认 Core 处理；其余未知名字仍然报错。
    const resolveCore = (query) => {
        const requested = firstValue(query.core)?.trim();
        if (!requested)
            return runtime.defaultCore;
        const core = runtime.resolveCoreName(requested);
        if (!runtime.hasCore(core))
            throw new HttpError(400, `未知的 Core：${requested}`);
        return core;
    };
    const coreLabel = (name) => runtime.cores.find((item) => item.name === name)?.label ?? name;
    router.get('/health', (_req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.json(runtime.health());
    });
    router.get('/cores', (_req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.json({
            defaultCore: runtime.defaultCore,
            cores: runtime.cores,
        });
    });
    // 交付现场排查用：当前部署的是哪个提交、跑在哪个 Core。
    router.get('/version', (_req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.json({
            ...readBuildInfo(),
            core: runtime.defaultCore,
            backend: runtime.service.backend,
            uptimeSec: Math.round((Date.now() - runtime.startedAt) / 1000),
        });
    });
    router.get('/stats', wrap(async (req, res) => {
        const core = resolveCore(req.query);
        const stats = await runtime.serviceFor(core).stats();
        res.setHeader('Cache-Control', 'public, max-age=30');
        res.json({ ...stats, core, coreLabel: coreLabel(core) });
    }));
    router.post('/history', wrap(async (req, res) => {
        const body = (req.body ?? {});
        const sessionId = firstValue(body.sessionId)?.trim() ?? '';
        const keyword = firstValue(body.keyword)?.trim() ?? '';
        if (!sessionId || !keyword)
            throw new HttpError(400, '缺少 sessionId 或 keyword');
        const requestedCore = firstValue(body.core)?.trim();
        const core = requestedCore && runtime.hasCore(requestedCore) ? requestedCore : runtime.defaultCore;
        try {
            await runtime.history.record({
                sessionId,
                keyword,
                core,
                source: firstValue(body.source)?.trim() || 'submit',
            });
        }
        catch (error) {
            throw new HttpError(400, error instanceof Error ? error.message : '检索历史记录失败');
        }
        res.setHeader('Cache-Control', 'no-store');
        res.status(202).json({ ok: true });
    }));
    router.get('/history/recent', wrap(async (req, res) => {
        const sessionId = firstValue(req.query.sessionId)?.trim() ?? '';
        if (!sessionId)
            throw new HttpError(400, '缺少 sessionId');
        const items = await runtime.history.recent(sessionId, toInt(req.query.limit, 10, 1, 10));
        res.setHeader('Cache-Control', 'no-store');
        res.json({ items });
    }));
    router.post('/history/recent/hide', wrap(async (req, res) => {
        const body = (req.body ?? {});
        const sessionId = firstValue(body.sessionId)?.trim() ?? '';
        const keyword = firstValue(body.keyword)?.trim() ?? '';
        if (!sessionId || !keyword)
            throw new HttpError(400, '缺少 sessionId 或 keyword');
        try {
            await runtime.history.hideRecent(sessionId, keyword);
        }
        catch (error) {
            throw new HttpError(400, error instanceof Error ? error.message : '隐藏最近搜索失败');
        }
        res.setHeader('Cache-Control', 'no-store');
        res.status(202).json({ ok: true });
    }));
    router.get('/analytics/search', wrap(async (req, res) => {
        const externalCores = runtime.cores
            .filter((core) => core.backend === 'external')
            .map((core) => core.name);
        const result = await runtime.history.analytics({
            fromDay: firstValue(req.query.from),
            toDay: firstValue(req.query.to),
            core: firstValue(req.query.core) || undefined,
            keyword: firstValue(req.query.keyword) || undefined,
            excludeCores: externalCores,
        });
        res.setHeader('Cache-Control', 'no-store');
        res.json(result);
    }));
    router.get('/external/usage', wrap(async (req, res) => {
        const result = await runtime.externalUsage.summary(firstValue(req.query.from), firstValue(req.query.to));
        res.setHeader('Cache-Control', 'no-store');
        res.json(result);
    }));
    router.get('/search', wrap(async (req, res) => {
        const q = cleanQuery(firstValue(req.query.q));
        if (!q)
            throw new HttpError(400, '缺少检索词参数 q，例如 /api/search?q=差旅报销');
        const core = resolveCore(req.query);
        const query = {
            q,
            page: toInt(req.query.page, 1, 1, 10_000),
            pageSize: toInt(req.query.pageSize, 10, 1, 50),
            sort: toSort(req.query.sort),
            core,
            userName: optionalFacet(req.query.userName),
            category: optionalFacet(req.query.category),
            source: optionalFacet(req.query.source),
            department: optionalFacet(req.query.department),
        };
        let result;
        try {
            result = await runtime.serviceFor(core).search(query);
        }
        catch (error) {
            const backend = runtime.cores.find((item) => item.name === core)?.backend;
            if (backend === 'external') {
                const detail = error instanceof Error ? error.message : String(error);
                throw new HttpError(502, `外部检索失败：${detail}`);
            }
            throw error;
        }
        res.setHeader('Cache-Control', 'no-store');
        res.json(toApiSearchPage(result, core, coreLabel(core)));
    }));
    router.get('/suggest', wrap(async (req, res) => {
        const q = cleanQuery(firstValue(req.query.q));
        const limit = toInt(req.query.limit, 8, 1, 12);
        const core = resolveCore(req.query);
        const items = await runtime.serviceFor(core).suggest(q, limit);
        res.setHeader('Cache-Control', 'no-store');
        res.json({ query: q, items, core, coreLabel: coreLabel(core) });
    }));
    router.get('/topics/categories', wrap(async (_req, res) => {
        const result = await runtime.topics.categories();
        res.setHeader('Cache-Control', 'no-store');
        res.json(result);
    }));
    router.get('/topics/search', wrap(async (req, res) => {
        const q = cleanQuery(firstValue(req.query.q));
        const categoryId = firstValue(req.query.category)?.trim() || undefined;
        const result = await runtime.topics.search({
            q,
            categoryId,
            page: toInt(req.query.page, 1, 1, 10_000),
            pageSize: toInt(req.query.pageSize, 12, 1, 30),
        });
        res.setHeader('Cache-Control', 'no-store');
        res.json({
            query: result.query,
            categoryId: result.categoryId,
            page: result.page,
            pageSize: result.pageSize,
            total: result.total,
            results: result.results.map(toApiSearchHit),
        });
    }));
    router.delete('/annotations/:id', wrap(async (req, res) => {
        if (!req.auth)
            throw new HttpError(401, '请先登录后再删除批注');
        const id = String(req.params.id ?? '');
        if (!/^note-[A-Za-z0-9-]{1,80}$/.test(id))
            throw new HttpError(400, '非法的批注 ID');
        const deleted = runtime.notes.delete(req.auth.userId, id);
        if (!deleted)
            throw new HttpError(404, '批注不存在');
        try {
            await runtime.noteIndex.remove(id);
        }
        catch (error) {
            console.warn(`[notes] 删除 notes core 批注失败：${error instanceof Error ? error.message : String(error)}`);
        }
        res.setHeader('Cache-Control', 'no-store');
        res.json({ deleted: true });
    }));
    router.get('/notes/search', wrap(async (req, res) => {
        if (!req.auth)
            throw new HttpError(401, '请先登录后再检索笔记');
        const q = cleanQuery(firstValue(req.query.q));
        const limit = toInt(req.query.limit, 50, 1, 100);
        try {
            const result = await runtime.noteIndex.search(req.auth.userId, q, limit);
            res.setHeader('Cache-Control', 'no-store');
            res.json(result);
        }
        catch (error) {
            throw new HttpError(502, error instanceof Error ? error.message : '笔记检索失败');
        }
    }));
    // 系列前后篇：同作者 + 同标题主干 + 编号相邻
    router.get('/doc/:id/series', wrap(async (req, res) => {
        const id = String(req.params.id ?? '');
        if (!/^[A-Za-z0-9_-]{1,120}$/.test(id))
            throw new HttpError(400, '非法的文档 ID');
        const service = new DocumentSeriesService(runtime.serviceFor());
        const series = await service.find(id);
        res.setHeader('Cache-Control', 'no-store');
        res.json(series);
    }));
    // 分类阅读痕迹：每个分类里我批过多少篇
    router.get('/topics/traces', wrap(async (req, res) => {
        if (!req.auth)
            throw new HttpError(401, '请先登录后再查看分类痕迹');
        const userId = req.auth.userId;
        const docIds = [
            ...new Set(runtime.notes
                .listAll()
                .filter((note) => note.userId === userId && note.kind === 'annotation')
                .map((note) => note.docId)),
        ];
        const traces = runtime.topics.countTracedDocs(docIds);
        res.setHeader('Cache-Control', 'no-store');
        res.json({ traces });
    }));
    // 阅读痕迹：这批文档里我批过多少条（只返回计数，不返回内容）
    router.get('/notes/traces', wrap(async (req, res) => {
        if (!req.auth)
            throw new HttpError(401, '请先登录后再查看阅读痕迹');
        const rawIds = String(req.query.ids ?? '');
        const ids = rawIds
            .split(',')
            .map((id) => id.trim())
            .filter((id) => /^[A-Za-z0-9_-]{1,120}$/.test(id))
            .slice(0, 100);
        const traces = {};
        if (ids.length > 0) {
            const wanted = new Set(ids);
            const userId = req.auth.userId;
            for (const note of runtime.notes.listAll()) {
                if (note.userId !== userId || !wanted.has(note.docId))
                    continue;
                const entry = traces[note.docId] ?? { count: 0, lastAt: '' };
                entry.count += 1;
                if (note.createdAt > entry.lastAt)
                    entry.lastAt = note.createdAt;
                traces[note.docId] = entry;
            }
        }
        res.setHeader('Cache-Control', 'no-store');
        res.json({ traces });
    }));
    // 疑问清单：把「疑问 / 依据」型批注聚成待解决问题
    router.get('/notes/questions', wrap(async (req, res) => {
        if (!req.auth)
            throw new HttpError(401, '请先登录后再查看疑问清单');
        const rawStatus = firstValue(req.query.status);
        const status = rawStatus === 'resolved' ? 'resolved' : rawStatus === 'all' ? 'all' : 'open';
        const limit = toInt(req.query.limit, 50, 1, 200);
        const userId = req.auth.userId;
        const mine = runtime.notes
            .listAll()
            .filter((note) => note.userId === userId && note.kind === 'annotation')
            .filter((note) => note.markKind === 'question' || note.markKind === 'evidence');
        const openCount = mine.filter((note) => !note.resolvedAt).length;
        const resolvedCount = mine.length - openCount;
        const selected = mine
            .filter((note) => status === 'open'
            ? !note.resolvedAt
            : status === 'resolved'
                ? Boolean(note.resolvedAt)
                : true)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, limit);
        const docIds = [...new Set(selected.map((note) => note.docId))];
        const titles = new Map();
        if (docIds.length > 0) {
            try {
                const page = await runtime.service.search({
                    q: '*',
                    page: 1,
                    pageSize: Math.min(docIds.length, 100),
                    sort: 'date',
                    ids: docIds,
                    allDocs: true,
                });
                for (const hit of page.results)
                    titles.set(hit.id, hit.title.text);
            }
            catch {
                // 标题取不到时降级为文档 ID
            }
        }
        res.setHeader('Cache-Control', 'no-store');
        res.json({ openCount, resolvedCount, items: selected.map((note) => ({ note, docTitle: titles.get(note.docId) ?? note.docId })) });
    }));
    router.get('/notes/:docId', wrap(async (req, res) => {
        if (!req.auth)
            throw new HttpError(401, '请先登录后再查看笔记');
        const docId = String(req.params.docId ?? '');
        if (!/^[A-Za-z0-9_-]{1,120}$/.test(docId))
            throw new HttpError(400, '非法的文档 ID');
        res.setHeader('Cache-Control', 'no-store');
        res.json({ notes: runtime.notes.list(req.auth.userId, docId) });
    }));
    router.post('/notes/:docId', wrap(async (req, res) => {
        if (!req.auth)
            throw new HttpError(401, '请先登录后再记录笔记');
        const docId = String(req.params.docId ?? '');
        if (!/^[A-Za-z0-9_-]{1,120}$/.test(docId))
            throw new HttpError(400, '非法的文档 ID');
        const body = (req.body ?? {});
        if (typeof body.content !== 'string')
            throw new HttpError(400, '笔记内容格式不正确');
        const kind = body.kind === 'annotation' ? 'annotation' : 'note';
        const startOffset = Number(body.startOffset);
        const endOffset = Number(body.endOffset);
        const paragraphIndex = Number(body.paragraphIndex);
        try {
            const note = runtime.notes.save(req.auth.userId, docId, {
                content: body.content,
                kind,
                startOffset: Number.isFinite(startOffset) ? startOffset : undefined,
                endOffset: Number.isFinite(endOffset) ? endOffset : undefined,
                quote: firstValue(body.quote) ?? undefined,
                prefix: firstValue(body.prefix) ?? undefined,
                suffix: firstValue(body.suffix) ?? undefined,
                paragraphIndex: Number.isFinite(paragraphIndex) ? paragraphIndex : undefined,
            });
            try {
                await runtime.noteIndex.index(req.auth.userId, note);
            }
            catch (error) {
                console.warn(`[notes] 索引笔记失败：${error instanceof Error ? error.message : String(error)}`);
            }
            res.setHeader('Cache-Control', 'no-store');
            res.json({ note, notes: runtime.notes.list(req.auth.userId, docId) });
        }
        catch (error) {
            throw new HttpError(400, error instanceof Error ? error.message : '保存笔记失败');
        }
    }));
    // 疑问：标记想通 / 重新打开
    router.post('/notes/:id/resolve', wrap(async (req, res) => {
        if (!req.auth)
            throw new HttpError(401, '请先登录后再修改疑问状态');
        const id = String(req.params.id ?? '');
        if (!/^note-[A-Za-z0-9-]{1,80}$/.test(id))
            throw new HttpError(400, '非法的批注 ID');
        const body = (req.body ?? {});
        const note = runtime.notes.setResolved(req.auth.userId, id, body.resolved !== false);
        if (!note)
            throw new HttpError(404, '批注不存在');
        res.setHeader('Cache-Control', 'no-store');
        res.json({ note });
    }));
    // 同分类推荐：文档已归类时，取同类下的其他文档（最多 3 篇）
    router.get('/related/same-category', wrap(async (req, res) => {
        const docId = String(req.query.docId ?? '');
        if (!/^[A-Za-z0-9_-]{1,120}$/.test(docId))
            throw new HttpError(400, '非法的文档 ID');
        const rawLimit = Number(req.query.limit ?? 3);
        const limit = Number.isFinite(rawLimit) ? Math.min(3, Math.max(1, rawLimit)) : 3;
        const result = await runtime.topics.relatedByCategory(docId, limit);
        res.setHeader('Cache-Control', 'no-store');
        res.json(result);
    }));
    // 批注驱动的相关推荐：公开只读，最多 2 条，门槛不达就不推
    router.get('/related/from-annotation', wrap(async (req, res) => {
        const docId = String(req.query.docId ?? '');
        if (!/^[A-Za-z0-9_-]{1,120}$/.test(docId))
            throw new HttpError(400, '非法的文档 ID');
        const text = String(req.query.q ?? '').slice(0, 200);
        if (!text.trim())
            throw new HttpError(400, '缺少批注内容');
        const rawLimit = Number(req.query.limit ?? 2);
        const limit = Number.isFinite(rawLimit) ? Math.min(2, Math.max(1, rawLimit)) : 2;
        const service = new AnnotationRecommendationService(runtime.serviceFor());
        const result = await service.recommend({ docId, text, limit });
        res.setHeader('Cache-Control', 'no-store');
        res.json(result);
    }));
    // 批注笔法：只允许改自己的批注，家族由笔法推导
    // 删除分类：结构删除，文档不受影响
    router.delete('/topics/categories/:id', wrap(async (req, res) => {
        if (!req.auth)
            throw new HttpError(401, '请先登录后再删除分类');
        const id = String(req.params.id ?? '');
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(id))
            throw new HttpError(400, '非法的分类 ID');
        try {
            const result = runtime.topics.deleteCategory(id);
            res.setHeader('Cache-Control', 'no-store');
            res.json(result);
        }
        catch (error) {
            throw new HttpError(400, error instanceof Error ? error.message : '删除分类失败');
        }
    }));
    router.post('/annotations/:id/mark', wrap(async (req, res) => {
        if (!req.auth)
            throw new HttpError(401, '请先登录后再修改批注笔法');
        const id = String(req.params.id ?? '');
        if (!/^note-[A-Za-z0-9-]{1,80}$/.test(id))
            throw new HttpError(400, '非法的批注 ID');
        const body = (req.body ?? {});
        const kind = firstValue(body.kind);
        if (!kind || !MARK_KINDS.includes(kind)) {
            throw new HttpError(400, '未知的笔法');
        }
        const note = runtime.notes.updateMark(req.auth.userId, id, kind);
        if (!note)
            throw new HttpError(404, '批注不存在');
        res.setHeader('Cache-Control', 'no-store');
        res.json({ note });
    }));
    router.post('/topics/assign', wrap(async (req, res) => {
        if (!req.auth)
            throw new HttpError(401, '请先登录后再管理主题分类');
        const body = (req.body ?? {});
        const rawIds = Array.isArray(body.docIds) ? body.docIds : [];
        const docIds = rawIds
            .filter((id) => typeof id === 'string')
            .map((id) => id.trim())
            .filter(Boolean);
        if (docIds.length === 0)
            throw new HttpError(400, '请先选择主帖');
        const categoryId = firstValue(body.categoryId)?.trim() || undefined;
        const categoryName = firstValue(body.categoryName)?.trim() || undefined;
        if (!categoryId && !categoryName)
            throw new HttpError(400, '请选择分类或输入新分类');
        try {
            const result = runtime.topics.assign(docIds, { categoryId, categoryName });
            res.json({
                categories: result.categories,
                assigned: result.added,
                category: result.category,
            });
        }
        catch (error) {
            throw new HttpError(400, error instanceof Error ? error.message : '归类失败');
        }
    }));
    router.post('/topics/unassign', wrap(async (req, res) => {
        if (!req.auth)
            throw new HttpError(401, '请先登录后再管理主题分类');
        const body = (req.body ?? {});
        const rawIds = Array.isArray(body.docIds) ? body.docIds : [];
        const docIds = rawIds
            .filter((id) => typeof id === 'string')
            .map((id) => id.trim())
            .filter(Boolean);
        const categoryId = firstValue(body.categoryId)?.trim() || '';
        if (docIds.length === 0)
            throw new HttpError(400, '请先选择主帖');
        if (!categoryId)
            throw new HttpError(400, '请选择要移出的分类');
        try {
            const result = runtime.topics.unassign(docIds, categoryId);
            res.json({
                categories: result.categories,
                removed: result.removed,
                category: result.category,
            });
        }
        catch (error) {
            throw new HttpError(400, error instanceof Error ? error.message : '移出分类失败');
        }
    }));
    router.post('/topics/categories', wrap(async (req, res) => {
        if (!req.auth)
            throw new HttpError(401, '请先登录后再新建分类');
        const body = (req.body ?? {});
        const name = firstValue(body.name)?.trim() ?? '';
        const parentId = firstValue(body.parentId)?.trim() || undefined;
        if (!name)
            throw new HttpError(400, '分类名称不能为空');
        try {
            res.json({ categories: runtime.topics.createCategory(name, parentId) });
        }
        catch (error) {
            throw new HttpError(400, error instanceof Error ? error.message : '新建分类失败');
        }
    }));
    router.get('/thread/:rootId/descendants', wrap(async (req, res) => {
        const rootId = String(req.params.rootId ?? '');
        const parentId = firstValue(req.query.parent) ?? '';
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(rootId) || !/^[A-Za-z0-9_-]{1,80}$/.test(parentId)) {
            throw new HttpError(400, '非法的讨论树 ID');
        }
        const q = cleanQuery(firstValue(req.query.q));
        const core = resolveCore(req.query);
        const items = await runtime.serviceFor(core).getThreadDescendants(rootId, parentId, q);
        res.setHeader('Cache-Control', 'no-store');
        res.json({ items: items.map(toApiSearchHit), core, coreLabel: coreLabel(core) });
    }));
    router.get('/doc/:id', wrap(async (req, res) => {
        const id = String(req.params.id ?? '');
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(id))
            throw new HttpError(400, '非法的文档 ID');
        const q = cleanQuery(firstValue(req.query.q));
        const core = resolveCore(req.query);
        const url = firstValue(req.query.url);
        const detail = await runtime.serviceFor(core).getDocument(id, q, url);
        if (!detail)
            throw new HttpError(404, '未找到该文档，可能已被删除或尚未同步到索引');
        res.setHeader('Cache-Control', 'no-store');
        res.json({ ...toApiDocDetail(detail), core, coreLabel: coreLabel(core) });
    }));
    router.use((_req, res) => {
        res.status(404).json(errorBody(404, '接口不存在'));
    });
    router.use((error, _req, res, _next) => {
        if (error instanceof HttpError) {
            res.status(error.status).json(errorBody(error.status, error.message));
            return;
        }
        console.error('[api] 未处理异常:', error);
        res.status(500).json(errorBody(500, '检索服务暂时不可用，请稍后重试'));
    });
    return router;
}
//# sourceMappingURL=routes.js.map