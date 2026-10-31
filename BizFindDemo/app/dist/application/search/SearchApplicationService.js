function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
/**
 * 检索用例编排层。
 *
 * 只负责选择主后端、失败回退和响应装饰，不依赖 Solr/Express。
 * 具体 Solr/Mock 实现通过 SearchProvider 端口注入。
 */
export class SearchApplicationService {
    primary;
    fallback;
    notice;
    constructor(primary, fallback, notice) {
        this.primary = primary;
        this.fallback = fallback;
        this.notice = notice;
    }
    get backend() {
        return this.primary.kind;
    }
    decorate(response) {
        if (response.backend === 'mock' && !response.notice && this.notice) {
            return { ...response, notice: this.notice };
        }
        return response;
    }
    async search(query) {
        try {
            return this.decorate(await this.primary.search(query));
        }
        catch (error) {
            if (this.primary.kind !== 'solr')
                throw error;
            const response = await this.fallback.search(query);
            return this.decorate({
                ...response,
                backend: 'mock',
                notice: `Solr 请求失败，已自动回退到内置演示索引：${errorMessage(error)}`,
            });
        }
    }
    async suggest(prefix, limit) {
        try {
            const items = await this.primary.suggest(prefix, limit);
            if (items.length > 0 || this.primary.kind !== 'solr')
                return items;
        }
        catch (error) {
            if (this.primary.kind !== 'solr')
                throw error;
        }
        return this.fallback.suggest(prefix, limit);
    }
    async getDocument(id, q, url) {
        try {
            return await this.primary.getDocument(id, q, url);
        }
        catch (error) {
            if (this.primary.kind !== 'solr')
                throw error;
            return this.fallback.getDocument(id, q, url);
        }
    }
    async getThreadDescendants(rootId, parentId, q) {
        if (!this.primary.getThreadDescendants)
            return [];
        try {
            return await this.primary.getThreadDescendants(rootId, parentId, q);
        }
        catch (error) {
            if (this.primary.kind !== 'solr' || !this.fallback.getThreadDescendants)
                throw error;
            return this.fallback.getThreadDescendants(rootId, parentId, q);
        }
    }
    async stats() {
        try {
            return await this.primary.stats();
        }
        catch (error) {
            if (this.primary.kind !== 'solr')
                throw error;
            return this.fallback.stats();
        }
    }
    async close() {
        await Promise.allSettled([this.primary.close(), this.fallback.close()]);
    }
}
//# sourceMappingURL=SearchApplicationService.js.map