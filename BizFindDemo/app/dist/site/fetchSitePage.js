import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
const USER_AGENT = 'BizFindIngest/0.2 (+local internal indexer)';
const robotsCache = new Map();
function isPrivateIp(address) {
    if (isIP(address) === 4) {
        const parts = address.split('.').map(Number);
        return (parts[0] === 10 ||
            parts[0] === 127 ||
            (parts[0] === 169 && parts[1] === 254) ||
            (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
            (parts[0] === 192 && parts[1] === 168) ||
            parts[0] === 0);
    }
    const normalized = address.toLowerCase();
    return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd');
}
function hostAllowed(host, allowedHosts) {
    return allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}
async function assertSafeUrl(url, allowedHosts) {
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('站点采集只支持 http/https');
    }
    if (!hostAllowed(url.hostname, allowedHosts)) {
        throw new Error(`域名不在 allowedHosts 中：${url.hostname}`);
    }
    const addresses = await lookup(url.hostname, { all: true });
    if (addresses.some((item) => isPrivateIp(item.address))) {
        throw new Error('目标域名解析到私网地址，已拒绝');
    }
}
function parseRobots(text) {
    const rules = { disallow: [], allow: [] };
    let applies = false;
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.replace(/#.*$/, '').trim();
        if (!line)
            continue;
        const [rawKey, ...rest] = line.split(':');
        const key = rawKey.trim().toLowerCase();
        const value = rest.join(':').trim();
        if (key === 'user-agent') {
            applies = value === '*';
            continue;
        }
        if (!applies)
            continue;
        if (key === 'disallow' && value)
            rules.disallow.push(value);
        if (key === 'allow' && value)
            rules.allow.push(value);
    }
    return rules;
}
async function robotsFor(url, timeoutMs) {
    const origin = url.origin;
    const cached = robotsCache.get(origin);
    if (cached !== undefined)
        return cached;
    try {
        const response = await fetch(`${origin}/robots.txt`, {
            headers: { 'user-agent': USER_AGENT, accept: 'text/plain' },
            signal: AbortSignal.timeout(timeoutMs),
        });
        const text = response.ok ? await response.text() : '';
        robotsCache.set(origin, text);
        return text;
    }
    catch {
        robotsCache.set(origin, '');
        return '';
    }
}
async function assertRobotsAllowed(url, timeoutMs) {
    const rules = parseRobots(await robotsFor(url, timeoutMs));
    const path = `${url.pathname}${url.search}`;
    const matches = (prefix) => path.startsWith(prefix);
    if (rules.disallow.some(matches) && !rules.allow.some(matches)) {
        throw new Error(`robots.txt 禁止抓取：${path}`);
    }
}
function detectCharset(html, contentType) {
    const header = /charset="?([^";\s]+)/i.exec(contentType)?.[1];
    const meta = /<meta[^>]+charset=["']?([^"'\s/>]+)/i.exec(html.subarray(0, 4096).toString('latin1'))?.[1];
    return (header ?? meta ?? 'utf-8').toLowerCase();
}
export async function fetchSitePage(target, options) {
    const timeoutMs = options.timeoutMs ?? 20_000;
    const maxBytes = options.maxBytes ?? 8 * 1024 * 1024;
    const url = new URL(target);
    await assertSafeUrl(url, options.allowedHosts);
    await assertRobotsAllowed(url, timeoutMs);
    const response = await fetch(url, {
        redirect: 'follow',
        headers: {
            'user-agent': USER_AGENT,
            accept: 'text/html,application/xhtml+xml',
            'accept-language': 'zh-CN,zh;q=0.9,en;q=0.6',
        },
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok)
        throw new Error(`页面抓取失败：HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('text/html')) {
        throw new Error(`目标不是 HTML：${contentType || 'unknown'}`);
    }
    const length = Number(response.headers.get('content-length') ?? '0');
    if (length > maxBytes)
        throw new Error(`页面超过大小限制：${length} bytes`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes)
        throw new Error(`页面超过大小限制：${buffer.length} bytes`);
    const charset = detectCharset(buffer, contentType);
    let html;
    try {
        html = new TextDecoder(charset).decode(buffer);
    }
    catch {
        html = new TextDecoder('utf-8').decode(buffer);
    }
    const finalUrl = response.url || url.href;
    const final = new URL(finalUrl);
    await assertSafeUrl(final, options.allowedHosts);
    return { finalUrl, html, status: response.status, charset };
}
//# sourceMappingURL=fetchSitePage.js.map