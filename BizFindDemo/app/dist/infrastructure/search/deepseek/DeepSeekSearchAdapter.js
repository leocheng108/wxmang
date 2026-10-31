import { fromMarkedHtml } from '../../../domain/search/model/HighlightedText.js';
import { highlightHtml, segmentQuery, SYNONYM_GROUPS } from '../../../domain/content/text.js';
import { DeepSeekClient } from './DeepSeekClient.js';
import { DeepSeekDocumentCache } from './DeepSeekDocumentCache.js';
import { markdownToParagraphs, markdownToText } from './DeepSeekContent.js';
import { toExternalHit } from './DeepSeekResultMapper.js';
const QUERY_VOCABULARY = new Set(SYNONYM_GROUPS.flat().map((term) => term.toLowerCase()));
function safeUrl(value) {
    if (!value)
        return undefined;
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:'
            ? parsed.toString()
            : undefined;
    }
    catch {
        return undefined;
    }
}
function eventDay() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
}
/**
 * DeepSeek 实时外部检索适配器。
 * 搜索走 Search API，详情优先使用 Search 返回的 content，缺失时走 Fetch API。
 * 外部内容只读，不写入 Solr。
 */
export class DeepSeekSearchAdapter {
    config;
    documentCache;
    usage;
    kind = 'external';
    demo = false;
    client;
    fetcher;
    cache = new Map();
    fetched = new Map();
    indexed = new Map();
    constructor(config, client, documentCache, usage) {
        this.config = config;
        this.documentCache = documentCache;
        this.usage = usage;
        if (client) {
            this.client = client;
            this.fetcher = typeof client.fetchPage === 'function' ? client : undefined;
        }
        else {
            const defaultClient = new DeepSeekClient(config, usage);
            this.client = defaultClient;
            this.fetcher = defaultClient;
        }
    }
    recordCacheHit(operation) {
        try {
            this.usage?.record({
                operation,
                outcome: 'cache_hit',
                billable: false,
                costYuan: 0,
                eventDay: eventDay(),
                createdAt: new Date().toISOString(),
            });
        }
        catch {
            // 账本写入失败不影响检索
        }
    }
    terms(query) {
        const cleaned = query
            .replace(/(?:^|\s)-?(?:site|lang|after|before):\S+/gi, ' ')
            .replace(/(?:^|\s)-\S+/g, ' ')
            .replace(/[()"]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const source = cleaned || query;
        const segmented = segmentQuery(source, QUERY_VOCABULARY).filter(Boolean);
        const fallback = source.split(/[\s,，、;；]+/).filter(Boolean);
        return [...new Set([...segmented, ...fallback])]
            .filter((term) => /[\u4e00-\u9fff]/.test(term) || term.length >= 3)
            .slice(0, 8);
    }
    cached(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return null;
        if (entry.expiresAt <= Date.now()) {
            this.cache.delete(key);
            return null;
        }
        return entry;
    }
    async fetchContent(url) {
        const cached = this.fetched.get(url);
        if (cached && cached.expiresAt > Date.now()) {
            this.recordCacheHit('fetch');
            return { page: cached.page };
        }
        if (cached)
            this.fetched.delete(url);
        if (!this.fetcher)
            return { error: '当前外部数据源未配置正文抓取客户端' };
        try {
            const page = await this.fetcher.fetchPage(url);
            if (!page.content?.trim())
                return { error: 'Fetch 返回了空正文' };
            this.fetched.set(url, {
                expiresAt: Date.now() + this.config.cacheTtlMs,
                page,
            });
            while (this.fetched.size > 50) {
                const oldest = this.fetched.keys().next().value;
                if (!oldest)
                    break;
                this.fetched.delete(oldest);
            }
            return { page };
        }
        catch (error) {
            return { error: error instanceof Error ? error.message : 'Fetch 抓取失败' };
        }
    }
    async search(query) {
        const q = query.q.trim().slice(0, 128);
        if (!q)
            throw new Error('外部检索词不能为空');
        const count = Math.max(1, Math.min(50, Math.max(this.config.count, query.pageSize)));
        const key = `${q}\u0000${count}`;
        const started = Date.now();
        const cachedEntry = this.cached(key);
        let entry = cachedEntry;
        if (entry) {
            this.recordCacheHit('search');
        }
        else {
            const results = await this.client.search(q, count);
            entry = {
                expiresAt: Date.now() + this.config.cacheTtlMs,
                results,
                tookMs: Date.now() - started,
            };
            this.cache.set(key, entry);
            while (this.cache.size > 30) {
                const oldest = this.cache.keys().next().value;
                if (!oldest)
                    break;
                this.cache.delete(oldest);
            }
        }
        const terms = this.terms(q);
        const mapped = entry.results
            .map((result) => {
            const hit = toExternalHit(result, terms);
            return hit ? { hit, result } : null;
        })
            .filter((item) => Boolean(item));
        for (const item of mapped) {
            this.indexed.set(item.hit.id, { result: item.result, terms });
            if (this.documentCache && item.result.content?.trim()) {
                this.documentCache.put({
                    id: item.hit.id,
                    url: item.hit.url,
                    title: item.hit.title.text,
                    content: item.result.content,
                    source: item.hit.source,
                    updatedAt: item.hit.updatedAt,
                    fetchedAt: new Date().toISOString(),
                });
            }
        }
        while (this.indexed.size > 100) {
            const oldest = this.indexed.keys().next().value;
            if (!oldest)
                break;
            this.indexed.delete(oldest);
        }
        const hits = mapped.map((item) => item.hit);
        const total = hits.length;
        const start = (query.page - 1) * query.pageSize;
        const results = hits.slice(start, start + query.pageSize);
        const maxScore = hits.reduce((max, hit) => Math.max(max, hit.score), 0);
        return {
            query: q,
            page: query.page,
            pageSize: query.pageSize,
            total,
            tookMs: entry.tookMs,
            backend: 'external',
            core: this.config.sourceName,
            coreLabel: this.config.sourceLabel,
            notice: '外部 Web 结果由 DeepSeek 实时检索；点击结果查看正文，或打开原网页。',
            insight: {
                terms,
                synonyms: [],
                fuzzy: [],
                notes: ['外部 Web 结果按 DeepSeek 相关性排序；正文由 DeepSeek Search/Fetch 返回，不在本地索引。'],
            },
            results,
            facets: [],
            authors: [],
            relatedQueries: [],
            maxScore,
        };
    }
    async suggest(_prefix, _limit) {
        // 外部搜索没有 autocomplete，避免每次按键产生 API 费用
        return [];
    }
    async getDocument(id, q, url) {
        const indexed = this.indexed.get(id);
        const cached = this.documentCache?.get(id) ?? null;
        // 只允许打开当前搜索命中的结果或已缓存正文，避免把详情接口变成任意 URL 抓取代理。
        if (!indexed && !cached)
            return null;
        const sourceUrl = safeUrl(indexed?.result.url) ?? safeUrl(cached?.url) ?? safeUrl(url);
        if (!sourceUrl)
            return null;
        const result = indexed?.result ?? {
            url: sourceUrl,
            title: cached?.title,
            site_name: cached?.source,
            date: cached?.updatedAt,
        };
        const terms = this.terms(q || result.title || '');
        let title = result.title?.trim() || cached?.title || new URL(sourceUrl).hostname;
        let content = result.content?.trim() ?? cached?.content ?? '';
        let notice = '';
        if (!result.content?.trim() && cached?.content)
            this.recordCacheHit('fetch');
        if (content) {
            notice =
                cached && !result.content
                    ? '正文来自本地外部内容缓存；如需最新版本请打开原网页。'
                    : '正文来自 DeepSeek Search 索引；如需最新版本请打开原网页。';
        }
        else {
            const fetched = await this.fetchContent(sourceUrl);
            if (fetched.page?.content?.trim()) {
                content = fetched.page.content.trim();
                title = fetched.page.title?.trim() || title;
                notice = '正文由 DeepSeek Fetch 实时抓取；可打开原网页核对最新内容。';
            }
            else {
                notice = `${fetched.error ?? '未能抓取正文'}；可打开原网页查看。`;
            }
        }
        if (content && this.documentCache && !cached) {
            this.documentCache.put({
                id,
                url: sourceUrl,
                title,
                content,
                source: result.site_name?.trim() || new URL(sourceUrl).hostname,
                updatedAt: result.date ?? '',
                fetchedAt: new Date().toISOString(),
            });
        }
        const summaryText = markdownToText(result.snippet || result.summary || content, 360);
        const paragraphs = markdownToParagraphs(content);
        const highlight = (text) => fromMarkedHtml(highlightHtml(text, terms));
        const doc = {
            id,
            title,
            url: sourceUrl,
            source: result.site_name?.trim() || new URL(sourceUrl).hostname,
            category: '外部 Web',
            department: '',
            author: result.site_name?.trim() || '外部网页',
            updatedAt: result.date ?? '',
            tags: ['外部 Web'],
            summary: summaryText,
            content: paragraphs,
            attachments: [],
            popularity: 0,
        };
        return {
            doc,
            title: highlight(title),
            summary: highlight(summaryText),
            content: paragraphs.map(highlight),
            tags: ['外部 Web'].map(highlight),
            related: [],
            insight: {
                terms,
                synonyms: [],
                fuzzy: [],
                notes: ['外部 Web 详情；正文由 DeepSeek Search/Fetch 返回，不写入内部索引。'],
            },
            backend: 'external',
            ...(notice ? { notice } : {}),
        };
    }
    async stats() {
        return {
            docCount: 0,
            categories: [],
            sources: [],
            hotQueries: [],
            updatedAt: new Date().toISOString(),
            backend: 'external',
            demo: false,
        };
    }
    async close() {
        this.cache.clear();
        this.fetched.clear();
        this.indexed.clear();
        this.documentCache?.close();
    }
}
//# sourceMappingURL=DeepSeekSearchAdapter.js.map