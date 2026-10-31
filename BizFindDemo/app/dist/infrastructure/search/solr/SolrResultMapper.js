import { fromMarkedHtml } from '../../../domain/search/model/HighlightedText.js';
import { buildParagraphSnippet, buildSnippet, cleanHighlightHtml, dedupe, expandSynonyms, highlightHtml, htmlToParagraphs, normalizeTerm, segmentQuery, stripHtml, toMatchRate, SYNONYM_GROUPS, } from '../../../domain/content/text.js';
const QUERY_VOCABULARY = new Set(SYNONYM_GROUPS.flat().map((term) => normalizeTerm(term)));
/** 从正文中取一段围绕命中词的摘录，供联想列表展示 content 命中 */
export function suggestionExcerpt(contentHtml, terms, maxLength = 110) {
    const paragraphs = htmlToParagraphs(contentHtml);
    const lowered = terms.map((term) => term.toLowerCase()).filter(Boolean);
    let paragraph = paragraphs.find((item) => {
        const text = item.toLowerCase();
        return lowered.some((term) => text.includes(term));
    });
    paragraph ??= paragraphs[0];
    if (!paragraph)
        return '';
    const text = paragraph.trim();
    if (text.length <= maxLength)
        return text;
    const lower = text.toLowerCase();
    const focus = lowered
        .map((term) => lower.indexOf(term))
        .filter((index) => index >= 0)
        .sort((a, b) => a - b)[0] ?? 0;
    const start = Math.max(0, Math.min(focus - 36, text.length - maxLength));
    return `${start > 0 ? '…' : ''}${text.slice(start, start + maxLength)}${start + maxLength < text.length ? '…' : ''}`;
}
/**
 * 联想结果来自检索引擎的命中，不再用原始字符串 includes 二次过滤。
 * 有高亮字段就用高亮判断标题/正文命中；没有高亮也保留该命中。
 */
export function buildSuggestionItem(doc, highlighting, titleField, contentField, terms) {
    const title = readString(doc, titleField);
    if (!title)
        return null;
    const id = readString(doc, 'id');
    const titleFragment = firstHighlight(highlighting, titleField);
    const contentFragment = contentField ? firstHighlight(highlighting, contentField) : undefined;
    const content = contentField ? readString(doc, contentField) : '';
    const titleText = title.toLowerCase();
    const titleHit = Boolean(titleFragment) &&
        (terms.length === 0 || terms.every((term) => titleText.includes(term.toLowerCase())));
    const excerpt = contentFragment
        ? stripHtml(contentFragment).trim()
        : content
            ? suggestionExcerpt(content, terms)
            : '';
    if (titleHit) {
        return { text: title, type: 'doc', hint: '标题命中', id };
    }
    if (contentFragment) {
        return {
            text: title,
            type: 'doc',
            hint: '正文命中',
            id,
            ...(excerpt ? { excerpt } : {}),
        };
    }
    return {
        text: title,
        type: 'doc',
        hint: '相关命中',
        id,
        ...(excerpt ? { excerpt } : {}),
    };
}
export function readString(doc, field) {
    if (!doc || !field)
        return '';
    const value = doc[field];
    if (typeof value === 'string')
        return value.trim();
    if (typeof value === 'number' && Number.isFinite(value))
        return String(value);
    if (Array.isArray(value)) {
        return value.filter((item) => typeof item === 'string').join(' ').trim();
    }
    return '';
}
export function readNumber(doc, field) {
    if (!doc || !field)
        return 0;
    const value = doc[field];
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}
export function readTags(doc, field) {
    if (!doc || !field)
        return [];
    const raw = doc[field];
    const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
    const tags = values.flatMap((value) => typeof value === 'string' ? value.split(/[|,，;；\n]+/) : []);
    return dedupe(tags.map((tag) => tag.trim()).filter(Boolean)).slice(0, 10);
}
export function firstHighlight(highlighting, field) {
    return highlighting?.[field]?.[0];
}
export function facetPairs(flat) {
    const buckets = [];
    if (!flat)
        return buckets;
    for (let index = 0; index + 1 < flat.length; index += 2) {
        buckets.push({ value: String(flat[index] ?? ''), count: Number(flat[index + 1] ?? 0) });
    }
    return buckets;
}
/** tagName 中可能存成 "教育|" 或 "易经|教育"，展示时去掉尾部分隔符 */
export function cleanFacetLabel(value) {
    return value.replace(/\|+$/g, '').trim();
}
/**
 * 把 Solr 响应映射为领域/API 结果。
 *
 * 这是基础设施内部的结果映射器：查询执行仍由 SolrSearchAdapter 负责；
 * 未来 ES 适配器使用自己的映射器，application 无需感知 Solr 文档结构。
 */
