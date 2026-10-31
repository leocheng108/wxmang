import { HOT_QUERIES, cleanQuery, dedupe, } from '../../../domain/content/text.js';
import { SolrClient, escapeSolrQuery, quoteSolrValue } from './SolrClient.js';
import { SolrQueryTranslator } from './SolrQueryTranslator.js';
import { buildSuggestionItem, cleanFacetLabel, facetPairs, readString, SolrResultMapper, } from './SolrResultMapper.js';
/**
 * Solr 适配层：查询构造、字段映射、高亮清洗、分面与统计。
 * 通过 SolrProfile 适配不同的 Core 字段结构；当前内置 wxmang 与 default 两套配置。
 */
export class SolrSearchAdapter {
    client;
    config;
    kind = 'solr';
    demo = false;
    hotCache = null;
    queryTranslator;
    resultMapper;
    constructor(client, config) {
        this.client = client;
        this.config = config;
        this.queryTranslator = new SolrQueryTranslator(config);
        this.resultMapper = new SolrResultMapper(config);
    }
    ping() {
        return this.client.ping();
    }
    get profile() {
        return this.config.profile;
    }
    get fields() {
        return this.profile.fields;
    }
    queryTerms(query) {
        return this.resultMapper.queryTerms(query);
    }
    buildFl(includeScore = true, includeContent = false) {
        return this.queryTranslator.buildFl(includeScore, includeContent);
    }
    buildSearchParams(query, mode) {
        return this.queryTranslator.buildSearchParams(query, mode);
    }
    async search(query) {
        const started = performance.now();
        let matchMode = 'phrase';
        let raw = await this.client.select(this.buildSearchParams(query, 'phrase'));
        if (raw.error) {
            throw new Error(`Solr 查询失败：${raw.error.msg ?? raw.error.code ?? '未知错误'}`);
        }
        // 第一段：完整短语没有命中任何内容，才回退到 IK 分词检索
        if (Number(raw.response?.numFound ?? 0) === 0) {
            matchMode = 'tokenized';
            raw = await this.client.select(this.buildSearchParams(query, 'tokenized'));
            if (raw.error) {
                throw new Error(`Solr 查询失败：${raw.error.msg ?? raw.error.code ?? '未知错误'}`);
            }
        }
        const documents = raw.response?.docs ?? [];
        const terms = this.queryTerms(query.q);
        const maxScore = Math.max(Number(raw.response?.maxScore ?? 0), ...documents.map((doc) => Number(doc.score ?? 0)));
        const results = documents.map((doc) => {
            const id = readString(doc, 'id');
            return this.resultMapper.toHit(doc, raw.highlighting?.[id] ?? {}, maxScore, terms);
        });
        const spellcheck = this.resultMapper.parseSpellcheck(raw.spellcheck);
        const authors = this.fields.author
            ? facetPairs(raw.facet_counts?.facet_fields?.[this.fields.author]).map((bucket) => ({
                value: bucket.value,
                count: bucket.count,
            }))
            : [];
        return {
            query: cleanQuery(query.q),
            page: query.page,
            pageSize: query.pageSize,
            total: Number(raw.response?.numFound ?? 0),
            tookMs: Math.max(0.1, Math.round((performance.now() - started) * 100) / 100),
            backend: 'solr',
            matchMode,
            insight: this.resultMapper.buildInsight(query.q, spellcheck, matchMode),
            results,
            facets: this.resultMapper.parseFacets(raw.facet_counts?.facet_fields),
            authors,
            relatedQueries: await this.relatedQueries(results),
            didYouMean: spellcheck.collation,
            maxScore: Math.round(maxScore * 100) / 100,
        };
    }
    async hotQueries() {
        if (this.hotCache)
            return this.hotCache;
        if (this.profile.name === 'default') {
            this.hotCache = [...HOT_QUERIES];
            return this.hotCache;
        }
        const facet = this.profile.facets.find((item) => item.field === 'category') ?? this.profile.facets[0];
        if (!facet) {
            this.hotCache = [];
            return this.hotCache;
        }
        try {
            const raw = await this.client.select({
                q: '*:*',
                rows: 0,
                facet: 'on',
                'facet.field': facet.solrField,
                'facet.mincount': 1,
                'facet.limit': 12,
            });
            const names = facetPairs(raw.facet_counts?.facet_fields?.[facet.solrField])
                .map((bucket) => cleanFacetLabel(bucket.value))
                .filter((value) => value.length > 0 && !value.includes('|'))
                .slice(0, 8);
            this.hotCache = dedupe(names);
        }
        catch {
            this.hotCache = [];
        }
        return this.hotCache;
    }
    async relatedQueries(results) {
        const tags = new Map();
        for (const hit of results.slice(0, 6)) {
            for (const tag of hit.tags)
                tags.set(tag, (tags.get(tag) ?? 0) + 1);
        }
        const related = [...tags.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([tag]) => tag)
            .slice(0, 3);
        for (const hot of await this.hotQueries()) {
            if (related.length >= 6)
                break;
            if (!related.includes(hot))
                related.push(hot);
        }
        return related;
    }
    async suggest(prefix, limit) {
        const query = cleanQuery(prefix);
        if (!query) {
            const hot = await this.hotQueries();
            return hot.slice(0, limit).map((text) => ({
                text,
                type: 'hot',
                hint: '热门标签',
            }));
        }
        if (this.profile.suggester) {
            try {
                const raw = await this.client.request(this.config.suggestPath, {
                    'suggest.q': query,
                    'suggest.count': limit,
                    'suggest.dictionary': this.config.suggestDictionary,
                });
                const dictionaries = raw.suggest ?? {};
                const dictionary = dictionaries[this.config.suggestDictionary] ?? Object.values(dictionaries)[0];
                const queryEntries = dictionary?.query ?? {};
                const first = Object.values(queryEntries)[0];
                const suggestions = (first?.suggestions ?? [])
                    .filter((entry) => typeof entry.term === 'string')
                    .slice(0, limit)
                    .map((entry) => ({
                    text: entry.term,
                    type: 'keyword',
                    hint: 'Solr 联想',
                }));
                if (suggestions.length > 0)
                    return suggestions;
            }
            catch {
                // 未配置 suggester 时继续使用标题联想
            }
        }
        const titleField = this.fields.title;
        if (!titleField)
            return [];
        const contentField = this.fields.content;
        const terms = query.split(/[\s,，、;；]+/).filter(Boolean);
        try {
            const raw = await this.client.select({
                q: escapeSolrQuery(query),
                defType: 'edismax',
                qf: contentField ? `${titleField}^4 ${contentField}^1` : titleField,
                ...(contentField ? { pf: `${titleField}^8 ${contentField}^4` } : {}),
                bq: `${titleField}:(${quoteSolrValue(query)})^80`,
                mm: '1',
                rows: Math.min(60, Math.max(limit * 6, limit)),
                fl: dedupe(['id', titleField, contentField].filter(Boolean)).join(','),
                sort: 'score desc',
                hl: 'on',
                'hl.fl': dedupe([titleField, contentField].filter(Boolean)).join(','),
                'hl.method': 'unified',
                'hl.simple.pre': '<mark>',
                'hl.simple.post': '</mark>',
                'hl.fragsize': 140,
                'hl.snippets': 1,
                'hl.requireFieldMatch': 'true',
            });
            const documents = raw.response?.docs ?? [];
            const items = [];
            const seen = new Set();
            for (const doc of documents) {
                const id = readString(doc, 'id');
                const item = buildSuggestionItem(doc, raw.highlighting?.[id], titleField, contentField, terms);
                if (!item || seen.has(item.text))
                    continue;
                seen.add(item.text);
                items.push(item);
                if (items.length >= limit)
                    break;
            }
            return items;
        }
        catch {
            return [];
        }
    }
    async getDocument(id, q) {
        const raw = await this.client.select({
            q: `id:${quoteSolrValue(id)}`,
            rows: 1,
            fl: '*',
        });
        const source = raw.response?.docs?.[0];
        if (!source)
            return null;
        const doc = this.resultMapper.toDocRecord(source);
        const terms = this.resultMapper.highlightTerms(q);
        const related = await this.fetchRelated(doc, terms);
        const thread = await this.buildThread(doc, q);
        return this.resultMapper.toDocDetail(doc, q, related, thread);
    }
    async buildThread(doc, q) {
        if (this.profile.name !== 'wxmang')
            return undefined;
        const rootId = doc.rootId || doc.id;
        let rootTitle = doc.id === rootId ? doc.title : '';
        if (!rootTitle) {
            const rootRaw = await this.client.select({
                q: `id:${quoteSolrValue(rootId)}`,
                rows: 1,
                fl: 'id,title',
            });
            rootTitle = readString(rootRaw.response?.docs?.[0], 'title') || rootId;
        }
        const replies = (doc.depth ?? 0) === 0
            ? await this.fetchThreadReplies(doc.id, q, 200)
            : [];
        return {
            rootId,
            rootTitle,
            parentId: doc.parentId ?? '0',
            depth: doc.depth ?? 0,
            replies,
        };
    }
    async fetchThreadReplies(parentId, q, limit) {
        const fields = this.fields;
        const raw = await this.client.select({
            q: `parentId:${quoteSolrValue(parentId)}`,
            rows: limit,
            fl: this.buildFl(false, true),
            sort: fields.updatedAt ? `${fields.updatedAt} asc` : 'id asc',
        });
        const documents = raw.response?.docs ?? [];
        const terms = this.resultMapper.highlightTerms(q);
        const maxScore = Math.max(1, ...documents.map((item) => Number(item.score ?? 0)));
        return documents.map((item) => {
            const itemId = readString(item, 'id');
            return this.resultMapper.toHit(item, raw.highlighting?.[itemId] ?? {}, maxScore, terms);
        });
    }
    async getThreadDescendants(rootId, parentId, q) {
        if (this.profile.name !== 'wxmang')
            return [];
        const raw = await this.client.select({
            q: `rootId:${quoteSolrValue(rootId)}`,
            rows: 2000,
            fl: this.buildFl(false, true),
            sort: 'depth asc, id asc',
        });
        const documents = raw.response?.docs ?? [];
        const byParent = new Map();
        for (const item of documents) {
            const parent = readString(item, 'parentId');
            const bucket = byParent.get(parent) ?? [];
            bucket.push(item);
            byParent.set(parent, bucket);
        }
        const descendants = [];
        const walk = (id) => {
            for (const child of byParent.get(id) ?? []) {
                descendants.push(child);
                walk(readString(child, 'id'));
            }
        };
        walk(parentId);
        const terms = this.resultMapper.highlightTerms(q);
        const maxScore = Math.max(1, ...documents.map((item) => Number(item.score ?? 0)));
        return descendants.map((item) => {
            const itemId = readString(item, 'id');
            return this.resultMapper.toHit(item, raw.highlighting?.[itemId] ?? {}, maxScore, terms);
        });
    }
    async fetchRelated(doc, terms) {
        const fields = this.fields;
        const categoryField = fields.category || fields.tags;
        const clauses = [];
        if (doc.tags.length > 0 && categoryField) {
            const tagQuery = doc.tags
                .slice(0, 4)
                .map((tag) => quoteSolrValue(tag))
                .join(' OR ');
            clauses.push(`${categoryField}:(${tagQuery})`);
        }
        if (fields.author && doc.author && doc.author !== '匿名') {
            clauses.push(`${fields.author}:${quoteSolrValue(doc.author)}`);
        }
        if (clauses.length === 0)
            return [];
        try {
            const raw = await this.client.select({
                q: clauses.join(' OR '),
                fq: `-id:${quoteSolrValue(doc.id)}`,
                rows: 6,
                fl: this.buildFl(false, true),
                sort: fields.updatedAt ? `${fields.updatedAt} desc` : 'score desc',
            });
            const documents = raw.response?.docs ?? [];
            const maxScore = Math.max(0, ...documents.map((item) => Number(item.score ?? 0)));
            return documents
                .map((item) => {
                const hit = this.resultMapper.toHit(item, {}, maxScore, terms);
                return { ...hit, matchedFields: ['标签', '时效'] };
            })
                .filter((hit) => hit.title.text !== '未命名内容')
                .slice(0, 4);
        }
        catch {
            return [];
        }
    }
    async stats() {
        const fields = this.fields;
        const facet = this.profile.facets.find((item) => item.field === 'category');
        const params = {
            q: '*:*',
            rows: 1,
            fl: dedupe(['id', fields.updatedAt]).filter(Boolean).join(','),
        };
        if (fields.updatedAt)
            params.sort = `${fields.updatedAt} desc`;
        if (facet) {
            params.facet = 'on';
            params['facet.field'] = facet.solrField;
            params['facet.mincount'] = 1;
            params['facet.limit'] = 20;
        }
        const raw = await this.client.select(params);
        const categoryCounts = new Map();
        if (facet) {
            for (const bucket of facetPairs(raw.facet_counts?.facet_fields?.[facet.solrField])) {
                const name = cleanFacetLabel(bucket.value);
                if (!name || name.includes('|'))
                    continue;
                categoryCounts.set(name, (categoryCounts.get(name) ?? 0) + bucket.count);
            }
        }
        const categories = [...categoryCounts.entries()]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);
        if (!this.hotCache) {
            this.hotCache = categories.map((category) => category.name).slice(0, 8);
        }
        const sourceFacet = this.profile.facets.find((item) => item.field === 'source');
        const sources = sourceFacet
            ? facetPairs(raw.facet_counts?.facet_fields?.[sourceFacet.solrField]).map((bucket) => ({
                name: bucket.value,
                count: bucket.count,
            }))
            : [];
        return {
            docCount: Number(raw.response?.numFound ?? 0),
            categories,
            sources,
            hotQueries: await this.hotQueries(),
            updatedAt: readString(raw.response?.docs?.[0], fields.updatedAt),
            backend: 'solr',
            demo: false,
        };
    }
    async close() {
        // fetch 连接由运行时管理，无需显式关闭
    }
}
//# sourceMappingURL=SolrSearchAdapter.js.map