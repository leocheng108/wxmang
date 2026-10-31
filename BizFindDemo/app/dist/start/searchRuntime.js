import { SearchApplicationService } from '../application/search/SearchApplicationService.js';
import { MockSearchAdapter } from '../infrastructure/search/mock/MockSearchAdapter.js';
import { MockDomainAdapter } from '../infrastructure/search/mock/MockDomainAdapter.js';
import { SolrClient } from '../infrastructure/search/solr/SolrClient.js';
import { SolrSearchAdapter } from '../infrastructure/search/solr/SolrSearchAdapter.js';
import { DeepSeekSearchAdapter } from '../infrastructure/search/deepseek/DeepSeekSearchAdapter.js';
import { DeepSeekDocumentCache } from '../infrastructure/search/deepseek/DeepSeekDocumentCache.js';
import { SqliteExternalUsageStore } from '../infrastructure/search/deepseek/SqliteExternalUsageStore.js';
import { ExternalUsageApplicationService } from '../application/external/ExternalUsageApplicationService.js';
import { HistoryApplicationService } from '../application/history/HistoryApplicationService.js';
import { SqliteHistoryStore } from '../infrastructure/history/sqlite/SqliteHistoryStore.js';
import { TopicApplicationService } from '../application/topics/TopicApplicationService.js';
import { SqliteNoteStore } from '../infrastructure/notes/SqliteNoteStore.js';
import { SolrNoteIndex } from '../infrastructure/notes/SolrNoteIndex.js';
/**
 * Composition root：加载内置语料，为每个 Core 探测 Solr，并注入主/备检索端口。
 * wxmang / wuJun / gameTheory 各自有 profile，互不影响；请求通过 core 参数选择。
 */
