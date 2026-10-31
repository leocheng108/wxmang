/** 中文数词：十五、二十三、一百 这类也能解析 */
const CHINESE_DIGITS = {
    零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};
const NUMERAL_CHARS = '零一二三四五六七八九十百';
/** 「标题主干 + 编号 + 分隔符」才算系列；分隔符后的副标题会被忽略 */
const SERIES_PATTERN = new RegExp(`^(.*?[^${NUMERAL_CHARS}\\d.])\\s*([${NUMERAL_CHARS}]{1,4}|\\d{1,3})` +
    `(?:\\s*[（(]\\s*([${NUMERAL_CHARS}]{1,4}|\\d{1,3})\\s*[）)])?` +
    `(?=[、：:，,。\\s—–\\-（(]|$)`);
export function parseChineseNumber(value) {
    if (/^\d+$/.test(value))
        return Number(value);
    let total = 0;
    let current = 0;
    for (const char of value) {
        if (char === '百') {
            total += (current || 1) * 100;
            current = 0;
        }
        else if (char === '十') {
            total += (current || 1) * 10;
            current = 0;
        }
        else if (char in CHINESE_DIGITS) {
            current = CHINESE_DIGITS[char];
        }
        else {
            return null;
        }
    }
    return total + current;
}
export function parseSeriesTitle(title) {
    const text = title
        .trim()
        .replace(/^[【（(][^】）)]*[】）)]\s*/, '')
        .trim();
    const match = SERIES_PATTERN.exec(text);
    if (!match)
        return null;
    const prefix = match[1].replace(/[：:、，,\s—–-]+$/, '').trim();
    const index = parseChineseNumber(match[2]);
    const sub = match[3] ? parseChineseNumber(match[3]) : 0;
    if (prefix.length < 2)
        return null;
    if (index === null || index <= 0 || index > 200)
        return null;
    if (sub === null || sub < 0 || sub > 200)
        return null;
    return { prefix, index, sub };
}
/**
 * 系列前后篇：同作者 + 同标题主干 + 编号相邻。
 * 只在能确定时才给，宁可没有，也不要串到别的文章。
 */
export class DocumentSeriesService {
    search;
    constructor(search) {
        this.search = search;
    }
    async find(docId) {
        const empty = {
            prefix: null,
            index: null,
            previous: null,
            next: null,
            items: [],
        };
        const doc = await this.search.getDocument(docId, '');
        if (!doc)
            return empty;
        const current = parseSeriesTitle(doc.doc.title);
        if (!current)
            return empty;
        const page = await this.search.search({
            q: current.prefix,
            page: 1,
            pageSize: 30,
            sort: 'relevance',
        });
        const siblings = page.results
            .filter((hit) => hit.author === doc.doc.author && hit.id !== docId)
            .map((hit) => {
            const parsed = parseSeriesTitle(hit.title.text);
            return parsed && parsed.prefix === current.prefix
                ? { id: hit.id, title: hit.title.text, index: parsed.index, sub: parsed.sub }
                : null;
        })
            .filter((item) => item !== null);
        // 主编号 + 子编号组成排序键；同一位置可能有多篇重复帖，保留相关度最高的
        const keyOf = (item) => item.index * 1000 + item.sub;
        const byKey = new Map();
        for (const item of siblings) {
            const key = keyOf(item);
            if (!byKey.has(key))
                byKey.set(key, item);
        }
        const ordered = [...byKey.values()].sort((a, b) => keyOf(a) - keyOf(b));
        const currentKey = current.index * 1000 + current.sub;
        // 全篇清单：把当前这篇也放进去，读者才看得到自己在系列里的位置
        const items = [
            ...ordered.map((item) => ({ ...item, current: false })),
            { id: docId, title: doc.doc.title, index: current.index, sub: current.sub, current: true },
        ]
            .filter((item, position, all) => all.findIndex((other) => keyOf(other) === keyOf(item)) === position)
            .map((item) => ({ ...item, current: item.id === docId }))
            .sort((a, b) => keyOf(a) - keyOf(b));
        return {
            prefix: current.prefix,
            index: current.index,
            previous: [...ordered].reverse().find((item) => keyOf(item) < currentKey) ?? null,
            next: ordered.find((item) => keyOf(item) > currentKey) ?? null,
            items,
        };
    }
}
//# sourceMappingURL=DocumentSeriesService.js.map