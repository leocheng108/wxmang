function stripMarkdown(markdown) {
    return markdown
        .replace(/\r\n?/g, '\n')
        .replace(/```[^\n]*\n?/g, '')
        .replace(/```/g, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]*>/g, ' ')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^>\s?/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/[*_~`]/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
export function markdownToText(markdown, maxLength = 260) {
    return stripMarkdown(markdown).replace(/\s+/g, ' ').slice(0, maxLength);
}
/**
 * 把 Fetch/Search 返回的 Markdown 转成可安全渲染的纯文本段落。
 * 不保留 HTML/Markdown 结构，避免外部内容注入；前端按纯文本转义。
 */
export function markdownToParagraphs(markdown, maxParagraphs = 200, maxChars = 120_000) {
    const text = stripMarkdown(markdown).slice(0, maxChars);
    if (!text)
        return [];
    const chunks = text
        .split(/\n{2,}/)
        .map((chunk) => chunk.trim())
        .filter(Boolean);
    const paragraphs = [];
    for (const chunk of chunks) {
        if (chunk.length <= 2_000) {
            paragraphs.push(chunk);
        }
        else {
            for (let offset = 0; offset < chunk.length; offset += 2_000) {
                paragraphs.push(chunk.slice(offset, offset + 2_000).trim());
            }
        }
        if (paragraphs.length >= maxParagraphs)
            break;
    }
    return paragraphs.filter(Boolean);
}
//# sourceMappingURL=DeepSeekContent.js.map