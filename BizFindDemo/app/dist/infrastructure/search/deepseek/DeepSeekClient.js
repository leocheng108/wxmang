function eventDay() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
}
function apiError(status, body) {
    const message = body && typeof body === 'object' && 'error' in body
        ? String(body.error?.message ?? '')
        : '';
    if (status === 401)
        return new Error('DeepSeek API Key 无效或已失效');
    if (status === 402)
        return new Error('DeepSeek 账户余额不足');
    if (status === 403)
        return new Error('DeepSeek Fetch 请求被安全策略拒绝');
    if (status === 404)
        return new Error('DeepSeek Fetch 未能获取网页正文（页面不可用或被站点拦截）');
    if (status === 429)
        return new Error('DeepSeek API 限流，请稍后重试');
    return new Error(`DeepSeek API 请求失败（HTTP ${status}）${message ? `：${message}` : ''}`);
}
/**
 * DeepSeek Search / Fetch API 客户端。只在服务端持有 API Key，不暴露给浏览器。
 */
export class DeepSeekClient {
    config;
    usage;
    constructor(config, usage) {
        this.config = config;
        this.usage = usage;
    }
    record(operation, outcome, latencyMs, error) {
        const price = operation === 'search'
            ? this.config.searchPricePer1000
            : this.config.fetchPricePer1000;
        const billable = outcome === 'success';
        try {
            this.usage?.record({
                operation,
                outcome,
                billable,
                costYuan: billable ? price / 1000 : 0,
                eventDay: eventDay(),
                createdAt: new Date().toISOString(),
                latencyMs,
                error,
            });
        }
        catch {
            // 账本写入失败不能影响检索
        }
    }
    async search(query, count) {
        if (!this.config.apiKey)
            throw new Error('未配置 DEEPSEEK_API_KEY');
        const started = Date.now();
        let recorded = false;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
        try {
            const response = await fetch(this.config.searchUrl, {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${this.config.apiKey}`,
                    'content-type': 'application/json',
                    accept: 'application/json',
                },
                body: JSON.stringify({
                    query,
                    count,
                    need_content: this.config.needContent,
                    ori_question: query,
                }),
                signal: controller.signal,
            });
            const body = (await response.json().catch(() => null));
            if (!response.ok) {
                const error = apiError(response.status, body);
                this.record('search', 'failure', Date.now() - started, error.message);
                recorded = true;
                throw error;
            }
            const results = body?.results;
            const resolved = Array.isArray(results) ? results : [];
            this.record('search', resolved.length > 0 ? 'success' : 'empty', Date.now() - started);
            recorded = true;
            return resolved;
        }
        catch (error) {
            if (!recorded) {
                this.record('search', 'failure', Date.now() - started, error instanceof Error ? error.message : 'Search 请求失败');
            }
            if (error instanceof DOMException && error.name === 'AbortError') {
                throw new Error('DeepSeek Search API 超时');
            }
            throw error;
        }
        finally {
            clearTimeout(timer);
        }
    }
    async fetchPage(url) {
        if (!this.config.apiKey)
            throw new Error('未配置 DEEPSEEK_API_KEY');
        const started = Date.now();
        let recorded = false;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
        try {
            const response = await fetch(this.config.fetchUrl, {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${this.config.apiKey}`,
                    'content-type': 'application/json',
                    accept: 'application/json',
                },
                body: JSON.stringify({ url }),
                signal: controller.signal,
            });
            const body = (await response.json().catch(() => null));
            if (!response.ok) {
                const error = apiError(response.status, body);
                this.record('fetch', 'failure', Date.now() - started, error.message);
                recorded = true;
                throw error;
            }
            const page = body;
            const outcome = page.content?.trim() ? 'success' : 'empty';
            this.record('fetch', outcome, Date.now() - started);
            recorded = true;
            return page;
        }
        catch (error) {
            if (!recorded) {
                this.record('fetch', 'failure', Date.now() - started, error instanceof Error ? error.message : 'Fetch 请求失败');
            }
            if (error instanceof DOMException && error.name === 'AbortError') {
                throw new Error('DeepSeek Fetch API 超时');
            }
            throw error;
        }
        finally {
            clearTimeout(timer);
        }
    }
}
//# sourceMappingURL=DeepSeekClient.js.map