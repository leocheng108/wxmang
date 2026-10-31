/**
 * 文本处理工具：归一化、中文 bigram 分词、按词表切词、同义词扩展、拼写纠错、高亮与摘要。
 * 这些能力同时服务于内置演示索引和 Solr 适配层的查询理解。
 */
/** 业务同义词组，组内成员互为正扩展 */
export const SYNONYM_GROUPS = [
    ['合同', '协议', '合约'],
    ['报销', '报账', '费用报销'],
    ['发票', '票据', '增值税发票'],
    ['客户', '用户', '甲方', '客户方'],
    ['供应商', '厂商', '乙方', '供方'],
    ['采购', '采买', '购买'],
    ['员工', '职工', '人员', '同事'],
    ['考勤', '打卡', '出勤'],
    ['差旅', '出差', '商旅'],
    ['预算', '费用预算', '资金计划'],
    ['离职', '辞职', '解除劳动合同'],
    ['入职', '报到', '新员工', '上岗'],
    ['绩效', '考核', 'KPI', '业绩'],
    ['培训', '学习', '课程', '赋能'],
    ['数据', '信息', '资料'],
    ['安全', '合规', '风控', '保密'],
    ['审批', '审核', '签批', '会签'],
    ['权限', '授权', '访问控制', '账号权限'],
    ['产品', '商品', '服务', '方案'],
    ['项目', '工程', '专项'],
    ['市场', '营销', '推广', '品牌'],
    ['销售', '业务', '签单', '商务'],
    ['财务', '会计', '财税', '资金'],
    ['法务', '法律', '合规', '风控'],
    ['流程', '手续', '步骤', '链路'],
    ['制度', '规范', '管理办法', '规定'],
    ['发布', '上线', '发版', '部署'],
    ['回滚', '撤销', '恢复'],
    ['知识库', '文档库', '资料库', '语料库'],
    ['远程办公', '居家办公', '远程'],
    ['投诉', '抱怨', '客诉', '不满'],
    ['续约', '续签', '续费', '增购'],
    ['招标', '招投标', '竞标'],
    ['用印', '盖章', '印章'],
    ['模板', '范本', '样例'],
    ['加班', '延时工作', '调休'],
    ['客户成功', '客户运营', '客户维护'],
    ['数据泄露', '数据外泄', '信息泄露'],
];
export function normalizeTerm(term) {
    return term.normalize('NFKC').toLowerCase();
}
export const SYNONYMS = (() => {
    const map = new Map();
    for (const group of SYNONYM_GROUPS) {
        for (const term of group) {
            const key = normalizeTerm(term);
            const bucket = map.get(key) ?? new Set();
            for (const other of group) {
                if (other !== term)
                    bucket.add(other);
            }
            map.set(key, bucket);
        }
    }
    return new Map([...map].map(([term, set]) => [term, [...set]]));
})();
/** 常见错别字 → 正确写法。中文短词编辑距离歧义大，因此两字词只走这份人工词表。 */
const TYPO_FIXES = {
    合通: '合同',
    合动: '合同',
    合筒: '合同',
    报消: '报销',
    报销消: '报销',
    发飘: '发票',
    发标: '发票',
    差吕: '差旅',
    差滤: '差旅',
    供用商: '供应商',
    供因商: '供应商',
    审比: '审批',
    审此: '审批',
    入值: '入职',
    预蒜: '预算',
    客护: '客户',
    绩校: '绩效',
    考琴: '考勤',
    用因: '用印',
    招表: '招标',
    续约约: '续约',
    数据安权: '数据安全',
    知织库: '知识库',
};
export const HOT_QUERIES = [
    '差旅报销标准',
    '合同审批流程',
    '供应商准入',
    '数据安全分级',
    '新员工入职清单',
    '绩效 KPI 设定',
    '发票红冲怎么处理',
    '智能客服白皮书',
];
/** 只用于切分查询、不参与匹配的停用词 */
const LEADING_STOPWORDS = [
    '请问',
    '帮我',
    '我想',
    '想要',
    '麻烦',
    '查一下',
    '找一下',
    '搜索',
    '查找',
    '如何',
    '怎么',
    '怎样',
    '关于',
    '对于',
    '有没有',
    '求',
];
const INLINE_STOPWORDS = ['怎么样', '怎么', '如何', '什么', '哪些', '一下', '相关', '有关'];
const CJK_RUN = /[\p{Script=Han}]+/gu;
const LATIN_TOKEN = /[a-z0-9]+(?:[._-][a-z0-9]+)*/gi;
export function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
const NAMED_ENTITIES = {
    nbsp: ' ',
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    '#39': "'",
    ldquo: '“',
    rdquo: '”',
    lsquo: '‘',
    rsquo: '’',
    hellip: '…',
    mdash: '—',
    ndash: '–',
};
/** 解码常见 HTML 实体；非法码点原样保留 */
export function decodeHtmlEntities(input) {
    return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
        const key = entity.toLowerCase();
        if (key.startsWith('#x')) {
            const code = Number.parseInt(key.slice(2), 16);
            return Number.isFinite(code) && code > 0 && code <= 0x10ffff
                ? String.fromCodePoint(code)
                : match;
        }
        if (key.startsWith('#')) {
            const code = Number.parseInt(key.slice(1), 10);
            return Number.isFinite(code) && code > 0 && code <= 0x10ffff
                ? String.fromCodePoint(code)
                : match;
        }
        return NAMED_ENTITIES[key] ?? match;
    });
}
/** 过滤“提到”引用行和 BBCode quote 标签；保留引用正文。 */
export function stripMentionLine(input) {
    return input
        .replace(/<cite\b[^>]*>[\s\S]*?<\/cite>/gi, (block) => /提到\s*[:：]/.test(block) ? '' : block)
        .replace(/^[^\n]*提到\s*[:：][^\n]*(?:\n|$)/gim, '')
        // 论坛 BBCode 引用头：[quote='wxmang' pid='...' dateline='...']
        // 也包括被截断、没有闭合 ] 的引用头，以及闭合标签 [/quote]。
        .replace(/\[\/?quote[^\]\n]*(?:\]|\n|$)/gi, '');
}
/** 去掉 HTML 标签并压缩空白，用于索引内容的纯文本展示 */
export function stripHtml(input) {
    const withoutTags = stripMentionLine(input)
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, ' ')
        .replace(/<[^>]*>/g, '');
    return decodeHtmlEntities(withoutTags).replace(/\s+/g, ' ').trim();
}
/** 将 HTML 正文拆成可读段落，保留自然段 */
export function htmlToParagraphs(input) {
    const text = stripMentionLine(input)
        .replace(/\r\n?/g, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, '\n\n')
        .replace(/<[^>]*>/g, '');
    return decodeHtmlEntities(text)
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
}
/**
 * 清洗 Solr 高亮片段：保留 <mark> 和自然段边界，其余标签去掉并转义。
 * 段落之间输出 <br><br>，让结果摘要仍能看出原文的段落关系。
 */
