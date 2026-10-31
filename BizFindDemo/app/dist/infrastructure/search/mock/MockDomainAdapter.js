import { fromMarkedHtml } from '../../../domain/search/model/HighlightedText.js';
import { MockSearchAdapter } from './MockSearchAdapter.js';
/**
 * 把既有 Mock API 结果适配为领域模型。
 *
 * Mock 内部仍保留 HTML 渲染以复用已有逻辑；adapter 在边界处解析为中性
 * HighlightedText。将来 Mock 可以直接产出领域模型，无需改 application。
 */
export class MockDomainAdapter {
    legacy;
    kind = 'mock';
    demo = true;
    constructor(legacy) {
        this.legacy = legacy;
    }
    toDomainHit(hit) {
        const { titleHtml, snippetHtml, ...rest } = hit;
        return {
            ...rest,
            title: fromMarkedHtml(titleHtml),
            ...(snippetHtml ? { snippet: fromMarkedHtml(snippetHtml) } : {}),
        };
    }
    toDomainDetail(detail) {
        return {
            doc: detail.doc,
            title: fromMarkedHtml(detail.titleHtml),
            summary: fromMarkedHtml(detail.summaryHtml),
            content: detail.contentHtml.map((paragraph) => fromMarkedHtml(paragraph)),
            tags: detail.tagsHtml.map((tag) => fromMarkedHtml(tag)),
            related: detail.related.map((hit) => this.toDomainHit(hit)),
            insight: detail.insight,
            backend: detail.backend,
        };
    }
    async search(query) {
        const response = await this.legacy.search(query);
        return {
            ...response,
            results: response.results.map((hit) => this.toDomainHit(hit)),
        };
    }
    suggest(prefix, limit) {
        return this.legacy.suggest(prefix, limit);
    }
    async getDocument(id, q) {
        const detail = await this.legacy.getDocument(id, q);
        return detail ? this.toDomainDetail(detail) : null;
    }
    stats() {
        return this.legacy.stats();
    }
    close() {
        return this.legacy.close();
    }
}
//# sourceMappingURL=MockDomainAdapter.js.map