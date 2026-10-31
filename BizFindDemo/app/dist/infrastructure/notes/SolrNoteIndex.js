function escapeQuery(value) {
    return value.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, '\\$1');
}
function quote(value) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
/**
 * 个人笔记的独立 Solr core。
 * 所有查询强制带 userSub 过滤，不触碰 wxmang 公共索引。
 */
export class SolrNoteIndex {
    core;
    timeoutMs;
    baseUrl;
    constructor(solrBaseUrl, core, timeoutMs = 5000) {
        this.core = core;
        this.timeoutMs = timeoutMs;
        this.baseUrl = `${solrBaseUrl.replace(/\/+$/, '')}/${encodeURIComponent(core)}`;
    }
    async request(path, init) {
        const response = await fetch(`${this.baseUrl}${path}`, {
            ...init,
            signal: AbortSignal.timeout(this.timeoutMs),
            headers: {
                accept: 'application/json',
                ...(init?.headers ?? {}),
            },
        });
        const text = await response.text();
        let body = null;
        try {
            body = text ? JSON.parse(text) : null;
        }
        catch {
            body = text;
        }
        if (!response.ok) {
            const message = body && typeof body === 'object' && 'error' in body
                ? JSON.stringify(body.error)
                : `笔记索引请求失败（HTTP ${response.status}）`;
            throw new Error(message);
        }
        return body;
    }
    async index(userId, note) {
        await this.request('/update?commit=true', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify([
                {
                    id: note.id,
                    userSub: userId,
                    docId: note.docId,
                    kind: note.kind ?? 'note',
                    content: note.content,
                    startOffset: note.startOffset,
                    endOffset: note.endOffset,
                    quote: note.quote,
                    paragraphIndex: note.paragraphIndex,
                    createdAt: note.createdAt,
                    updatedAt: note.updatedAt,
                },
            ]),
        });
    }
    async syncAll(notes) {
        if (notes.length === 0)
            return;
        await this.request('/update?commit=true', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(notes.map((note) => ({
                id: note.id,
                userSub: note.userId,
                docId: note.docId,
                kind: note.kind ?? 'note',
                content: note.content,
                startOffset: note.startOffset,
                endOffset: note.endOffset,
                quote: note.quote,
                paragraphIndex: note.paragraphIndex,
                createdAt: note.createdAt,
                updatedAt: note.updatedAt,
            }))),
        });
    }
    async remove(noteId) {
        await this.request('/update?commit=true', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ delete: { id: noteId } }),
        });
    }
    async search(userId, query, limit) {
        const q = query.trim()
            ? `content:${escapeQuery(query.trim())}`
            : '*:*';
        const params = new URLSearchParams({
            q,
            fq: `userSub:${quote(userId)}`,
            fl: 'id,docId,kind,content,startOffset,endOffset,quote,paragraphIndex,createdAt,updatedAt',
            rows: String(Math.min(100, Math.max(1, limit))),
            sort: 'updatedAt desc',
            wt: 'json',
        });
        const body = (await this.request(`/select?${params.toString()}`));
        const docs = body.response?.docs ?? [];
        return {
            total: Number(body.response?.numFound ?? docs.length),
            notes: docs
                .filter((doc) => typeof doc.id === 'string' && typeof doc.docId === 'string')
                .map((doc) => ({
                id: doc.id,
                docId: doc.docId,
                kind: doc.kind === 'annotation' ? 'annotation' : 'note',
                content: String(doc.content ?? ''),
                startOffset: typeof doc.startOffset === 'number' ? doc.startOffset : undefined,
                endOffset: typeof doc.endOffset === 'number' ? doc.endOffset : undefined,
                quote: typeof doc.quote === 'string' ? doc.quote : undefined,
                paragraphIndex: typeof doc.paragraphIndex === 'number' ? doc.paragraphIndex : undefined,
                createdAt: doc.createdAt ?? '',
                updatedAt: doc.updatedAt ?? doc.createdAt ?? '',
            })),
        };
    }
}
//# sourceMappingURL=SolrNoteIndex.js.map