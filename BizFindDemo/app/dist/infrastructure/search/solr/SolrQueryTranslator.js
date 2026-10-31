import { cleanQuery, dedupe } from '../../../domain/content/text.js';
import { escapeSolrQuery, quoteSolrValue } from './SolrClient.js';
/**
 * 把领域检索请求翻译为 Solr 参数。
 *
 * 所有 qf/pf/bq/fq/facet/highlight 细节都收口在这里，application/domain 不感知。
 * 未来 Elasticsearch 适配器只需要对应的 EsQueryTranslator。
 */
export class SolrQueryTranslator {
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
    buildFl(includeScore = true, includeContent = false) {
        const fields = this.fields;
        const names = [
            'id',
            fields.title,
            fields.author,
            fields.updatedAt,
            fields.parentId,
            fields.category,
            fields.tags,
            fields.source,
            fields.department,
            fields.summary,
            fields.url,
            fields.popularity,
            includeContent ? fields.content : '',
        ];
        if (this.profile.name === 'wxmang') {
            names.push('rootId', 'depth', 'isRoot', 'directReplyCount');
        }
        if (includeScore)
            names.push('score');
        return dedupe(names.filter(Boolean)).join(',');
    }
    buildSearchParams(query, mode) {
        const profile = this.profile;
        const fields = this.fields;
        const text = cleanQuery(query.q);
        const params = {
            // phrase：完整短语（等价于“不分词”匹配），tokenized：IK 分词后的常规检索
            q: query.allDocs ? '*:*' : mode === 'phrase' ? quoteSolrValue(text) : escapeSolrQuery(text),
            defType: 'edismax',
            qf: profile.queryFields,
            pf: profile.phraseFields,
            mm: mode === 'tokenized' ? '1' : '100%',
            rows: query.pageSize,
            start: Math.max(0, (query.page - 1) * query.pageSize),
            fl: this.buildFl(true, true),
            hl: 'on',
            'hl.method': 'unified',
            'hl.fl': profile.highlightFields,
            'hl.simple.pre': '<mark>',
            'hl.simple.post': '</mark>',
            'hl.fragsize': 170,
            'hl.snippets': 1,
            'hl.requireFieldMatch': 'true',
            spellcheck: 'true',
            'spellcheck.collate': 'true',
            'spellcheck.count': 1,
        };
        if (profile.facets.length > 0 || fields.author) {
            const facetFields = dedupe(profile.facets.map((facet) => facet.solrField));
            if (fields.author)
                facetFields.push(`{!ex=userNameFilter}${fields.author}`);
            params.facet = 'on';
            params['facet.field'] = facetFields;
            params['facet.mincount'] = 1;
            params['facet.limit'] = 100;
            params['facet.sort'] = 'count';
        }
        // 标题完整命中的文档优先；这是“想到什么查什么”时最强的意图信号
        if (fields.title && text) {
            params.bq = `${fields.title}:(${quoteSolrValue(text)})^80`;
        }
        if (query.sort === 'parentId' && fields.parentId) {
            params.sort = `${fields.parentId} asc, id asc`;
        }
        else if (query.sort === 'userName' && fields.author) {
            params.sort = `${fields.author} asc, id asc`;
        }
        else if (query.sort === 'date' && fields.updatedAt) {
            params.sort = `${fields.updatedAt} desc`;
        }
        else {
            params.sort =
                this.profile.name === 'wxmang'
                    ? `isRoot desc, score desc, ${fields.updatedAt ?? 'id'} desc`
                    : fields.updatedAt
                        ? `score desc, ${fields.updatedAt} desc`
                        : 'score desc';
        }
        const filters = [];
        if (query.userName && fields.author) {
            filters.push(`{!tag=userNameFilter}${fields.author}:${quoteSolrValue(query.userName)}`);
        }
        for (const field of ['category', 'source', 'department']) {
            const value = query[field];
            if (!value)
                continue;
            const spec = profile.facets.find((facet) => facet.field === field);
            if (spec)
                filters.push(`${spec.solrField}:${quoteSolrValue(value)}`);
        }
        if (profile.name === 'wxmang' && query.rootOnly) {
            filters.push('isRoot:1');
        }
        if (profile.name === 'wxmang' && query.ids) {
            const ids = query.ids.filter(Boolean).slice(0, 1500);
            if (ids.length > 0) {
                filters.push(`id:(${ids.map((id) => quoteSolrValue(id)).join(' OR ')})`);
            }
        }
        if (filters.length > 0)
            params.fq = filters;
        return params;
    }
}
//# sourceMappingURL=SolrQueryTranslator.js.map