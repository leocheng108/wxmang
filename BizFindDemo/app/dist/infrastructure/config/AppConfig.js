import { resolve } from 'node:path';
/** 以 .env 为可选配置源，缺失时静默使用默认值 */
function loadDotEnv() {
    try {
        process.loadEnvFile?.();
    }
    catch {
        // 没有 .env 文件是正常情况
    }
}
loadDotEnv();
function toBool(value, fallback) {
    if (value === undefined)
        return fallback;
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}
function toInt(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
function nonEmpty(value, fallback) {
    return value !== undefined && value.trim().length > 0 ? value.trim() : fallback;
}
const DEFAULT_FIELDS = {
    title: 'title',
    author: 'author',
    updatedAt: 'updated_at',
    parentId: '',
    category: 'category',
    tags: 'tags',
    source: 'source',
    department: 'department',
    summary: 'summary',
    url: 'url',
    popularity: 'popularity',
    content: 'content',
};
const DEFAULT_FACETS = [
    { field: 'category', solrField: 'category', label: '业务分类' },
    { field: 'source', solrField: 'source', label: '内容来源' },
    { field: 'department', solrField: 'department', label: '归属部门' },
];
/** 现有 wxmang Core 的字段：正文在 content，标题/作者/时间/标签分别映射 */
const WXMANG_FIELDS = {
    title: 'title',
    author: 'userName',
    updatedAt: 'writeTime',
    parentId: 'parentId',
    category: 'tagName',
    tags: 'tagName',
    source: '',
    department: '',
    summary: '',
    url: 'url',
    popularity: '',
    content: 'content',
};
/** MHTML 课程 Core：课程、文件名、原始链接都是显式字段 */
const WUJUN_FIELDS = {
    title: 'title',
    author: 'userName',
    updatedAt: 'writeTime',
    parentId: 'parentId',
    category: 'course',
    tags: 'tagName',
    source: '',
    department: '',
    summary: 'summary',
    url: 'url',
    popularity: '',
    content: 'content',
};
/** 外部网页 Core：站点、标签、URL 和通用网页元数据 */
const WEB_FIELDS = {
    title: 'title',
    author: 'userName',
    updatedAt: 'writeTime',
    parentId: 'parentId',
    category: 'tagName',
    tags: 'tagName',
    source: 'site',
    department: '',
    summary: 'summary',
    url: 'url',
    popularity: '',
    content: 'content',
};
const CORE_META = {
    wxmang: {
        label: 'wxmang 论坛',
        description: '原有论坛内容，按标题与正文检索',
    },
    wxmang_demo: {
        label: 'wxmang 论坛',
        description: '原有论坛内容，按标题与正文检索',
    },
    wuJun: {
        label: 'wuJun',
        description: '吴军课程资料，可继续添加其它课程',
    },
    gameTheory: {
        label: 'gameTheory',
        description: '蒋文华·博弈论课程资料',
    },
    web: {
        label: '外部网页',
        description: '爬虫抓取的外部网页，主帖与回复独立索引',
    },
};
function createProfile(name) {
    if (name === 'wxmang') {
        return {
            name,
            queryFields: 'title^8 content^1',
            phraseFields: 'title^12 content^2',
            highlightFields: 'title,content',
            fields: WXMANG_FIELDS,
            facets: [{ field: 'category', solrField: 'tagName', label: '标签' }],
            sourceFallback: 'wxmang 论坛',
            suggester: false,
        };
    }
    if (name === 'wuJun') {
        return {
            name,
            queryFields: 'title^8 content^1',
            phraseFields: 'title^12 content^2',
            highlightFields: 'title,content',
            fields: WUJUN_FIELDS,
            facets: [{ field: 'category', solrField: 'course', label: '课程' }],
            sourceFallback: '得到 · 吴军课程',
            suggester: false,
        };
    }
    if (name === 'gameTheory') {
        return {
            name,
            queryFields: 'title^8 content^1',
            phraseFields: 'title^12 content^2',
            highlightFields: 'title,content',
            fields: WUJUN_FIELDS,
            facets: [{ field: 'category', solrField: 'course', label: '课程' }],
            sourceFallback: '得到 · 蒋文华课程',
            suggester: false,
        };
    }
    if (name === 'web') {
        return {
            name,
            queryFields: 'title^8 content^1 summary^1.5',
            phraseFields: 'title^12 content^2',
            highlightFields: 'title,content,summary',
            fields: WEB_FIELDS,
            facets: [
                { field: 'category', solrField: 'tagName', label: '标签' },
                { field: 'source', solrField: 'site', label: '站点' },
            ],
            sourceFallback: '外部网页',
            suggester: false,
        };
    }
    return {
        name: 'default',
        queryFields: 'title^4 tags^2 summary^1.5 content^1',
        phraseFields: 'title^6 summary^2',
        highlightFields: 'title,summary,content',
        fields: DEFAULT_FIELDS,
        facets: DEFAULT_FACETS,
        sourceFallback: '企业知识库',
        suggester: true,
    };
}
function withEnvOverrides(base) {
    return {
        ...base,
        queryFields: nonEmpty(process.env.SOLR_QUERY_FIELDS, base.queryFields),
        phraseFields: nonEmpty(process.env.SOLR_PHRASE_FIELDS, base.phraseFields),
        highlightFields: nonEmpty(process.env.SOLR_HIGHLIGHT_FIELDS, base.highlightFields),
        sourceFallback: nonEmpty(process.env.SOLR_SOURCE_LABEL, base.sourceFallback),
    };
}
const configuredCoreNames = nonEmpty(process.env.SOLR_CORES, process.env.SOLR_CORE ?? 'bizfind')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
const defaultCoreName = nonEmpty(process.env.SOLR_CORE, configuredCoreNames[0] ?? 'bizfind');
if (!configuredCoreNames.includes(defaultCoreName)) {
    configuredCoreNames.unshift(defaultCoreName);
}
const configuredCores = [...new Set(configuredCoreNames)].map((name) => {
    const meta = CORE_META[name];
    const profileName = name === 'wxmang' || name === 'wuJun' || name === 'gameTheory' || name === 'web'
        ? name
        : nonEmpty(process.env.SOLR_PROFILE, 'default');
    return {
        name,
        core: name,
        label: meta?.label ?? name,
        description: meta?.description ?? '自定义 Solr Core',
        profile: withEnvOverrides(createProfile(profileName)),
    };
});
const defaultCoreConfig = configuredCores.find((item) => item.name === defaultCoreName) ?? configuredCores[0];
const profile = defaultCoreConfig.profile;
export const config = {
    version: '1.0.0',
    nodeEnv: process.env.NODE_ENV ?? 'development',
    host: process.env.HOST ?? '127.0.0.1',
    port: toInt(process.env.PORT, 5173),
    webDir: resolve(process.env.WEB_DIR ?? 'web'),
    dataFile: resolve(process.env.DATA_FILE ?? 'data/documents.json'),
    historyDb: resolve(process.env.HISTORY_DB ?? 'data/history.db'),
    topicDb: resolve(process.env.TOPIC_DB ?? 'data/topic-categories.db'),
    noteDb: resolve(process.env.NOTE_DB ?? 'data/notes.db'),
    notesCore: process.env.NOTES_SOLR_CORE ?? 'notes',
    defaultPageSize: 10,
    maxPageSize: 50,
    solr: {
        enabled: toBool(process.env.SOLR_ENABLED, true),
        strict: toBool(process.env.SOLR_STRICT, false),
        baseUrl: (process.env.SOLR_URL ?? 'http://127.0.0.1:8983/solr').replace(/\/+$/, ''),
        core: defaultCoreName,
        defaultCore: defaultCoreName,
        cores: configuredCores,
        timeoutMs: toInt(process.env.SOLR_TIMEOUT_MS, 5000),
        suggestPath: process.env.SOLR_SUGGEST_PATH ?? '/suggest',
        suggestDictionary: process.env.SOLR_SUGGEST_DICTIONARY ?? 'default',
        profile,
    },
    deepseek: {
        enabled: toBool(process.env.DEEPSEEK_SEARCH_ENABLED, true),
        apiKey: process.env.DEEPSEEK_API_KEY?.trim() ?? '',
        sourceName: nonEmpty(process.env.DEEPSEEK_SOURCE_NAME, 'deepseekWeb'),
        sourceLabel: nonEmpty(process.env.DEEPSEEK_SOURCE_LABEL, '外部 Web'),
        searchUrl: nonEmpty(process.env.DEEPSEEK_SEARCH_URL, 'https://api.deepseek.com/v1/tools/search'),
        fetchUrl: nonEmpty(process.env.DEEPSEEK_FETCH_URL, 'https://api.deepseek.com/v1/tools/fetch'),
        cacheDb: resolve(process.env.DEEPSEEK_CACHE_DB ?? 'data/external-cache.db'),
        usageDb: resolve(process.env.DEEPSEEK_USAGE_DB ?? 'data/external-usage.db'),
        count: toInt(process.env.DEEPSEEK_SEARCH_COUNT, 20),
        needContent: toBool(process.env.DEEPSEEK_NEED_CONTENT, true),
        timeoutMs: toInt(process.env.DEEPSEEK_TIMEOUT_MS, 15000),
        cacheTtlMs: toInt(process.env.DEEPSEEK_CACHE_TTL_MS, 300000),
        searchPricePer1000: toInt(process.env.DEEPSEEK_SEARCH_PRICE_PER_1000, 5),
        fetchPricePer1000: toInt(process.env.DEEPSEEK_FETCH_PRICE_PER_1000, 5),
    },
    auth: {
        mode: process.env.AUTH_MODE === 'oidc'
            ? 'oidc'
            : process.env.AUTH_MODE === 'dev'
                ? 'dev'
                : 'local',
        issuer: nonEmpty(process.env.OIDC_ISSUER, ''),
        clientId: nonEmpty(process.env.OIDC_CLIENT_ID, ''),
        clientSecret: process.env.OIDC_CLIENT_SECRET?.trim() ?? '',
        redirectUri: nonEmpty(process.env.OIDC_REDIRECT_URI, 'http://127.0.0.1:5180/auth/callback'),
        postLogoutRedirectUri: nonEmpty(process.env.OIDC_POST_LOGOUT_REDIRECT_URI, 'http://127.0.0.1:5180/'),
        sessionSecret: process.env.SESSION_SECRET?.trim() ?? '',
        sessionTtlMinutes: toInt(process.env.SESSION_TTL_MINUTES, 480),
        sessionIdleMinutes: toInt(process.env.SESSION_IDLE_MINUTES, 30),
        cookieSecure: process.env.COOKIE_SECURE !== undefined
            ? toBool(process.env.COOKIE_SECURE, false)
            : process.env.NODE_ENV === 'production',
        sessionDb: resolve(process.env.AUTH_SESSION_DB ?? 'data/auth-session.db'),
        userDb: resolve(process.env.LOCAL_USER_DB ?? 'data/users.db'),
        adminUser: nonEmpty(process.env.DEMO_ADMIN_USER, 'admin'),
        adminPassword: process.env.DEMO_ADMIN_PASSWORD?.trim() ?? '',
        devUser: nonEmpty(process.env.DEV_AUTH_USER, 'dev-user'),
        devDisplayName: nonEmpty(process.env.DEV_AUTH_DISPLAY_NAME, '本地开发用户'),
        devGroups: nonEmpty(process.env.DEV_AUTH_GROUPS, 'search-users')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
    },
};
export function solrDisplayUrl(core = config.solr.core) {
    return `${config.solr.baseUrl}/${core}`;
}
//# sourceMappingURL=AppConfig.js.map