function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
/** 把中性高亮文本渲染为当前客户端需要的 HTML；这是展示适配，不是领域逻辑。 */
export function renderHighlightedText(value) {
    const text = value.text;
    const ranges = [...value.ranges]
        .filter((range) => range.end > range.start)
        .sort((a, b) => a.start - b.start);
    let result = '';
    let cursor = 0;
    for (const range of ranges) {
        const start = Math.max(cursor, Math.min(text.length, range.start));
        const end = Math.max(start, Math.min(text.length, range.end));
        if (end <= start)
            continue;
        result += escapeHtml(text.slice(cursor, start)).replace(/\n/g, '<br>');
        result += `<mark>${escapeHtml(text.slice(start, end)).replace(/\n/g, '<br>')}</mark>`;
        cursor = end;
    }
    result += escapeHtml(text.slice(cursor)).replace(/\n/g, '<br>');
    return result;
}
export function toApiSearchHit(hit) {
    return {
        id: hit.id,
        title: hit.title.text,
        titleHtml: renderHighlightedText(hit.title),
        url: hit.url,
        source: hit.source,
        category: hit.category,
        department: hit.department,
        author: hit.author,
        updatedAt: hit.updatedAt,
        tags: hit.tags,
        snippetHtml: hit.snippet ? renderHighlightedText(hit.snippet) : '',
        score: hit.score,
        matchRate: hit.matchRate,
        matchedFields: hit.matchedFields,
        ...(hit.parentId ? { parentId: hit.parentId } : {}),
        ...(hit.rootId ? { rootId: hit.rootId } : {}),
        ...(hit.depth !== undefined ? { depth: hit.depth } : {}),
        ...(hit.directReplyCount !== undefined ? { directReplyCount: hit.directReplyCount } : {}),
        ...(hit.external ? { external: true } : {}),
    };
}
export function toApiSearchPage(page, core, coreLabel) {
    return {
        query: page.query,
        page: page.page,
        pageSize: page.pageSize,
        total: page.total,
        tookMs: page.tookMs,
        backend: page.backend,
        core,
        coreLabel,
        matchMode: page.matchMode,
        notice: page.notice,
        insight: page.insight,
        results: page.results.map(toApiSearchHit),
        facets: page.facets,
        authors: page.authors,
        relatedQueries: page.relatedQueries,
        didYouMean: page.didYouMean,
        maxScore: page.maxScore,
    };
}
export function toApiDocDetail(detail) {
    return {
        doc: detail.doc,
        titleHtml: renderHighlightedText(detail.title),
        summaryHtml: renderHighlightedText(detail.summary),
        contentHtml: detail.content.map(renderHighlightedText),
        tagsHtml: detail.tags.map(renderHighlightedText),
        related: detail.related.map(toApiSearchHit),
        ...(detail.thread
            ? {
                thread: {
                    ...detail.thread,
                    replies: detail.thread.replies.map(toApiSearchHit),
                },
            }
            : {}),
        insight: detail.insight,
        backend: detail.backend,
        ...(detail.notice ? { notice: detail.notice } : {}),
    };
}
//# sourceMappingURL=searchResponseAssembler.js.map