export async function createSearchRuntime(config) {
    const mock = new MockDomainAdapter(MockSearchAdapter.fromFile(config.dataFile));
    const mockDocCount = (await mock.stats()).docCount;
    const history = new HistoryApplicationService(new SqliteHistoryStore(config.historyDb));
    await history.purgeExpired().catch((error) => {
        console.warn('[history] 清理过期检索历史失败', error);
    });
    const usageStore = new SqliteExternalUsageStore(config.deepseek.usageDb);
    const externalUsage = new ExternalUsageApplicationService(usageStore);
    await externalUsage.purge().catch((error) => {
        console.warn('[external-usage] 清理过期调用记录失败', error);
    });
    const startedAt = Date.now();
    const services = new Map();
    const cores = [];
    let defaultStatus = {
        enabled: config.solr.enabled,
        reachable: false,
        url: config.solr.baseUrl,
        core: config.solr.defaultCore,
        latencyMs: null,
    };
    if (!config.solr.enabled) {
        for (const coreConfig of config.solr.cores) {
            services.set(coreConfig.name, new SearchApplicationService(mock, mock, 'SOLR_ENABLED=false，当前使用内置演示索引。'));
            cores.push({
                name: coreConfig.name,
                label: coreConfig.label,
                description: coreConfig.description,
                backend: 'mock',
                reachable: false,
            });
        }
    }
    else {
        for (const coreConfig of config.solr.cores) {
            const client = new SolrClient({
                baseUrl: config.solr.baseUrl,
                core: coreConfig.core,
                timeoutMs: config.solr.timeoutMs,
            });
            const provider = new SolrSearchAdapter(client, {
                ...config.solr,
                core: coreConfig.core,
                profile: coreConfig.profile,
            });
            const ping = await client.ping();
            const status = {
                enabled: true,
                reachable: ping.ok,
                url: config.solr.baseUrl,
                core: coreConfig.core,
                latencyMs: ping.latencyMs,
                error: ping.ok ? undefined : ping.error,
            };
            const isDefault = coreConfig.name === config.solr.defaultCore;
            if (isDefault)
                defaultStatus = status;
            if (ping.ok) {
                services.set(coreConfig.name, new SearchApplicationService(provider, mock));
            }
            else {
                if (isDefault && config.solr.strict) {
                    throw new Error(`Solr 不可用（${config.solr.baseUrl}/${coreConfig.core}）：${ping.error ?? '未知错误'}`);
                }
                services.set(coreConfig.name, new SearchApplicationService(mock, mock, `未连接 Solr（${config.solr.baseUrl}/${coreConfig.core}），当前使用内置演示索引；配置后重启即可切换。`));
            }
            cores.push({
                name: coreConfig.name,
                label: coreConfig.label,
                description: coreConfig.description,
                backend: ping.ok ? 'solr' : 'mock',
                reachable: ping.ok,
            });
        }
    }
    if (config.deepseek.enabled && config.deepseek.apiKey) {
        const source = config.deepseek.sourceName;
        if (!services.has(source)) {
            const documentCache = new DeepSeekDocumentCache(config.deepseek.cacheDb);
            documentCache.purgeBefore(new Date(Date.now() - 30 * 86_400_000).toISOString());
            const external = new DeepSeekSearchAdapter(config.deepseek, undefined, documentCache, usageStore);
            services.set(source, new SearchApplicationService(external, mock));
            cores.push({
                name: source,
                label: config.deepseek.sourceLabel,
                description: 'DeepSeek 实时外部网页检索，不写入 Solr 索引',
                backend: 'external',
                reachable: true,
            });
        }
    }
    else if (config.deepseek.enabled) {
        console.warn('[deepseek] 已启用外部 Web，但未配置 DEEPSEEK_API_KEY，已跳过该数据源');
    }
    const defaultService = services.get(config.solr.defaultCore) ?? services.values().next().value;
    if (!defaultService)
        throw new Error('没有可用的检索 Core');
    const topics = new TopicApplicationService(config.solr, services.get(config.solr.defaultCore) ?? defaultService, config.topicDb);
    await topics.initialize();
    const notes = new SqliteNoteStore(config.noteDb);
    const noteIndex = new SolrNoteIndex(config.solr.baseUrl, config.notesCore);
    try {
        await noteIndex.syncAll(notes.listAll());
    }
    catch (error) {
        console.warn(`[notes] 同步 Solr notes core 失败：${error instanceof Error ? error.message : String(error)}`);
    }
    return {
        service: defaultService,
        services,
        cores,
        defaultCore: config.solr.defaultCore,
        history,
        externalUsage,
        topics,
        notes,
        noteIndex,
        solrStatus: defaultStatus,
        mockDocCount,
        version: config.version,
        startedAt,
        hasCore(name) {
            return services.has(name);
        },
        resolveCoreName(name) {
            const requested = (name ?? '').trim();
            if (!requested)
                return config.solr.defaultCore;
            if (services.has(requested))
                return requested;
            if (requested === 'wxmang') {
                // 切到独立 core 之前的链接仍带 core=wxmang，按默认 core 处理，避免整页不可用
                console.warn('[core] core=wxmang 已迁移，按默认 Core ' + config.solr.defaultCore + ' 处理');
                return config.solr.defaultCore;
            }
            // 未知名字不在这里兜底：交给调用方返回明确错误，避免掩盖真正的配置问题
            return requested;
        },
        serviceFor(core) {
            return services.get(core ?? config.solr.defaultCore) ?? defaultService;
        },
        health() {
            return {
                ok: true,
                backend: defaultService.backend,
                solr: defaultStatus,
                defaultCore: config.solr.defaultCore,
                cores,
                mock: { docCount: mockDocCount },
                uptimeSec: Math.round((Date.now() - startedAt) / 1000),
                version: config.version,
            };
        },
        async close() {
            history.close();
            usageStore.close();
            topics.close();
            notes.close();
            await Promise.allSettled([...new Set(services.values())].map((service) => service.close()));
        },
    };
}
//# sourceMappingURL=searchRuntime.js.map