import { readFileSync } from 'node:fs';
import { HOT_QUERIES, SYNONYM_GROUPS, buildSnippet, cleanQuery, daysSince, dedupe, escapeRegExp, expandSynonyms, highlightHtml, levenshtein, lookupTypoFix, normalizeTerm, normalizeText, segmentQuery, tokenize, toMatchRate, } from '../../../domain/content/text.js';
const FIELD_BOOST = { title: 4.2, tags: 2.8, summary: 1.7, content: 1 };
const FIELDS = ['title', 'tags', 'summary', 'content'];
const FIELD_LABEL = {
    title: '标题',
    tags: '标签',
    summary: '摘要',
    content: '正文',
};
const FACET_SPECS = [
    { field: 'category', label: '业务分类' },
    { field: 'source', label: '内容来源' },
    { field: 'department', label: '归属部门' },
];
/** 过于泛化的同义词只保留在查询理解里，不参与召回打分，避免噪声 */
const GENERIC_EXPANSIONS = new Set([
    '信息',
    '资料',
    '服务',
    '方案',
    '人员',
    '学习',
    '课程',
    '规定',
    '步骤',
    '手续',
    '链路',
    '业务',
]);
function documentText(doc, field) {
    if (field === 'tags')
        return doc.tags.join(' ');
    if (field === 'content')
        return doc.content.join('\n');
    return doc[field];
}
function countValues(values) {
    const counts = new Map();
    for (const value of values)
        counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
function asString(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
}
/** 校验并补全外部 JSON 数据，避免脏数据进入索引 */
export function loadDocuments(filePath) {
    let raw;
    try {
        raw = readFileSync(filePath, 'utf8');
    }
    catch {
        throw new Error(`无法读取文档数据文件：${filePath}`);
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new Error(`文档数据不是合法 JSON：${filePath}`);
    }
    if (!Array.isArray(parsed)) {
        throw new Error(`文档数据必须是数组：${filePath}`);
    }
    return parsed.map((item, index) => {
        if (typeof item !== 'object' || item === null) {
            throw new Error(`第 ${index + 1} 条文档格式错误`);
        }
        const record = item;
        const id = asString(record.id);
        const title = asString(record.title);
        if (!id || !title)
            throw new Error(`第 ${index + 1} 条文档缺少 id 或 title`);
        const tags = Array.isArray(record.tags) ? record.tags.filter((tag) => typeof tag === 'string') : [];
        const content = Array.isArray(record.content)
            ? record.content.filter((paragraph) => typeof paragraph === 'string')
            : [];
        const attachments = Array.isArray(record.attachments)
            ? record.attachments
                .filter((entry) => typeof entry === 'object' && entry !== null)
                .map((entry) => ({
                name: asString(entry.name, '附件'),
                size: asString(entry.size, '-'),
                type: asString(entry.type, '文件'),
            }))
            : [];
        return {
            id,
            title,
            url: asString(record.url, '#'),
            source: asString(record.source, '企业知识库'),
            category: asString(record.category, '未分类'),
            department: asString(record.department, '未知部门'),
            author: asString(record.author, '匿名'),
            updatedAt: asString(record.updatedAt, new Date().toISOString()),
            parentId: asString(record.parentId),
            tags,
            summary: asString(record.summary),
            content,
            attachments,
            popularity: typeof record.popularity === 'number' && Number.isFinite(record.popularity) ? record.popularity : 0,
        };
    });
}
/**
 * 内置演示检索引擎：bigram 召回 + 字段加权 + 同义词扩展 + 错拼纠正 + 高亮摘要。
 * 它既是无 Solr 环境下的默认可运行实现，也是 Solr 故障时的降级方案。
 */
export class MockSearchAdapter {
    kind = 'mock';
    demo = true;
    docs;
    documentFrequency = new Map();
    vocabulary = new Map();
    vocabKeys = new Set();
    constructor(documents) {
        if (documents.length === 0)
            throw new Error('文档数据为空，至少需要一条记录');
        this.docs = documents.map((doc) => this.indexDocument(doc));
        this.buildStatistics();
    }
    static fromFile(filePath) {
        return new MockSearchAdapter(loadDocuments(filePath));
    }
    indexDocument(doc) {
        const termFreq = {};
        const allTerms = new Set();
        for (const field of FIELDS) {
            const freqs = new Map();
            for (const token of tokenize(documentText(doc, field))) {
                freqs.set(token, (freqs.get(token) ?? 0) + 1);
                allTerms.add(token);
            }
            termFreq[field] = freqs;
        }
        return {
            doc,
            termFreq,
            allTerms,
            norm: {
                title: normalizeText(doc.title),
                tags: normalizeText(doc.tags.join(' ')),
                summary: normalizeText(doc.summary),
                content: normalizeText(doc.content.join(' ')),
                full: normalizeText([doc.title, doc.summary, doc.tags.join(' '), doc.content.join(' ')].join(' ')),
            },
        };
    }
    buildStatistics() {
        for (const indexed of this.docs) {
            for (const term of indexed.allTerms) {
                this.documentFrequency.set(term, (this.documentFrequency.get(term) ?? 0) + 1);
            }
            for (const tag of indexed.doc.tags)
                this.addVocabulary(tag, 2);
        }
        // 同义词成员也进入词表，供查询切分与纠错使用
        for (const group of SYNONYM_GROUPS) {
            for (const term of group)
                this.addVocabulary(term, 1);
        }
        this.vocabKeys = new Set(this.vocabulary.keys());
    }
    addVocabulary(term, weight) {
        const key = normalizeTerm(term);
        if (!key)
            return;
        const existing = this.vocabulary.get(key);
        if (existing)
            existing.count += weight;
        else
            this.vocabulary.set(key, { display: term, count: weight });
    }
    displayTerm(term) {
        return this.vocabulary.get(normalizeTerm(term))?.display ?? term;
    }
    prepare(raw) {
        const original = cleanQuery(raw);
        const units = segmentQuery(original, this.vocabKeys);
        const source = units.length > 0 ? units.join(' ') : original;
        const tokens = dedupe([...tokenize(source), ...units.filter((unit) => unit.length === 1)]);
        return { original, units, tokens };
    }
    async search(query) {
        const started = performance.now();
        const requestedPage = Number.isFinite(query.page) ? Math.floor(query.page) : 1;
        const requestedSize = Number.isFinite(query.pageSize) ? Math.floor(query.pageSize) : 10;
        const page = Math.max(1, requestedPage);
        const pageSize = Math.min(50, Math.max(1, requestedSize));
        const prepared = this.prepare(query.q);
        if (prepared.tokens.length === 0) {
            return this.emptyResponse(prepared, page, pageSize, started, '请输入业务关键词，例如“差旅报销”。');
        }
        const corrections = this.detectCorrections(prepared.units);
        const correctedQuery = this.applyCorrections(prepared.original, corrections);
        const effective = corrections.size > 0 ? this.prepare(correctedQuery) : prepared;
        const expansions = new Map();
        for (const unit of effective.units) {
            const candidates = expandSynonyms(unit);
            if (candidates.length > 0)
                expansions.set(unit, candidates);
        }
        const fuzzy = new Map();
        for (const token of effective.tokens) {
            if (token.length < 3)
                continue;
            if ((this.documentFrequency.get(token) ?? 0) > 0)
                continue;
            const nearest = this.nearestVocabulary(token, 1);
            if (nearest && nearest.distance <= 1 && !corrections.has(token)) {
                fuzzy.set(token, nearest.display);
            }
        }
        const phrase = effective.units.join('');
        const scored = this.scoreAll(effective, phrase, expansions, fuzzy);
        // 与 Solr 一致的两段式：完整短语有命中就直接返回，否则才使用分词结果
        const exactIds = phrase.length >= 2
            ? new Set(this.docs
                .filter((entry) => entry.norm.full.includes(phrase))
                .map((entry) => entry.doc.id))
            : new Set();
        const exactScored = exactIds.size > 0 ? scored.filter((entry) => exactIds.has(entry.indexed.doc.id)) : [];
        const matchMode = exactScored.length > 0 ? 'phrase' : 'tokenized';
        const matched = exactScored.length > 0 ? exactScored : scored;
        const facets = this.buildFacets(matched);
        const filtered = matched.filter(({ indexed }) => this.matchesFilters(indexed.doc, query));
        const sorted = this.sortScored(filtered, query.sort);
        const total = sorted.length;
        const maxScore = sorted.reduce((max, entry) => Math.max(max, entry.score), 0);
        const highlightTerms = dedupe([
            ...effective.units,
            ...effective.units.flatMap((unit) => expansions.get(unit) ?? []),
            ...fuzzy.values(),
        ]);
        const authorCounts = new Map();
        for (const { indexed } of matched) {
            if (!this.matchesFilters(indexed.doc, { ...query, userName: undefined }))
                continue;
            authorCounts.set(indexed.doc.author, (authorCounts.get(indexed.doc.author) ?? 0) + 1);
        }
        const authors = [...authorCounts.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
            .slice(0, 100)
            .map(([value, count]) => ({ value, count }));
        const start = (page - 1) * pageSize;
        const results = sorted.slice(start, start + pageSize).map((entry) => this.toHit(entry, maxScore, highlightTerms));
        const synonyms = [...expansions.entries()].map(([term, list]) => ({
            term: this.displayTerm(term),
            expansions: list,
        }));
        const fuzzyHits = [...fuzzy.entries()].map(([term, matched]) => ({ term, matched }));
        const insight = {
            terms: effective.units.map((unit) => this.displayTerm(unit)),
            synonyms,
            fuzzy: [
                ...[...corrections.entries()].map(([term, matched]) => ({ term, matched })),
                ...fuzzyHits,
            ],
            correctedQuery: corrections.size > 0 ? correctedQuery : undefined,
            originalQuery: corrections.size > 0 ? prepared.original : undefined,
            notes: this.buildNotes(corrections, synonyms, fuzzyHits, total, matchMode),
        };
        return {
            query: correctedQuery,
            page,
            pageSize,
            total,
            tookMs: Math.max(0.1, Math.round((performance.now() - started) * 100) / 100),
            backend: 'mock',
            matchMode,
            insight,
            results,
            facets,
            authors,
            relatedQueries: this.relatedQueries(sorted, effective.units, highlightTerms),
            maxScore: Math.round(maxScore * 100) / 100,
        };
    }
    emptyResponse(prepared, page, pageSize, started, note) {
        return {
            query: prepared.original,
            page,
            pageSize,
            total: 0,
            tookMs: Math.max(0.1, Math.round((performance.now() - started) * 100) / 100),
            backend: 'mock',
            matchMode: 'tokenized',
            insight: {
                terms: prepared.units,
                synonyms: [],
                fuzzy: [],
                notes: [note],
            },
            results: [],
            facets: [],
            authors: [],
            relatedQueries: [...HOT_QUERIES].slice(0, 5),
            maxScore: 0,
        };
    }
    scoreAll(prepared, phrase, expansions, fuzzy) {
        const docsCount = this.docs.length;
        const idfCache = new Map();
        const idf = (token) => {
            const cached = idfCache.get(token);
            if (cached !== undefined)
                return cached;
            const df = this.documentFrequency.get(token) ?? 0;
            const value = Math.log(1 + docsCount / (1 + df));
            idfCache.set(token, value);
            return value;
        };
        const expansionPhrases = dedupe([...expansions.values()]
            .flat()
            .map((term) => normalizeText(term))
            .filter((term) => term.length >= 2 && !GENERIC_EXPANSIONS.has(term)));
        const fuzzyTokens = dedupe([...fuzzy.values()].flatMap((term) => tokenize(term))).filter((token) => token.length >= 2);
        const scored = [];
        for (const indexed of this.docs) {
            let score = 0;
            const matchedFields = new Set();
            const matchedTokens = new Set();
            for (const token of prepared.tokens) {
                let tokenScore = 0;
                for (const field of FIELDS) {
                    const tf = indexed.termFreq[field].get(token) ?? 0;
                    if (tf > 0) {
                        tokenScore += idf(token) * (1 + Math.log(tf)) * FIELD_BOOST[field];
                        matchedFields.add(field);
                    }
                }
                if (tokenScore > 0) {
                    score += tokenScore;
                    matchedTokens.add(token);
                }
            }
            let semanticHits = 0;
            for (const phrase of expansionPhrases) {
                let hit = false;
                const boosts = [
                    ['title', 3.4],
                    ['tags', 3],
                    ['summary', 2],
                    ['content', 1.2],
                ];
                for (const [field, boost] of boosts) {
                    if (indexed.norm[field].includes(phrase)) {
                        score += boost;
                        matchedFields.add(field);
                        hit = true;
                    }
                }
                if (hit)
                    semanticHits += 1;
            }
            for (const token of fuzzyTokens) {
                let hit = false;
                for (const field of FIELDS) {
                    const tf = indexed.termFreq[field].get(token) ?? 0;
                    if (tf > 0) {
                        score += idf(token) * (1 + Math.log(tf)) * FIELD_BOOST[field] * 0.55;
                        matchedFields.add(field);
                        hit = true;
                    }
                }
                if (hit)
                    semanticHits += 1;
            }
            if (matchedTokens.size === 0 && semanticHits === 0)
                continue;
            const coverage = prepared.tokens.length > 0 ? matchedTokens.size / prepared.tokens.length : 0;
            score += coverage * coverage * 11;
            if (phrase.length >= 2) {
                if (indexed.norm.title === phrase)
                    score += 30;
                else if (indexed.norm.title.includes(phrase))
                    score += 15;
                if (indexed.norm.title.startsWith(phrase))
                    score += 8;
                if (indexed.norm.summary.includes(phrase))
                    score += 7;
                if (indexed.norm.full.includes(phrase))
                    score += 4;
            }
            score += Math.max(0, 1 - daysSince(indexed.doc.updatedAt) / 540) * 2.2;
            score += Math.log1p(indexed.doc.popularity) / 9;
            scored.push({ indexed, score, matchedFields });
        }
        return scored.sort((a, b) => b.score - a.score);
    }
    detectCorrections(units) {
        const corrections = new Map();
        for (const unit of units) {
            if (unit.length < 2)
                continue;
            const fixed = this.correctUnit(unit);
            if (fixed && fixed !== unit && !corrections.has(unit))
                corrections.set(unit, fixed);
        }
        return corrections;
    }
    correctUnit(unit) {
        const term = normalizeTerm(unit);
        if (this.vocabulary.has(term))
            return undefined;
        const typo = lookupTypoFix(term);
        if (typo)
            return typo;
        if (/^[a-z0-9]/.test(term)) {
            if (term.length < 4)
                return undefined;
            return this.nearestVocabulary(term, 1)?.display;
        }
        if (term.length < 3 || this.termExists(term))
            return undefined;
        const nearest = this.nearestVocabulary(term, 1);
        if (!nearest)
            return undefined;
        // 三字词的编辑距离 1 仍可能歧义，要求词表里至少出现过两次
        if (term.length === 3 && nearest.distance === 1 && nearest.count < 2)
            return undefined;
        return nearest.display;
    }
    termExists(term) {
        if (this.vocabulary.has(term))
            return true;
        return tokenize(term).some((token) => (this.documentFrequency.get(token) ?? 0) > 0);
    }
    nearestVocabulary(term, maxDistance) {
        let best = null;
        for (const [key, entry] of this.vocabulary) {
            if (Math.abs(key.length - term.length) > maxDistance)
                continue;
            const distance = levenshtein(term, key, maxDistance);
            if (distance > maxDistance)
                continue;
            if (!best ||
                distance < best.distance ||
                (distance === best.distance && entry.count > best.count)) {
                best = { display: entry.display, distance, count: entry.count };
            }
        }
        return best;
    }
    applyCorrections(original, corrections) {
        let result = original;
        for (const [from, to] of corrections) {
            try {
                result = result.replace(new RegExp(escapeRegExp(from), 'i'), to);
            }
            catch {
                // 忽略无法构造正则的极端输入
            }
        }
        return result;
    }
    matchesFilters(doc, query) {
        if (query.userName && doc.author !== query.userName)
            return false;
        if (query.category && doc.category !== query.category)
            return false;
        if (query.source && doc.source !== query.source)
            return false;
        if (query.department && doc.department !== query.department)
            return false;
        return true;
    }
    sortScored(entries, sort) {
        const list = [...entries];
        if (sort === 'parentId') {
            list.sort((a, b) => {
                const left = a.indexed.doc.parentId ?? '';
                const right = b.indexed.doc.parentId ?? '';
                return (left.localeCompare(right, 'en', { numeric: true }) ||
                    a.indexed.doc.id.localeCompare(b.indexed.doc.id, 'en', { numeric: true }));
            });
        }
        else if (sort === 'userName') {
            list.sort((a, b) => a.indexed.doc.author.localeCompare(b.indexed.doc.author, 'zh-CN') ||
                b.score - a.score);
        }
        else if (sort === 'date') {
            list.sort((a, b) => Date.parse(b.indexed.doc.updatedAt) - Date.parse(a.indexed.doc.updatedAt) ||
                b.score - a.score);
        }
        else {
            list.sort((a, b) => b.score - a.score || b.indexed.doc.popularity - a.indexed.doc.popularity);
        }
        return list;
    }
    buildFacets(entries) {
        return FACET_SPECS.map(({ field, label }) => {
            const values = entries.map((entry) => entry.indexed.doc[field]);
            const buckets = countValues(values)
                .slice(0, 12)
                .map((bucket) => ({ value: bucket.name, count: bucket.count }));
            return { field, label, buckets };
        }).filter((group) => group.buckets.length > 1);
    }
    toHit(entry, maxScore, terms) {
        const doc = entry.indexed.doc;
        const matchedFields = [...entry.matchedFields]
            .sort((a, b) => FIELD_BOOST[b] - FIELD_BOOST[a])
            .map((field) => FIELD_LABEL[field]);
        return {
            id: doc.id,
            title: doc.title,
            titleHtml: highlightHtml(doc.title, terms),
            url: doc.url,
            source: doc.source,
            category: doc.category,
            department: doc.department,
            author: doc.author,
            updatedAt: doc.updatedAt,
            tags: doc.tags,
            snippetHtml: buildSnippet([doc.summary, ...doc.content], terms, doc.summary),
            score: Math.round(entry.score * 100) / 100,
            matchRate: toMatchRate(entry.score, maxScore),
            matchedFields,
        };
    }
    buildNotes(corrections, synonyms, fuzzyHits, total, matchMode) {
        const notes = [
            matchMode === 'phrase'
                ? '完整短语命中，直接返回'
                : '完整短语未命中，已自动回退到分词检索',
        ];
        for (const [from, to] of corrections) {
            notes.push(`已将「${from}」自动纠正为「${to}」`);
        }
        if (synonyms.length > 0) {
            const sample = synonyms
                .slice(0, 2)
                .map((item) => `${item.term} → ${item.expansions.slice(0, 2).join('、')}`)
                .join('；');
            notes.push(`同义词扩展：${sample}`);
        }
        if (fuzzyHits.length > 0) {
            notes.push(`容错匹配：${fuzzyHits.map((hit) => `${hit.term} → ${hit.matched}`).join('、')}`);
        }
        if (total === 0)
            notes.push('未找到直接匹配，已尝试同义词与错拼纠正，可换个说法再试。');
        return notes;
    }
    relatedQueries(sorted, units, highlightTerms) {
        const tagCounts = new Map();
        for (const entry of sorted.slice(0, 6)) {
            for (const tag of entry.indexed.doc.tags) {
                if (highlightTerms.some((term) => term === tag))
                    continue;
                tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
            }
        }
        const related = [...tagCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([tag]) => tag)
            .slice(0, 3);
        for (const hot of HOT_QUERIES) {
            if (units.some((unit) => hot.toLowerCase().includes(unit)))
                related.push(hot);
        }
        if (related.length < 4) {
            for (const hot of HOT_QUERIES) {
                if (related.length >= 5)
                    break;
                related.push(hot);
            }
        }
        return dedupe(related).slice(0, 6);
    }
    async suggest(prefix, limit) {
        const query = cleanQuery(prefix);
        const max = Math.max(1, Math.min(12, Math.floor(limit) || 8));
        if (!query) {
            return HOT_QUERIES.slice(0, max).map((text) => ({ text, type: 'hot', hint: '热门搜索' }));
        }
        const normalized = normalizeText(query);
        const units = this.prepare(query).units;
        const ranked = [];
        const seen = new Set();
        const push = (item, rank) => {
            if (seen.has(item.text) || item.text === query)
                return;
            seen.add(item.text);
            ranked.push({ item, rank });
        };
        for (const indexed of this.docs) {
            const title = indexed.norm.title;
            const index = title.indexOf(normalized);
            const titleHit = index >= 0 || units.some((unit) => title.includes(normalizeText(unit)));
            if (titleHit) {
                push({
                    text: indexed.doc.title,
                    type: 'doc',
                    hint: `${indexed.doc.category} · ${indexed.doc.source}`,
                    id: indexed.doc.id,
                }, index === 0 ? 100 : 78);
                continue;
            }
            const contentHit = units.some((unit) => indexed.norm.content.includes(normalizeText(unit)));
            if (contentHit) {
                const paragraph = indexed.doc.content.find((item) => units.some((unit) => normalizeText(item).includes(normalizeText(unit)))) ??
                    indexed.doc.content[0] ??
                    '';
                const excerpt = paragraph.length > 110 ? `${paragraph.slice(0, 110).trim()}…` : paragraph.trim();
                push({
                    text: indexed.doc.title,
                    type: 'doc',
                    hint: '正文命中',
                    id: indexed.doc.id,
                    excerpt,
                }, 62);
            }
        }
        for (const [key, entry] of this.vocabulary) {
            if (!key.includes(normalized) || key === normalized)
                continue;
            push({ text: entry.display, type: 'keyword', hint: '关键词' }, 58);
        }
        for (const hot of HOT_QUERIES) {
            if (hot.toLowerCase().includes(normalized)) {
                push({ text: hot, type: 'hot', hint: '热门搜索' }, 44);
            }
        }
        const prepared = this.prepare(query);
        const corrections = this.detectCorrections(prepared.units);
        if (corrections.size > 0) {
            const corrected = this.applyCorrections(query, corrections);
            if (corrected !== query) {
                push({ text: corrected, type: 'correction', hint: '已纠正拼写' }, 90);
            }
        }
        return ranked
            .sort((a, b) => b.rank - a.rank || a.item.text.length - b.item.text.length)
            .slice(0, max)
            .map(({ item }) => item);
    }
    async getDocument(id, q) {
        const indexed = this.docs.find((entry) => entry.doc.id === id);
        if (!indexed)
            return null;
        const prepared = this.prepare(q);
        const terms = prepared.units;
        const highlightTerms = dedupe([...terms, ...terms.flatMap((term) => expandSynonyms(term))]);
        const related = this.relatedDocuments(indexed, highlightTerms);
        return {
            doc: indexed.doc,
            titleHtml: highlightHtml(indexed.doc.title, highlightTerms),
            summaryHtml: highlightHtml(indexed.doc.summary, highlightTerms),
            contentHtml: indexed.doc.content.map((paragraph) => highlightHtml(paragraph, highlightTerms)),
            tagsHtml: indexed.doc.tags.map((tag) => highlightHtml(tag, highlightTerms)),
            related,
            insight: {
                terms: terms.map((term) => this.displayTerm(term)),
                synonyms: terms
                    .map((term) => ({ term, expansions: expandSynonyms(term) }))
                    .filter((entry) => entry.expansions.length > 0),
                fuzzy: [],
                notes: terms.length > 0 ? ['详情页已按当前检索词高亮相关段落'] : [],
            },
            backend: 'mock',
        };
    }
    relatedDocuments(source, terms) {
        const candidates = this.docs
            .filter((entry) => entry.doc.id !== source.doc.id)
            .map((entry) => {
            let overlap = 0;
            for (const tag of source.doc.tags) {
                if (entry.doc.tags.includes(tag))
                    overlap += 2;
            }
            if (entry.doc.category === source.doc.category)
                overlap += 1.5;
            if (entry.doc.department === source.doc.department)
                overlap += 0.6;
            return {
                entry,
                score: overlap + Math.log1p(entry.doc.popularity) / 600,
            };
        })
            .filter((candidate) => candidate.score >= 1.5)
            .sort((a, b) => b.score - a.score)
            .slice(0, 4);
        const maxScore = candidates[0]?.score ?? 0;
        return candidates.map(({ entry, score }) => ({
            id: entry.doc.id,
            title: entry.doc.title,
            titleHtml: highlightHtml(entry.doc.title, terms),
            url: entry.doc.url,
            source: entry.doc.source,
            category: entry.doc.category,
            department: entry.doc.department,
            author: entry.doc.author,
            updatedAt: entry.doc.updatedAt,
            tags: entry.doc.tags,
            snippetHtml: buildSnippet([entry.doc.summary], terms, entry.doc.summary, 96),
            score: Math.round(score * 100) / 100,
            matchRate: toMatchRate(score, maxScore),
            matchedFields: ['标签', '分类'],
        }));
    }
    async stats() {
        const categories = countValues(this.docs.map((entry) => entry.doc.category));
        const sources = countValues(this.docs.map((entry) => entry.doc.source));
        const updatedAt = this.docs.reduce((latest, entry) => (entry.doc.updatedAt > latest ? entry.doc.updatedAt : latest), '');
        return {
            docCount: this.docs.length,
            categories,
            sources,
            hotQueries: [...HOT_QUERIES],
            updatedAt,
            backend: 'mock',
            demo: true,
        };
    }
    async close() {
        // 内存索引无需释放资源
    }
}
//# sourceMappingURL=MockSearchAdapter.js.map