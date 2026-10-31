import { createHash } from 'node:crypto';
import { load } from 'cheerio';
function text(value) {
    return (value ?? '').replace(/\s+/g, ' ').trim();
}
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
function parsePublishedAt(raw) {
    const match = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
    if (!match)
        return new Date().toISOString();
    const [, year, month, day, hour, minute, second] = match;
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`).toISOString();
}
export function canonicalizeUrl(raw) {
    const url = new URL(raw);
    url.hash = '';
    // 去掉常见的跟踪参数，保证同一篇文章的 ID 稳定。
    for (const key of ['_spm_id', '_i', '_dtcc', 'dt_dapp', 'dt_platform']) {
        url.searchParams.delete(key);
    }
    return url.href;
}
function paragraphsFrom($, root) {
    const paragraphs = root
        .find('p')
        .map((_, element) => text($(element).text()))
        .get()
        .filter(Boolean);
    if (paragraphs.length === 0) {
        const fallback = text(root.text());
        if (fallback)
            paragraphs.push(fallback);
    }
    return paragraphs;
}
function makeDoc(input) {
    const textContent = input.paragraphs.join('\n\n');
    const summary = textContent.length > 180 ? `${textContent.slice(0, 180)}…` : textContent;
    return {
        id: input.id,
        title: input.title,
        course: '',
        lessonNo: '',
        author: input.author,
        publishTime: input.publishedAt,
        url: input.url,
        fileName: '',
        sourcePath: input.sourcePath,
        parentId: input.parentId,
        docType: input.docType,
        tagName: input.tag,
        tags: [input.tag],
        summary,
        content: input.paragraphs.map((item) => `<p>${escapeHtml(item)}</p>`).join(''),
        text: textContent,
        paragraphCount: input.paragraphs.length,
    };
}
export function parseSitePageWithReplies(html, options) {
    const $ = load(html);
    const canonicalHref = $('link[rel="canonical"]').attr('href');
    const canonicalUrl = canonicalizeUrl(canonicalHref || options.fallbackUrl);
    const title = text($('#topic-content h1').first().text()) ||
        text($('h1').first().text()) ||
        text($('title').first().text().split('|')[0]) ||
        canonicalUrl;
    const author = text($('#topic-content .topic-doc .from a').first().text()) ||
        text($('.topic-doc .from a').first().text()) ||
        '未知';
    const publishedRaw = text($('#topic-content .topic-doc .create-time').first().text()) ||
        text($('.create-time').first().text());
    const publishedAt = parsePublishedAt(publishedRaw);
    const rich = $('#link-report .topic-content .rich-content').first();
    const contentRoot = rich.length ? rich : $('#link-report .topic-content').first();
    if (!contentRoot.length)
        throw new Error('没有找到主帖正文容器 #link-report .topic-content');
    const mainParagraphs = paragraphsFrom($, contentRoot);
    if (mainParagraphs.length === 0)
        throw new Error('主帖正文为空');
    const mainId = `${options.idPrefix}-${createHash('sha1')
        .update(canonicalUrl)
        .digest('hex')
        .slice(0, 12)}`;
    const main = makeDoc({
        id: mainId,
        title,
        author,
        publishedAt,
        url: canonicalUrl,
        sourcePath: canonicalUrl,
        parentId: '0',
        docType: '网页文章',
        tag: options.tag,
        paragraphs: mainParagraphs,
    });
    const replies = [];
    const seen = new Set();
    $('#comments li.comment-item, #comments li.reply-item').each((index, element) => {
        const item = $(element);
        const cid = item.attr('data-cid')?.trim() ||
            item.attr('id')?.trim() ||
            String(index + 1);
        if (seen.has(cid))
            return;
        seen.add(cid);
        const replyAuthor = text(item.find('.reply-doc h4 a').first().text()) ||
            text(item.find('.reply-doc h4').first().text()) ||
            '未知';
        const replyDate = parsePublishedAt(text(item.find('.pubtime').first().text()));
        const replyRoot = item.find('.reply-content').first();
        const replyParagraphs = replyRoot.length ? paragraphsFrom($, replyRoot) : [];
        const replySourcePath = `${canonicalUrl}#reply-${cid}`;
        const replyId = `${options.idPrefix}-${createHash('sha1')
            .update(replySourcePath)
            .digest('hex')
            .slice(0, 12)}`;
        replies.push(makeDoc({
            id: replyId,
            title: `RE: ${title}`,
            author: replyAuthor,
            publishedAt: replyDate,
            url: canonicalUrl,
            sourcePath: replySourcePath,
            parentId: mainId,
            docType: '网页回复',
            tag: options.tag,
            paragraphs: replyParagraphs.length > 0 ? replyParagraphs : ['（空回复）'],
        }));
    });
    return { main, replies };
}
export function parseSitePage(html, options) {
    return parseSitePageWithReplies(html, options).main;
}
//# sourceMappingURL=parseSitePage.js.map