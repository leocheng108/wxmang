import { Router } from 'express';
import { fetchSitePage } from '../site/fetchSitePage.js';
import { parseSitePageWithReplies } from '../site/parseSitePage.js';
import { SolrIndexWriter } from '../solr/SolrIndexWriter.js';
import { buildSiteFieldMappings, htmlPreview, paragraphs, } from '../web/fieldMapping.js';
function stringValue(value, fallback = '') {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function toSolrDocument(doc) {
    return {
        id: doc.id,
        title: doc.title,
        content: doc.content,
        userName: doc.author,
        writeTime: doc.publishTime,
        tagName: doc.tagName,
        url: doc.url,
        fileName: doc.fileName,
        sourcePath: doc.sourcePath,
        parentId: doc.parentId,
        course: doc.course,
        lessonNo: doc.lessonNo,
        docType: doc.docType,
        summary: doc.summary,
    };
}
export function createSiteIngestRouter(config, requireRole) {
    const router = Router();
    const writer = new SolrIndexWriter(config.solr.baseUrl, config.solr.timeoutMs);
    const core = config.solr.core;
    let running = false;
    const coreInfo = () => ({
        name: core,
        numDocs: 0,
        prefix: core,
        supported: false,
        siteSupported: true,
    });
    const sourceFromRequest = (body) => {
        const rawUrl = stringValue(body.url);
        if (!rawUrl)
            throw new Error('请输入网页链接');
        let url;
        try {
            url = new URL(rawUrl);
        }
        catch {
            throw new Error('网页链接格式不正确');
        }
        if (!['http:', 'https:'].includes(url.protocol)) {
            throw new Error('站点采集只支持 http/https');
        }
        const requestedCore = stringValue(body.core, core);
        if (requestedCore !== core) {
            throw new Error(`当前 Demo 只支持写 ${core} Core`);
        }
        const tag = stringValue(body.tag, '网页采集') || '网页采集';
        const idPrefix = stringValue(body.idPrefix, core);
        if (!/^[A-Za-z0-9_-]{1,32}$/.test(idPrefix)) {
            throw new Error('ID 前缀只能包含字母、数字、下划线和短横线，长度 1-32');
        }
        const allowedHosts = stringValue(body.allowedHosts, url.hostname)
            .split(/[,;\s]+/)
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean);
        if (!allowedHosts.includes(url.hostname.toLowerCase())) {
            allowedHosts.push(url.hostname.toLowerCase());
        }
        return {
            id: `site-${url.hostname}`,
            name: `单页采集 · ${url.hostname}`,
            type: 'site',
            core,
            url: url.href,
            allowedHosts,
            tag,
            idPrefix,
        };
    };
    const requiredAdmin = requireRole('search_admin');
    router.get('/api/admin/site/options', requiredAdmin, async (_req, res) => {
        try {
            const numDocs = await writer.count(core);
            res.setHeader('Cache-Control', 'no-store');
            res.json({
                solrUrl: config.solr.baseUrl,
                allowedRoots: [],
                cores: [{ ...coreInfo(), numDocs }],
                configuredSources: [],
                defaults: {
                    tag: '网页采集',
                    prefixes: { [core]: core },
                },
            });
        }
        catch (error) {
            res.status(502).json({ error: errorMessage(error) });
        }
    });
    router.post('/api/admin/site/inspect', requiredAdmin, async (req, res) => {
        try {
            const source = sourceFromRequest((req.body ?? {}));
            const page = await fetchSitePage(source.url, {
                allowedHosts: source.allowedHosts,
                timeoutMs: 20_000,
                maxBytes: 8 * 1024 * 1024,
            });
            const parsed = parseSitePageWithReplies(page.html, {
                tag: source.tag,
                idPrefix: source.idPrefix,
                fallbackUrl: page.finalUrl,
            });
            const allowed = new Set(await writer.fieldNames(source.core));
            const fields = buildSiteFieldMappings(parsed.main).filter((item) => allowed.has(item.field));
            res.json({
                source: {
                    id: parsed.main.id,
                    name: source.name,
                    url: source.url,
                    canonicalUrl: parsed.main.url,
                    core: source.core,
                    tag: source.tag,
                    idPrefix: source.idPrefix,
                    allowedHosts: source.allowedHosts,
                },
                stats: {
                    paragraphCount: parsed.main.paragraphCount,
                    textLength: parsed.main.text.length,
                    contentHtmlLength: parsed.main.content.length,
                },
                fields,
                allowedFields: [...allowed],
                paragraphs: paragraphs(parsed.main),
                htmlPreview: htmlPreview(parsed.main),
                replyCount: parsed.replies.length,
                replies: parsed.replies.slice(0, 100).map((reply) => ({
                    id: reply.id,
                    title: reply.title,
                    author: reply.author,
                    writeTime: reply.publishTime,
                    parentId: reply.parentId,
                    textPreview: reply.text.slice(0, 240),
                    paragraphCount: reply.paragraphCount,
                })),
            });
        }
        catch (error) {
            res.status(400).json({ error: errorMessage(error) });
        }
    });
    router.post('/api/admin/site/apply', requiredAdmin, async (req, res) => {
        if (running) {
            res.status(409).json({ error: '已有采集任务正在运行，请稍后再试' });
            return;
        }
        running = true;
        try {
            const source = sourceFromRequest((req.body ?? {}));
            const page = await fetchSitePage(source.url, {
                allowedHosts: source.allowedHosts,
                timeoutMs: 20_000,
                maxBytes: 8 * 1024 * 1024,
            });
            const parsed = parseSitePageWithReplies(page.html, {
                tag: source.tag,
                idPrefix: source.idPrefix,
                fallbackUrl: page.finalUrl,
            });
            const docs = [parsed.main, ...parsed.replies];
            await writer.ping(source.core);
            const before = await writer.count(source.core);
            await writer.upsert(source.core, docs.map(toSolrDocument));
            await writer.commit(source.core);
            const after = await writer.count(source.core);
            res.json({
                summary: {
                    sourceId: source.id,
                    sourceName: source.name,
                    core: source.core,
                    dryRun: false,
                    scanned: 1,
                    parsed: docs.length,
                    skipped: 0,
                    indexed: docs.length,
                    updated: 0,
                    deleted: 0,
                    missing: 0,
                    failed: 0,
                    errors: [],
                },
                before,
                after,
                source: {
                    id: source.id,
                    url: source.url,
                    core: source.core,
                    tag: source.tag,
                    idPrefix: source.idPrefix,
                    allowedHosts: source.allowedHosts,
                },
            });
        }
        catch (error) {
            res.status(400).json({ error: errorMessage(error) });
        }
        finally {
            running = false;
        }
    });
    return router;
}
//# sourceMappingURL=siteIngestRuntime.js.map