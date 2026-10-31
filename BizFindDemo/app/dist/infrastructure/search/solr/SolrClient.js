export class SolrError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.name = 'SolrError';
        this.status = status;
    }
}
function describeNetworkError(error) {
    const cause = error?.cause;
    const code = cause?.code;
    if (code === 'ECONNREFUSED')
        return '连接被拒绝（ECONNREFUSED），请确认 Solr 已启动';
    if (code === 'ENOTFOUND')
        return '主机名无法解析（ENOTFOUND），请检查 SOLR_URL';
    if (code === 'ETIMEDOUT')
        return '连接超时（ETIMEDOUT）';
    if (code === 'ECONNRESET')
        return '连接被重置（ECONNRESET）';
    return error instanceof Error ? error.message : String(error);
}
/** 对用户输入的检索词做 Solr 特殊字符转义 */
export function escapeSolrQuery(value) {
    return value.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, '\\$1');
}
/** 用于 fq / id 等精确值的引号包裹 */
export function quoteSolrValue(value) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
/**
 * Solr HTTP 客户端：只负责 URL 构造、超时、错误归一化和 JSON 解析。
 * 换成别的搜索后端时，只需要替换这一层与 SolrSearchAdapter。
 */
export class SolrClient {
    baseUrl;
    core;
    timeoutMs;
    constructor(config) {
        this.baseUrl = config.baseUrl.replace(/\/+$/, '');
        this.core = config.core;
        this.timeoutMs = config.timeoutMs;
    }
    get coreUrl() {
        return `${this.baseUrl}/${encodeURIComponent(this.core)}`;
    }
    buildUrl(path, params = {}) {
        const url = new URL(`${this.coreUrl}${path.startsWith('/') ? path : `/${path}`}`);
        for (const [key, value] of Object.entries(params)) {
            if (value === undefined)
                continue;
            if (Array.isArray(value)) {
                for (const item of value)
                    url.searchParams.append(key, String(item));
            }
            else {
                url.searchParams.set(key, String(value));
            }
        }
        url.searchParams.set('wt', 'json');
        return url;
    }
    async request(path, params = {}) {
        const url = this.buildUrl(path, params);
        let response;
        try {
            response = await fetch(url, {
                headers: { accept: 'application/json' },
                signal: AbortSignal.timeout(this.timeoutMs),
            });
        }
        catch (error) {
            if (error instanceof Error && error.name === 'TimeoutError') {
                throw new SolrError(`连接 Solr 超时（${this.timeoutMs}ms）：${url.origin}`);
            }
            throw new SolrError(`无法连接 Solr（${url.origin}）：${describeNetworkError(error)}`);
        }
        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new SolrError(`Solr 返回 HTTP ${response.status}${detail ? `：${detail.slice(0, 240)}` : ''}`, response.status);
        }
        try {
            return (await response.json());
        }
        catch {
            throw new SolrError('Solr 返回内容不是合法 JSON');
        }
    }
    select(params) {
        return this.request('/select', params);
    }
    async ping() {
        const started = performance.now();
        try {
            await this.select({ q: '*:*', rows: 0, fl: 'id' });
            return { ok: true, latencyMs: Math.round(performance.now() - started) };
        }
        catch (error) {
            return {
                ok: false,
                latencyMs: Math.round(performance.now() - started),
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
}
//# sourceMappingURL=SolrClient.js.map