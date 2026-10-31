import { decodeHtmlEntities } from '../../content/text.js';
function pushRange(ranges, start, end) {
    if (end <= start)
        return;
    const previous = ranges[ranges.length - 1];
    if (previous && previous.end === start) {
        previous.end = end;
        return;
    }
    ranges.push({ start, end });
}
/**
 * 把 Solr/ES 高亮片段中的 `<mark>` 标记解析为中性范围。
 * 其他标签丢弃，`<br>` 归一为换行。
 */
export function fromMarkedHtml(fragment) {
    let text = '';
    let markStart = -1;
    const ranges = [];
    for (const token of fragment.split(/(<[^>]*>)/g)) {
        if (!token)
            continue;
        if (/^<mark\b/i.test(token)) {
            markStart = text.length;
        }
        else if (/^<\/mark\s*>/i.test(token)) {
            if (markStart >= 0) {
                pushRange(ranges, markStart, text.length);
                markStart = -1;
            }
        }
        else if (/^<br\b/i.test(token)) {
            text += '\n';
        }
        else if (/^<[^>]*>$/.test(token)) {
            continue;
        }
        else {
            text += decodeHtmlEntities(token);
        }
    }
    if (markStart >= 0)
        pushRange(ranges, markStart, text.length);
    return { text, ranges };
}
//# sourceMappingURL=HighlightedText.js.map