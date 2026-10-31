import { extractKeywords } from '../../domain/content/annotationKeywords.js';
const PAGE_SIZE = 8;
/**
 * 用批注内容去检索语料，给「右侧相关文档」提供增量推荐。
 * 三条硬规则：排除当前文档、排除同标签、宁缺勿滥（最多 limit 条）。
 */
export class AnnotationRecommendationService {
    search;
    constructor(search) {
        this.search = search;
    }
    async recommend(input) {
        const limit = Math.min(2, Math.max(1, input.limit ?? 2));
        const gate = extractKeywords(input.text);
        if (!gate.ok)
            return { terms: [], items: [], reason: gate.reason };
        const doc = await this.search.getDocument(input.docId, '');
        if (!doc)
            return { terms: gate.terms, items: [], reason: 'no-doc' };
        const docTags = new Set((doc.tags ?? []).map((tag) => tag.text));
        const docAuthor = doc.doc.author ?? '';
        const found = new Map();
        for (const term of gate.terms.slice(0, 2)) {
            const query = { q: term, page: 1, pageSize: PAGE_SIZE, sort: 'relevance' };
            const page = await this.search.search(query);
            for (const hit of page.results) {
                if (hit.id === input.docId)
                    continue;
                if (hit.tags.some((tag) => docTags.has(tag)))
                    continue;
                // 只认字面出现过的词：标题或摘录里必须能在文本中看到，否则不算命中
                const haystack = `${hit.title.text} ${hit.snippet?.text ?? ''}`;
                const literal = gate.terms.filter((candidate) => haystack.includes(candidate));
                if (literal.length === 0)
                    continue;
                const existing = found.get(hit.id);
                if (existing) {
                    for (const candidate of literal) {
                        if (!existing.because.includes(candidate))
                            existing.because.push(candidate);
                    }
                    existing.score = Math.max(existing.score, hit.score);
                    continue;
                }
                found.set(hit.id, {
                    id: hit.id,
                    title: hit.title.text,
                    author: hit.author,
                    updatedAt: hit.updatedAt,
                    because: literal,
                    sameAuthor: docAuthor !== '' && hit.author === docAuthor,
                    score: hit.score,
                });
            }
        }
        // 宁缺勿滥：同名标题只留一条，再看命中词数与得分
        const seenTitles = new Set();
        const items = [...found.values()]
            .sort((a, b) => b.because.length - a.because.length || b.score - a.score)
            .filter((item) => {
            const key = item.title.replace(/\s+/g, '').slice(0, 40);
            if (seenTitles.has(key))
                return false;
            seenTitles.add(key);
            return true;
        })
            .slice(0, limit);
        return { terms: gate.terms, items, reason: items.length > 0 ? undefined : 'no-match' };
    }
}
//# sourceMappingURL=AnnotationRecommendationService.js.map