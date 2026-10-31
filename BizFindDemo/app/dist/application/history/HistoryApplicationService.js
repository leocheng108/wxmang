import { randomUUID } from 'node:crypto';
const DAY_MS = 86_400_000;
const RETENTION_DAYS = 180;
export function formatSearchDay(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}
function addDays(day, amount) {
    const base = new Date(`${day}T00:00:00Z`).getTime();
    return new Date(base + amount * DAY_MS).toISOString().slice(0, 10);
}
function isDay(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
function normalizeKeyword(keyword) {
    return keyword.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}
function iterationDays(fromDay, toDay) {
    const days = [];
    for (let cursor = fromDay; cursor <= toDay && days.length < 366; cursor = addDays(cursor, 1)) {
        days.push(cursor);
    }
    return days;
}
/**
 * 检索历史用例：记录、最近搜索、分析聚合和保留期清理。
 * 只记录真正提交的检索；不记录输入框的每次按键。
 */
export class HistoryApplicationService {
    store;
    constructor(store) {
        this.store = store;
    }
    async record(input) {
        const sessionId = input.sessionId.trim();
        const keyword = input.keyword.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 200);
        if (!sessionId || !keyword)
            throw new Error('sessionId 和 keyword 不能为空');
        if (sessionId.length > 80)
            throw new Error('sessionId 过长');
        if (!/^[A-Za-z0-9_-]+$/.test(sessionId))
            throw new Error('sessionId 格式非法');
        const event = {
            eventId: randomUUID(),
            sessionId,
            keyword,
            keywordNorm: normalizeKeyword(keyword),
            core: input.core.trim().slice(0, 40) || 'wxmang',
            searchDay: formatSearchDay(),
            createdAt: new Date().toISOString(),
            source: input.source?.trim().slice(0, 20) || 'submit',
        };
        await this.store.record(event);
    }
    async recent(sessionId, limit = 10) {
        const clean = sessionId.trim();
        if (!clean)
            return [];
        const sinceDay = addDays(formatSearchDay(), -RETENTION_DAYS);
        const items = await this.store.recent(clean, sinceDay, Math.max(1, Math.min(10, limit)));
        return items.filter((item) => item.keyword.trim().length > 0);
    }
    async hideRecent(sessionId, keyword) {
        const cleanSession = sessionId.trim();
        const cleanKeyword = keyword.normalize('NFKC').trim().replace(/\s+/g, ' ');
        if (!cleanSession || !cleanKeyword)
            throw new Error('sessionId 和 keyword 不能为空');
        if (cleanSession.length > 80)
            throw new Error('sessionId 过长');
        if (!/^[A-Za-z0-9_-]+$/.test(cleanSession))
            throw new Error('sessionId 格式非法');
        await this.store.hideRecent(cleanSession, normalizeKeyword(cleanKeyword));
    }
    async analytics(input) {
        const today = formatSearchDay();
        const fromDay = isDay(input.fromDay ?? '') ? input.fromDay : addDays(today, -29);
        const toDay = isDay(input.toDay ?? '') ? input.toDay : today;
        const query = {
            fromDay: fromDay <= toDay ? fromDay : toDay,
            toDay: fromDay <= toDay ? toDay : fromDay,
            core: input.core?.trim() || undefined,
            keyword: input.keyword?.trim() || undefined,
            excludeCores: input.excludeCores?.map((item) => item.trim()).filter(Boolean),
        };
        const [daily, topKeywords, byCore, total] = await Promise.all([
            this.store.daily(query),
            this.store.topKeywords(query, 20),
            this.store.byCore(query),
            this.store.total(query),
        ]);
        const counts = new Map(daily.map((item) => [item.date, item.count]));
        const series = iterationDays(query.fromDay, query.toDay).map((date) => ({
            date,
            count: counts.get(date) ?? 0,
        }));
        return {
            total: total.total,
            sessions: total.sessions,
            series,
            topKeywords,
            byCore,
        };
    }
    async purge() {
        return this.store.purge(addDays(formatSearchDay(), -RETENTION_DAYS));
    }
    async purgeExpired() {
        await this.purge();
    }
    close() {
        this.store.close?.();
    }
}
//# sourceMappingURL=HistoryApplicationService.js.map