export class SolrResultMapper {
    config;
    constructor(config) {
        this.config = config;
    }
    get profile() {
        return this.config.profile;
    }
    get fields() {
        return this.profile.fields;
    }
    get contentHighlightField() {
        const fields = this.profile.highlightFields
            .split(',')
            .map((field) => field.trim().split('^')[0])
            .filter(Boolean);
        return fields.includes('content') ? 'content' : fields[0] ?? 'content';
    }
    queryTerms(query) {
        return segmentQuery(query, QUERY_VOCABULARY);
    }
    highlightTerms(query) {
        const terms = this.queryTerms(query);
        return dedupe([...terms, ...terms.flatMap((term) => expandSynonyms(term))]);
    }
    toHit(doc, highlighting, maxScore, fallbackTerms) {
        const fields = this.fields;
        const id = readString(doc, 'id');
        const rawTitle = readString(doc, fields.title);
        const tags = readTags(doc, fields.tags);
        const rawCategory = readString(doc, fields.category);
        const category = rawCategory.split(/[|,，;；]/)[0]?.trim() || tags[0] || '未分类';
        const summary = readString(doc, fields.summary);
        const titleFragment = firstHighlight(highlighting, fields.title);
        const summaryFragment = firstHighlight(highlighting, fields.summary || 'summary');
        const contentFragment = firstHighlight(highlighting, this.contentHighlightField);
        const contentMatch = (highlighting[this.contentHighlightField]?.length ?? 0) > 0;
        const snippetFragment = summaryFragment ?? contentFragment;
        const plainSnippet = snippetFragment ? stripHtml(snippetFragment) : '';
        const plainContent = readString(doc, fields.content);
        const contentParagraphs = plainContent ? htmlToParagraphs(plainContent) : [];
        const paragraphSnippet = contentParagraphs.length > 0
            ? buildParagraphSnippet(contentParagraphs, contentMatch ? fallbackTerms : [])
            : '';
        const contentTitle = plainContent ? stripHtml(plainContent) : '';
        const fallbackTitle = plainSnippet.length > 40
            ? `${plainSnippet.slice(0, 40)}…`
            : plainSnippet || (contentTitle.length > 40 ? `${contentTitle.slice(0, 40)}…` : contentTitle);
        const title = rawTitle || fallbackTitle || '未命名内容';
        const titleHighlight = fromMarkedHtml(titleFragment ? cleanHighlightHtml(titleFragment) : highlightHtml(title, fallbackTerms));
        const snippetHtml = paragraphSnippet
            ? paragraphSnippet
            : snippetFragment
                ? cleanHighlightHtml(snippetFragment)
                : summary
                    ? buildSnippet([summary], fallbackTerms, summary, 168)
                    : '';
        const labels = {
            title: '标题',
            summary: '摘要',
            content: '正文',
            tags: '标签',
        };
        const matchedFields = dedupe(Object.entries(highlighting)
            .filter(([, fragments]) => (fragments?.length ?? 0) > 0)
            .map(([field]) => labels[field] ?? field));
        return {
            id,
            title: titleHighlight,
            url: readString(doc, fields.url),
            source: readString(doc, fields.source) || this.profile.sourceFallback,
            category,
            department: readString(doc, fields.department),
            author: readString(doc, fields.author) || '匿名',
            updatedAt: readString(doc, fields.updatedAt),
            tags,
            ...(snippetHtml ? { snippet: fromMarkedHtml(snippetHtml) } : {}),
            score: Math.round(Number(doc.score ?? 0) * 100) / 100,
            matchRate: toMatchRate(Number(doc.score ?? 0), maxScore),
            matchedFields,
            ...(readString(doc, 'parentId') ? { parentId: readString(doc, 'parentId') } : {}),
            ...(readString(doc, 'rootId') ? { rootId: readString(doc, 'rootId') } : {}),
            ...(doc.depth !== undefined ? { depth: readNumber(doc, 'depth') } : {}),
            ...(doc.directReplyCount !== undefined
                ? { directReplyCount: readNumber(doc, 'directReplyCount') }
                : {}),
        };
    }
    parseFacets(facetFields) {
        if (!facetFields)
            return [];
        return this.profile.facets
            .map((facet) => ({
            field: facet.field,
            label: facet.label,
            buckets: facetPairs(facetFields[facet.solrField])
                .slice(0, 15)
                .map((bucket) => {
                const value = cleanFacetLabel(bucket.value);
                return {
                    value,
                    count: bucket.count,
                    ...(value !== bucket.value ? { filterValue: bucket.value } : {}),
                };
            })
                .filter((bucket) => bucket.value.length > 0),
        }))
            .filter((group) => group.buckets.length > 1);
    }
    parseSpellcheck(spellcheck) {
        const collations = spellcheck?.collations ?? [];
        for (const entry of collations) {
            if (typeof entry === 'string' && entry !== 'collation') {
                return { collation: entry };
            }
            if (entry && typeof entry === 'object') {
                const value = entry.collation;
                if (typeof value === 'string')
                    return { collation: value };
            }
        }
        return {};
    }
    buildInsight(query, spellcheck, matchMode) {
        const terms = this.queryTerms(query);
        const synonyms = terms
            .map((term) => ({ term, expansions: expandSynonyms(term) }))
            .filter((entry) => entry.expansions.length > 0);
        const notes = [
            matchMode === 'phrase'
                ? '完整短语命中，直接返回'
                : '完整短语未命中，已自动回退到分词检索',
            `Solr 检索字段：${this.profile.queryFields}`,
        ];
        if (spellcheck.collation)
            notes.push(`拼写建议：${spellcheck.collation}`);
        for (const entry of synonyms.slice(0, 2)) {
            notes.push(`同义词扩展：${entry.term} → ${entry.expansions.slice(0, 2).join('、')}`);
        }
        return { terms, synonyms, fuzzy: [], notes };
    }
    toDocDetail(doc, query, related, thread) {
        const terms = this.queryTerms(query);
        const highlightTerms = this.highlightTerms(query);
        return {
            doc,
            title: fromMarkedHtml(highlightHtml(doc.title, highlightTerms)),
            summary: fromMarkedHtml(highlightHtml(doc.summary, highlightTerms)),
            content: doc.content.map((paragraph) => fromMarkedHtml(highlightHtml(paragraph, highlightTerms))),
            tags: doc.tags.map((tag) => fromMarkedHtml(highlightHtml(tag, highlightTerms))),
            related,
            ...(thread ? { thread } : {}),
            insight: {
                terms,
                synonyms: terms
                    .map((term) => ({ term, expansions: expandSynonyms(term) }))
                    .filter((entry) => entry.expansions.length > 0),
                fuzzy: [],
                notes: terms.length > 0 ? ['详情页已按当前检索词高亮相关段落'] : [],
            },
            backend: 'solr',
        };
    }
    toDocRecord(source) {
        const fields = this.fields;
        const rawContent = source[fields.content] ?? source.content;
        const contentValues = Array.isArray(rawContent)
            ? rawContent.filter((item) => typeof item === 'string')
            : typeof rawContent === 'string'
                ? [rawContent]
                : [];
        const paragraphs = contentValues.flatMap((value) => htmlToParagraphs(value));
        const storedSummary = readString(source, fields.summary);
        const summary = storedSummary || paragraphs[0]?.slice(0, 180) || stripHtml(contentValues.join(' ')).slice(0, 180);
        const tags = readTags(source, fields.tags);
        const rawCategory = readString(source, fields.category);
        const category = rawCategory.split(/[|,，;；]/)[0]?.trim() || tags[0] || '未分类';
        return {
            id: readString(source, 'id'),
            title: readString(source, fields.title) ||
                (summary.length > 40 ? `${summary.slice(0, 40)}…` : summary) ||
                '未命名内容',
            url: readString(source, fields.url),
            source: readString(source, fields.source) || this.profile.sourceFallback,
            category,
            department: readString(source, fields.department),
            author: readString(source, fields.author) || '匿名',
            updatedAt: readString(source, fields.updatedAt),
            parentId: readString(source, fields.parentId),
            rootId: readString(source, 'rootId'),
            depth: readNumber(source, 'depth'),
            directReplyCount: readNumber(source, 'directReplyCount'),
            tags,
            summary,
            content: paragraphs,
            attachments: [],
            popularity: readNumber(source, fields.popularity),
        };
    }
}
//# sourceMappingURL=SolrResultMapper.js.map