export class SolrIndexWriter {
    baseUrl;
    timeoutMs;
    fieldCache = new Map();
    constructor(baseUrl, timeoutMs = 30_000) {
        this.baseUrl = baseUrl;
        this.timeoutMs = timeoutMs;
    }
    async allowedFields(core) {
        const cached = this.fieldCache.get(core);
        if (cached)
            return cached;
        const response = await fetch(this.coreUrl(core, '/schema/fields?wt=json'), {
            signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!response.ok) {
            throw new Error(`Solr Core ${core} schema 读取失败：HTTP ${response.status}`);
        }
        const body = (await response.json());
        const fields = new Set((body.fields ?? []).map((field) => field.name).filter((name) => Boolean(name)));
        this.fieldCache.set(core, fields);
        return fields;
    }
    coreUrl(core, path) {
        return `${this.baseUrl}/${encodeURIComponent(core)}${path}`;
    }
    async post(core, path, body) {
        const response = await fetch(this.coreUrl(core, path), {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                accept: 'application/json',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`Solr ${core} 写入失败 HTTP ${response.status}: ${text.slice(0, 500)}`);
        }
        return response;
    }
    async fieldNames(core) {
        return [...(await this.allowedFields(core))];
    }
    async ping(core) {
        const response = await fetch(this.coreUrl(core, '/select?q=*:*&rows=0&wt=json'), {
            signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!response.ok) {
            throw new Error(`Solr Core ${core} 不可用：HTTP ${response.status}`);
        }
    }
    async upsert(core, docs) {
        if (docs.length === 0)
            return { count: 0, elapsedMs: 0 };
        const started = Date.now();
        const allowed = await this.allowedFields(core);
        const filtered = docs.map((doc) => {
            const entries = Object.entries(doc).filter(([key]) => allowed.has(key));
            if (!allowed.has('id'))
                throw new Error(`Solr Core ${core} 缺少 id 字段`);
            return Object.fromEntries(entries);
        });
        await this.post(core, '/update?commit=false&wt=json', filtered);
        return { count: docs.length, elapsedMs: Date.now() - started };
    }
    async delete(core, ids) {
        if (ids.length === 0)
            return { count: 0, elapsedMs: 0 };
        const started = Date.now();
        const xmlIds = ids
            .map((id) => `<id>${id.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</id>`)
            .join('');
        const response = await fetch(this.coreUrl(core, '/update?commit=false&wt=json'), {
            method: 'POST',
            headers: {
                'content-type': 'text/xml; charset=utf-8',
                accept: 'application/json',
            },
            body: `<delete>${xmlIds}</delete>`,
            signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`Solr ${core} 删除失败 HTTP ${response.status}: ${text.slice(0, 500)}`);
        }
        return { count: ids.length, elapsedMs: Date.now() - started };
    }
    async commit(core) {
        await this.post(core, '/update?commit=true&wt=json', {});
    }
    async count(core) {
        const response = await fetch(this.coreUrl(core, '/select?q=*:*&rows=0&wt=json'), {
            signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!response.ok) {
            throw new Error(`Solr Core ${core} 查询失败：HTTP ${response.status}`);
        }
        const body = (await response.json());
        return body.response?.numFound ?? 0;
    }
}
//# sourceMappingURL=SolrIndexWriter.js.map