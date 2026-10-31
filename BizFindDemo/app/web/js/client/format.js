export function formatDate(value) {
    if (!value)
        return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return '—';
    return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    })
        .format(date)
        .replace(/\//g, '-');
}
export function formatDateTime(value) {
    if (!value)
        return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return '—';
    return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
        .format(date)
        .replace(/\//g, '-');
}
export function formatNumber(value) {
    if (!Number.isFinite(value))
        return '0';
    return new Intl.NumberFormat('zh-CN').format(value);
}
export function formatTook(milliseconds) {
    if (milliseconds < 1)
        return '不到 0.001 秒';
    return `${(milliseconds / 1000).toFixed(3)} 秒`;
}
export function todayIso() {
    return new Date().toISOString().slice(0, 10);
}
