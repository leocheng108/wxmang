import { SolrClient } from '../../infrastructure/search/solr/SolrClient.js';
import { readString, readTags } from '../../infrastructure/search/solr/SolrResultMapper.js';
import { SqliteTopicCategoryStore } from '../../infrastructure/topics/SqliteTopicCategoryStore.js';
const SEED_CATEGORIES = ['管理科学', '数学'];
/**
 * 分类管理用例：只面向 wxmang 主帖。
 * 分类关系持久化在 SQLite，检索仍复用现有 SearchApplicationService/Solr 适配器。
 */
export class TopicApplicationService {
    client;
    store;
    seeded = false;
    constructor(solrConfig, search, dbPath) {
        this.coreName = solrConfig.defaultCore;
        this.client = new SolrClient({
            baseUrl: solrConfig.baseUrl,
            core: this.coreName,
            timeoutMs: solrConfig.timeoutMs,
        });
        this.store = new SqliteTopicCategoryStore(dbPath);
        this.searchService = search;
    }
    searchService;
    coreName;
    async initialize() {
        if (this.seeded)
            return;
        const assignments = new Map();
        try {
            const raw = await this.client.select({
                q: 'isRoot:1',
                rows: 2000,
                fl: 'id,tagName',
                sort: 'id asc',
            });
            for (const doc of raw.response?.docs ?? []) {
                const id = readString(doc, 'id');
                if (!id)
                    continue;
                for (const tag of readTags(doc, 'tagName')) {
                    const name = tag.replace(/\|+$/g, '').trim();
                    if (!name || name === '菜谱')
                        continue;
                    const bucket = assignments.get(name) ?? [];
                    bucket.push(id);
                    assignments.set(name, bucket);
                }
            }
            this.store.seed(assignments);
            for (const name of SEED_CATEGORIES)
                this.store.ensure(name);
            this.seeded = true;
        }
        catch (error) {
            console.warn('[topics] 初始化主题分类失败', error);
        }
    }
    async categories() {
        await this.initialize();
        const categories = this.rollup();
        const totalRoots = await this.countRoots();
        const assignedRoots = this.store.assignedDocCount();
        return {
            categories,
            totalRoots,
            assignedRoots,
            uncategorizedRoots: Math.max(0, totalRoots - assignedRoots),
        };
    }
    rollup() {
        const rows = this.store.list();
        const byId = new Map(rows.map((row) => [row.id, { ...row }]));
        for (const row of rows) {
            const direct = row.directCount ?? row.count;
            const current = byId.get(row.id);
            if (!current)
                continue;
            current.directCount = direct;
            current.count = row.parentId
                ? direct
                : this.store.docIdsDeep(row.id).length;
        }
        return [...byId.values()].sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.name.localeCompare(b.name, 'zh'));
    }
    async search(input) {
        await this.initialize();
        const query = input.q.trim();
        // 分类被删掉后，旧链接可能还带着它：按「无筛选」处理，而不是报错
        const requestedCategory = input.categoryId?.trim() || undefined;
        const categoryId = requestedCategory && this.store.find(requestedCategory) ? requestedCategory : undefined;
        const ids = categoryId ? this.store.docIdsDeep(categoryId) : undefined;
        if (categoryId && ids && ids.length === 0) {
            return {
                query,
                categoryId,
                page: input.page,
                pageSize: input.pageSize,
                total: 0,
                results: [],
            };
        }
        const searchQuery = {
            q: query || '*',
            page: input.page,
            pageSize: input.pageSize,
            sort: query ? 'relevance' : 'date',
            core: this.coreName,
            rootOnly: true,
            ...(ids ? { ids } : {}),
            ...(query ? {} : { allDocs: true }),
        };
        const page = await this.searchService.search(searchQuery);
        return {
            query,
            categoryId,
            page: page.page,
            pageSize: page.pageSize,
            total: page.total,
            results: page.results,
        };
    }
    /** 给定一批文档，按分类统计数量（用于「我批过几篇」） */
    countTracedDocs(docIds) {
        const counts = {};
        for (const docId of docIds) {
            for (const category of this.store.categoriesOfDoc(docId)) {
                counts[category.id] = (counts[category.id] ?? 0) + 1;
            }
        }
        return counts;
    }
    /** 当前文档若已归类，取同分类下的其他文档（最多 limit 篇） */
    async relatedByCategory(docId, limit = 3) {
        await this.initialize();
        const categories = this.store.categoriesOfDoc(docId);
        const category = categories[0];
        if (!category)
            return { categoryName: null, items: [] };
        const ids = this.store.docIdsDeep(category.id).filter((id) => id !== docId);
        if (ids.length === 0)
            return { categoryName: category.name, items: [] };
        const page = await this.searchService.search({
            q: '*',
            page: 1,
            pageSize: Math.min(Math.max(ids.length, limit * 3), 24),
            sort: 'date',
            core: this.coreName,
            rootOnly: true,
            ids,
            allDocs: true,
        });
        const items = page.results
            .filter((hit) => hit.id !== docId)
            .slice(0, limit)
            .map((hit) => ({
            id: hit.id,
            title: hit.title.text,
            author: hit.author,
            updatedAt: hit.updatedAt,
        }));
        return { categoryName: category.name, items };
    }
    assign(docIds, input) {
        const result = this.store.assign(docIds, input);
        return { ...result, categories: this.store.list() };
    }
    unassign(docIds, categoryId) {
        const result = this.store.unassign(docIds, categoryId);
        return { ...result, categories: this.store.list() };
    }
    /**
     * 删除分类：子分类一并删除，归档关系解除，文档本身不受影响。
     */
    deleteCategory(id) {
        return this.store.deleteCategory(id);
    }
    createCategory(name, parentId) {
        this.store.ensure(name, parentId);
        return this.rollup();
    }
    async countRoots() {
        try {
            const raw = await this.client.select({
                q: 'isRoot:1',
                rows: 0,
            });
            return Number(raw.response?.numFound ?? 0);
        }
        catch {
            return 0;
        }
    }
    close() {
        this.store.close();
    }
}
//# sourceMappingURL=TopicApplicationService.js.map