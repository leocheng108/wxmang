const DAY_MS = 86_400_000;
const RETENTION_DAYS = 365;
function formatDay(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}
function addDays(day, amount) {
    return new Date(new Date(`${day}T00:00:00Z`).getTime() + amount * DAY_MS)
        .toISOString()
        .slice(0, 10);
}
function isDay(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
function emptyOperation() {
    return {
        calls: 0,
        success: 0,
        empty: 0,
        failure: 0,
        cacheHits: 0,
        billable: 0,
        costYuan: 0,
    };
}
function applyRow(target, row) {
    if (row.outcome === 'cache_hit') {
        target.cacheHits += row.count;
        return;
    }
    target.calls += row.count;
    if (row.outcome === 'success') {
        target.success += row.count;
        target.billable += row.count;
    }
    else if (row.outcome === 'empty') {
        target.empty += row.count;
    }
    else {
        target.failure += row.count;
    }
    target.costYuan += row.costYuan;
}
/**
 * 外部 API 用量与参考费用统计。只统计 Search/Fetch 调用和缓存命中。
 */
export class ExternalUsageApplicationService {
    store;
    constructor(store) {
        this.store = store;
    }
    async summary(fromInput, toInput) {
        const today = formatDay();
        const validFrom = fromInput && isDay(fromInput) ? fromInput : addDays(today, -29);
        const validTo = toInput && isDay(toInput) ? toInput : today;
        const fromDay = validFrom <= validTo ? validFrom : validTo;
        const toDay = validFrom <= validTo ? validTo : validFrom;
        const rows = await this.store.daily(fromDay, toDay);
        const search = emptyOperation();
        const fetch = emptyOperation();
        const byDate = new Map();
        for (let cursor = fromDay; cursor <= toDay; cursor = addDays(cursor, 1)) {
            byDate.set(cursor, {
                date: cursor,
                searchCalls: 0,
                fetchCalls: 0,
                cacheHits: 0,
                costYuan: 0,
            });
        }
        for (const row of rows) {
            if (row.operation === 'search')
                applyRow(search, row);
            else
                applyRow(fetch, row);
            const point = byDate.get(row.date);
            if (point) {
                if (row.outcome !== 'cache_hit') {
                    if (row.operation === 'search')
                        point.searchCalls += row.count;
                    else
                        point.fetchCalls += row.count;
                }
                else {
                    point.cacheHits += row.count;
                }
                point.costYuan += row.costYuan;
            }
        }
        const series = [...byDate.values()];
        return {
            fromDay,
            toDay,
            totalCostYuan: search.costYuan + fetch.costYuan,
            search,
            fetch,
            cacheHits: search.cacheHits + fetch.cacheHits,
            series,
            generatedAt: new Date().toISOString(),
        };
    }
    async purge() {
        return this.store.purge(addDays(formatDay(), -RETENTION_DAYS));
    }
}
//# sourceMappingURL=ExternalUsageApplicationService.js.map