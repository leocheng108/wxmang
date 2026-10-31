/**
 * 批注关键词抽取：决定「这条批注值不值得推」以及「用什么词去搜」。
 * 纯规则，无模型：短批注、纯反应词一律不推；长句按功能词切开取词组。
 */
/** 功能词：切开它们，剩下的才是可检索内容 */
const FUNCTION_WORDS = [
    '的时候',
    '之后',
    '之前',
    '所有',
    '任何',
    '每个',
    '各种',
    '最后',
    '其实',
    '真的',
    '非常',
    '特别',
    '比较',
    '觉得',
    '认为',
    '感觉',
    '就是',
    '还是',
    '也是',
    '都会',
    '可以',
    '需要',
    '应该',
    '可能',
    '已经',
    '正在',
    '因为',
    '所以',
    '如果',
    '虽然',
    '即使',
    '而且',
    '但是',
    '然后',
    '这样',
    '那样',
    '这些',
    '那些',
    '这个',
    '那个',
    '什么',
    '怎么',
    '如何',
    '一个',
    '一种',
    '一些',
    '有点',
    '我们',
    '你们',
    '他们',
    '自己',
    '没有',
    '不是',
    '不能',
    '不会',
    '只是',
    '不过',
    '于是',
    '因此',
    '然而',
    '并且',
    '或者',
    '以及',
    '的',
    '了',
    '着',
    '是',
    '在',
    '和',
    '与',
    '及',
    '或',
    '就',
    '都',
    '也',
    '还',
    '又',
    '再',
    '才',
    '却',
    '而',
    '但',
    '把',
    '被',
    '让',
    '给',
    '对',
    '于',
    '从',
    '到',
    '向',
    '为',
    '以',
    '之',
    '其',
    '这',
    '那',
    '很',
    '更',
    '最',
    '不',
    '没',
    '会',
    '能',
    '要',
    '说',
    '讲',
    '上',
    '下',
    '中',
    '里',
    '内',
    '外',
    '前',
    '后',
    '时',
    '吗',
    '呢',
    '吧',
    '啊',
    '呀',
    '嘛',
    '哦',
    '么',
];
const FUNCTION_RE = new RegExp(FUNCTION_WORDS.join('|'), 'g');
const PUNCTUATION = /[\s，。、；：？！…—－·“”‘’《》〈〉（）()【】\[\]{}<>~`!@#$%^&*_+=|\\/"';:,.?\-]+/g;
/** 整句只有反应词时，判定为「没有可检索内容」 */
const REACTION_ONLY = /^(有道理|赞同|同感|同意|说得好|好|赞|不错|精彩|受教|原来如此|确实|是的|没错|牛|妙|绝|学习了|谢谢|哈哈|合情合理|深有同感|有同感|嗯|啊|哦|对|是|好极了|服|厉害|强|太棒了|附议|太好了|说得太好了|真好|棒|绝了|服了)+$/;
/** 泛词：字面命中也不足以证明相关，直接丢弃 */
const GENERIC = new Set([
    '关键',
    '问题',
    '方面',
    '情况',
    '过程',
    '结果',
    '原因',
    '意义',
    '价值',
    '作用',
    '影响',
    '程度',
    '水平',
    '东西',
    '事情',
    '内容',
    '方法',
    '方式',
    '核心',
    '重要',
    '不同',
]);
const MAX_TERM_LENGTH = 8;
/** 2–4 字最像词，其次 5–6 字，过长的短语降权 */
function rank(term) {
    if (term.length <= 4)
        return 0;
    if (term.length <= 6)
        return 1;
    return 2;
}
export function extractKeywords(text) {
    const raw = (text ?? '').trim();
    const compact = raw.replace(PUNCTUATION, '');
    if (REACTION_ONLY.test(compact))
        return { ok: false, terms: [], reason: 'reaction-only' };
    if (raw.length < 6)
        return { ok: false, terms: [], reason: 'too-short' };
    const normalized = raw
        .replace(PUNCTUATION, ' ')
        .replace(FUNCTION_RE, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalized)
        return { ok: false, terms: [], reason: 'no-terms' };
    const terms = [];
    for (const piece of normalized.split(' ')) {
        const term = piece.slice(0, MAX_TERM_LENGTH);
        if (term.length < 2)
            continue;
        if (GENERIC.has(term))
            continue;
        if (!terms.includes(term))
            terms.push(term);
    }
    if (terms.length === 0)
        return { ok: false, terms: [], reason: 'no-terms' };
    terms.sort((a, b) => rank(a) - rank(b) || b.length - a.length);
    return { ok: true, terms: terms.slice(0, 3) };
}
//# sourceMappingURL=annotationKeywords.js.map