export function cleanHighlightHtml(fragment) {
    const withBreaks = stripMentionLine(fragment)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)\s*>/gi, '\n\n')
        .replace(/<(?!\/?mark\b)[^>]*>/gi, '');
    const paragraphs = decodeHtmlEntities(withBreaks)
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 3);
    return paragraphs
        .map((paragraph) => escapeHtml(paragraph)
        .replace(/&lt;mark&gt;/gi, '<mark>')
        .replace(/&lt;\/mark&gt;/gi, '</mark>'))
        .join('<br><br>');
}
export function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export function cleanQuery(input) {
    if (typeof input !== 'string')
        return '';
    return input
        .normalize('NFKC')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
}
export function normalizeText(input) {
    return input
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[\u3000\s]+/g, ' ')
        .replace(/[“”"'‘’`]/g, '')
        .replace(/[，。！？、；：,.!?;:()[\]{}【】《》<>/\\|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
/** 中文 bigram + 英文/数字词的分词，适合无词典的轻量召回 */
export function tokenize(input) {
    const text = normalizeText(input);
    const tokens = new Set();
    for (const match of text.matchAll(CJK_RUN)) {
        const run = match[0];
        if (run.length === 1) {
            tokens.add(run);
        }
        else {
            for (let i = 0; i < run.length - 1; i += 1)
                tokens.add(run.slice(i, i + 2));
        }
    }
    for (const match of text.matchAll(LATIN_TOKEN)) {
        if (match[0].length > 0)
            tokens.add(match[0]);
    }
    return [...tokens];
}
function stripLeadingStopwords(text) {
    let result = text;
    let changed = true;
    while (changed) {
        changed = false;
        for (const word of LEADING_STOPWORDS) {
            if (result.startsWith(word)) {
                result = result.slice(word.length).trim();
                changed = true;
            }
        }
    }
    return result;
}
function stripInlineStopwords(text) {
    let result = text;
    for (const word of INLINE_STOPWORDS)
        result = result.split(word).join(' ');
    return result;
}
/**
 * 按业务词表对中文查询做最大匹配切分，未知片段按 2 字兜底（便于纠错）。
 * 例：差旅报销 → [差旅, 报销]；合通审批 → [合通, 审批]
 */
export function segmentQuery(input, vocabulary) {
    const cleaned = stripInlineStopwords(stripLeadingStopwords(normalizeText(input)));
    const units = [];
    const segments = cleaned.split(' ').filter(Boolean);
    for (const segment of segments) {
        const cjkRuns = segment.match(CJK_RUN) ?? [];
        if (cjkRuns.length === 0) {
            for (const match of segment.matchAll(LATIN_TOKEN))
                units.push(match[0]);
            continue;
        }
        let cursor = 0;
        while (cursor < segment.length) {
            const rest = segment.slice(cursor);
            const runMatch = rest.match(/^[\p{Script=Han}]+/u);
            if (!runMatch) {
                const latin = rest.match(/^[a-z0-9][a-z0-9._-]*/);
                if (latin) {
                    units.push(latin[0]);
                    cursor += latin[0].length;
                }
                else {
                    cursor += 1;
                }
                continue;
            }
            const run = runMatch[0];
            let index = 0;
            while (index < run.length) {
                let matched = '';
                const maxLength = Math.min(6, run.length - index);
                for (let length = maxLength; length >= 2; length -= 1) {
                    const candidate = run.slice(index, index + length);
                    if (vocabulary.has(candidate)) {
                        matched = candidate;
                        break;
                    }
                }
                if (matched) {
                    units.push(matched);
                    index += matched.length;
                }
                else {
                    const fallbackLength = Math.min(2, run.length - index);
                    units.push(run.slice(index, index + fallbackLength));
                    index += fallbackLength;
                }
            }
            cursor += run.length;
        }
    }
    return dedupe(units.filter((unit) => unit.length > 0));
}
export function dedupe(items) {
    return [...new Set(items)];
}
/** Damerau-Levenshtein 距离，超过 max 时提前返回 max + 1 */
export function levenshtein(a, b, max = 2) {
    if (a === b)
        return 0;
    const left = Array.from(a);
    const right = Array.from(b);
    if (Math.abs(left.length - right.length) > max)
        return max + 1;
    let previous = new Array(right.length + 1);
    let current = new Array(right.length + 1);
    for (let j = 0; j <= right.length; j += 1)
        previous[j] = j;
    for (let i = 1; i <= left.length; i += 1) {
        current[0] = i;
        let rowMin = current[0];
        for (let j = 1; j <= right.length; j += 1) {
            const cost = left[i - 1] === right[j - 1] ? 0 : 1;
            const deletion = (previous[j] ?? 0) + 1;
            const insertion = (current[j - 1] ?? 0) + 1;
            const substitution = (previous[j - 1] ?? 0) + cost;
            current[j] = Math.min(deletion, insertion, substitution);
            rowMin = Math.min(rowMin, current[j] ?? 0);
        }
        if (rowMin > max)
            return max + 1;
        const swap = previous;
        previous = current;
        current = swap;
    }
    return previous[right.length] ?? max + 1;
}
export function lookupTypoFix(term) {
    return TYPO_FIXES[term];
}
export function expandSynonyms(term) {
    return [...(SYNONYMS.get(normalizeTerm(term)) ?? [])];
}
/**
 * 先切分再高亮：按词长倒序拼正则，避免短词覆盖长词。
 * 返回已转义 HTML，可直接插入 DOM。
 */
export function highlightHtml(text, terms) {
    const active = dedupe(terms.filter((term) => term.trim().length > 0)).sort((a, b) => b.length - a.length);
    if (active.length === 0)
        return escapeHtml(text);
    const pattern = new RegExp(`(${active.map(escapeRegExp).join('|')})`, 'giu');
    return text
        .split(pattern)
        .map((part, index) => index % 2 === 1 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part))
        .join('');
}
/** 从正文里挑一段最相关的段落，截窗后高亮 */
export function buildSnippet(paragraphs, terms, fallback, maxLength = 168) {
    const candidates = paragraphs.length > 0 ? paragraphs : [fallback];
    const lowered = terms.map((term) => term.toLowerCase());
    let best = { text: fallback, position: -1, score: -1 };
    for (const paragraph of candidates) {
        const haystack = paragraph.toLowerCase();
        let score = 0;
        let first = -1;
        for (const term of lowered) {
            const index = haystack.indexOf(term);
            if (index >= 0) {
                score += Math.min(term.length, 6);
                if (first < 0 || index < first)
                    first = index;
            }
        }
        // 摘要命中给一点额外权重，避免正文里偶然出现的词抢走摘要
        if (paragraph === fallback && score > 0)
            score += 1;
        if (score > best.score)
            best = { text: paragraph, position: first, score };
    }
    if (best.score <= 0) {
        best = { text: fallback || candidates[0] || '', position: -1, score: 0 };
    }
    let text = best.text.trim();
    if (text.length > maxLength) {
        const focus = best.position < 0 ? 0 : best.position;
        const start = Math.max(0, Math.min(focus - 46, text.length - maxLength));
        const prefix = start > 0 ? '…' : '';
        const suffix = start + maxLength < text.length ? '…' : '';
        text = `${prefix}${text.slice(start, start + maxLength)}${suffix}`;
    }
    return highlightHtml(text, terms);
}
/** 构造“匹配度”百分比，最高 99，避免出现绝对化的 100% */
export function toMatchRate(score, maxScore) {
    if (!Number.isFinite(score) || score <= 0 || maxScore <= 0)
        return 0;
    return Math.max(1, Math.min(99, Math.round((score / maxScore) * 100)));
}
/** 按自然段挑选 1–2 段作为检索结果摘要，并保留段落分隔 */
export function buildParagraphSnippet(paragraphs, terms, fallback = '', maxParagraphs = 2, maxChars = 520) {
    const candidates = paragraphs.map((item) => item.trim()).filter(Boolean);
    if (candidates.length === 0) {
        return fallback ? highlightHtml(fallback, terms) : '';
    }
    const lowered = terms.map((term) => term.toLowerCase());
    let bestIndex = 0;
    let bestScore = -1;
    candidates.forEach((paragraph, index) => {
        const haystack = paragraph.toLowerCase();
        let score = 0;
        for (const term of lowered) {
            if (term && haystack.includes(term))
                score += Math.min(term.length, 6);
        }
        if (score > bestScore) {
            bestScore = score;
            bestIndex = index;
        }
    });
    const chosen = [bestIndex];
    if (maxParagraphs > 1 && candidates.length > 1) {
        const next = bestIndex + 1 < candidates.length ? bestIndex + 1 : bestIndex - 1;
        if (next >= 0 && next !== bestIndex)
            chosen.push(next);
    }
    chosen.sort((a, b) => a - b);
    const budget = Math.max(160, Math.floor(maxChars / chosen.length));
    return chosen
        .map((index) => {
        const paragraph = candidates[index] ?? '';
        let text = paragraph;
        if (text.length > budget) {
            const focusTerm = lowered.find((term) => term && text.toLowerCase().includes(term));
            const focus = focusTerm ? text.toLowerCase().indexOf(focusTerm) : -1;
            const start = Math.max(0, Math.min(focus - 42, text.length - budget));
            text = `${start > 0 ? '…' : ''}${text.slice(start, start + budget)}${start + budget < text.length ? '…' : ''}`;
        }
        return highlightHtml(text, terms);
    })
        .join('<br><br>');
}
/** 相对时间：3 天前 / 2 个月前，前端也会用，但服务端返回 ISO 字符串即可 */
export function daysSince(isoDate) {
    const time = Date.parse(isoDate);
    if (!Number.isFinite(time))
        return 3650;
    return Math.max(0, (Date.now() - time) / 86_400_000);
}
//# sourceMappingURL=text.js.map