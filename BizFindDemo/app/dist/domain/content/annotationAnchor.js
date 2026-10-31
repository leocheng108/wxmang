/**
 * 批注锚点解析（纯函数，不碰 DOM）。
 *
 * 两件容易出错的事都在这里收口：
 * 1) 字符偏移落到文本节点边界上时，起点应归下一段、终点应留在本段；
 * 2) 存下来的偏移可能因正文改版而漂移，要靠原文字面把它找回来。
 */
/** 每个段落在全文中的区间；total 用来判断这套区间是否与全文长度吻合 */
export function buildSpans(parts) {
    const spans = [];
    let position = 0;
    for (const part of parts) {
        spans.push({ start: position, end: position + part.length });
        position += part.length;
    }
    return { spans, total: position };
}
export function paragraphIndexAt(spans, offset, fallback = 0) {
    for (let index = 0; index < spans.length; index += 1) {
        if (offset >= spans[index].start && offset < spans[index].end)
            return index;
    }
    if (spans.length > 0 && offset >= spans[spans.length - 1].end)
        return spans.length - 1;
    return fallback;
}
/**
 * 把字符偏移映射到「第几个文本节点 + 节点内偏移」。
 *
 * start 用严格小于：偏移正好落在段首（等于上一节点末尾）时归下一节点，
 * 否则区间会退化成上一段末尾，标记就画到上一行去了。
 * end 用小于等于：偏移落在段尾时留在本节点，区间不会溢到下一段。
 */
export function locateOffset(lengths, offset, mode) {
    if (lengths.length === 0)
        return null;
    const clamped = Math.max(0, offset);
    let position = 0;
    for (let index = 0; index < lengths.length; index += 1) {
        const next = position + lengths[index];
        const hit = mode === 'start' ? clamped < next : clamped <= next;
        if (hit) {
            return { node: index, offset: Math.max(0, clamped - position) };
        }
        position = next;
    }
    // 偏移落在全文末尾：挂到最后一个节点的末尾
    const last = lengths.length - 1;
    return { node: last, offset: lengths[last] };
}
/**
 * 解析一条批注在正文中的实际区间。
 * 先按偏移取；与原文不符则按原文重新定位，优先落在记录的那一段内。
 */
export function resolveAnchor(input) {
    const { full, spans } = input;
    const quote = (input.quote ?? '').trim();
    const start = input.startOffset;
    const end = input.endOffset;
    const recordedParagraph = input.paragraphIndex;
    const fallback = () => ({
        start: Math.max(0, Math.min(start, full.length)),
        end: Math.max(0, Math.min(end, full.length)),
        paragraphIndex: paragraphIndexAt(spans, start, recordedParagraph),
        exact: false,
        found: false,
    });
    if (start >= 0 && end > start && end <= full.length) {
        const slice = full.slice(start, end).trim();
        if (!quote || slice === quote) {
            const exactParagraph = paragraphIndexAt(spans, start, recordedParagraph);
            // 偏移虽然命中原文，但落在了另一段：说明这句在相邻段落重复出现，
            // 这时要信“记录的那一段”，继续走后面的按段落优先匹配。
            const ambiguous = spans.length > 0 && exactParagraph !== recordedParagraph;
            if (!ambiguous) {
                return {
                    start,
                    end,
                    paragraphIndex: exactParagraph,
                    exact: true,
                    found: true,
                };
            }
        }
    }
    if (!quote)
        return fallback();
    const occurrences = [];
    let cursor = full.indexOf(quote);
    while (cursor >= 0) {
        occurrences.push(cursor);
        cursor = full.indexOf(quote, cursor + 1);
    }
    if (occurrences.length === 0)
        return fallback();
    const inParagraph = spans.length > 0 && spans[recordedParagraph]
        ? occurrences.filter((hit) => hit >= spans[recordedParagraph].start && hit < spans[recordedParagraph].end)
        : [];
    const pool = inParagraph.length > 0 ? inParagraph : occurrences;
    let best = pool[0];
    for (const hit of pool) {
        if (Math.abs(hit - start) < Math.abs(best - start))
            best = hit;
    }
    return {
        start: best,
        end: best + quote.length,
        paragraphIndex: paragraphIndexAt(spans, best, recordedParagraph),
        exact: best === start && best + quote.length === end,
        found: true,
    };
}
//# sourceMappingURL=annotationAnchor.js.map