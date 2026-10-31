import { createHash } from 'node:crypto';
import { fromMarkedHtml } from '../../../domain/search/model/HighlightedText.js';
import { highlightHtml } from '../../../domain/content/text.js';
function safeUrl(value) {
    if (!value)
        return null;
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
    }
    catch {
        return null;
    }
}
function cleanSummary(result) {
    const raw = result.snippet?.trim() || result.summary?.trim() || '';
    return raw
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\*\*/g, '')
        .replace(/\s+/g, ' ')
        .slice(0, 260);
}
/**
 * 把 DeepSeek Search 结果映射为内部命中模型。
 * 外部结果不进入内部详情，保留 external 标记，由前端直接打开原网页。
 */
export function toExternalHit(result, terms) {
    const url = safeUrl(result.url);
    if (!url)
        return null;
    const host = new URL(url).hostname;
    const title = result.title?.trim() || host;
    const snippet = cleanSummary(result);
    const score = Number.isFinite(result.rerank_score) ? Number(result.rerank_score) : 0;
    const source = result.site_name?.trim() || host;
    const id = `deepseek-${createHash('sha1').update(url).digest('hex').slice(0, 16)}`;
    return {
        id,
        title: fromMarkedHtml(highlightHtml(title, terms)),
        url,
        source,
        category: '外部 Web',
        department: '',
        author: source,
        updatedAt: result.date ?? '',
        tags: ['外部'],
        ...(snippet ? { snippet: fromMarkedHtml(highlightHtml(snippet, terms)) } : {}),
        score,
        matchRate: score > 0 ? Math.max(1, Math.min(99, Math.round((score / 3) * 99))) : 0,
        matchedFields: ['外部 Web'],
        external: true,
    };
}
//# sourceMappingURL=DeepSeekResultMapper.js.map