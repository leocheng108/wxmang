/**
 * 批注笔法：4 个家族（画在正文）+ 8 种笔法（标在卡片）。
 * 判定用规则，不用模型：可解释、可核对、零输入。
 */
export const MARK_KINDS = [
    'point',
    'device',
    'echo',
    'question',
    'evidence',
    'objection',
    'rewrite',
    'exclaim',
];
export const MARK_LABEL = {
    point: '重点',
    device: '手法',
    echo: '呼应',
    question: '疑问',
    evidence: '依据',
    objection: '反对',
    rewrite: '改法',
    exclaim: '感叹',
};
export const MARK_GLYPH = {
    mark: '○',
    doubt: '●',
    oppose: '╱',
    sigh: '～',
};
const FAMILY_OF = {
    point: 'mark',
    device: 'mark',
    echo: 'mark',
    question: 'doubt',
    evidence: 'doubt',
    objection: 'oppose',
    rewrite: 'oppose',
    exclaim: 'sigh',
};
export function familyOf(kind) {
    return FAMILY_OF[kind];
}
export function isMarkKind(value) {
    return typeof value === 'string' && MARK_KINDS.includes(value);
}
export function isMarkFamily(value) {
    return value === 'mark' || value === 'doubt' || value === 'oppose' || value === 'sigh';
}
const REWRITE = /应改|可删|改成|换成|不如作|建议改|应作/;
const OPPOSE = /不对|未必|不同意|恰恰相反|说不通|站不住|错了|并不/;
const EVIDENCE = /出处|依据|凭什么|从何|证据|根据什么|哪来的/;
const QUESTION = /[？?]|为什么|怎么会|是否|难道|何以/;
const ECHO = /前面|后文|上文|呼应|同一处|另见|对应|前文/;
const DEVICE = /手法|伏笔|倒叙|写法|笔法|布局|结构上|结构安排|论证方式/;
const SIGH = /妙|绝|痛|泪|叹|精彩|震撼|动人|好极|深以为然|太美|哎|唉|喔|哇|唏嘘|感慨|感叹|可惜|遗憾|何等|竟然|居然/;
const SIGH_TAIL = /[啊呀呢吧嘛哦]$/;
/**
 * 只把「家族」判到八分把握，笔法细分仅在特征明确时给出。
 * 都不匹配时落到「重点」——最安全的默认值，也就是原来的空心圈。
 */
export function classifyAnnotation(input) {
    const text = (input.content ?? '').trim();
    if (!text) {
        return { family: 'mark', kind: 'point', source: 'auto', confidence: 1 };
    }
    let kind = 'point';
    if (REWRITE.test(text))
        kind = 'rewrite';
    else if (OPPOSE.test(text))
        kind = 'objection';
    else if (EVIDENCE.test(text))
        kind = 'evidence';
    else if (QUESTION.test(text))
        kind = 'question';
    else if (ECHO.test(text))
        kind = 'echo';
    else if (DEVICE.test(text))
        kind = 'device';
    else if (SIGH.test(text) || (text.length <= 40 && SIGH_TAIL.test(text)))
        kind = 'exclaim';
    return {
        family: familyOf(kind),
        kind,
        source: 'auto',
        confidence: kind === 'point' ? 0.5 : 0.8,
    };
}
//# sourceMappingURL=marks.js.map