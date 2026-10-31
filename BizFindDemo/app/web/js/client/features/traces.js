import { readFinishedAt } from './readingPosition.js';
import { getDoc } from '../storage/readingStore.js';
import { fetchNoteTraces } from '../api.js';
/**
 * 阅读痕迹：在检索结果与笔记列表上标出「读到多少 / 批过几条」。
 * 全是记录，没有推断；没有痕迹就不显示任何东西。
 */
export function initTraces() {
    const nodes = [...document.querySelectorAll('[data-trace-id]')];
    if (nodes.length === 0)
        return;
    const ids = [...new Set(nodes.map((node) => node.dataset.traceId ?? '').filter(Boolean))];
    if (ids.length === 0)
        return;
    const chips = new Map();
    const render = (id, trace) => {
        const record = getDoc(id);
        const percent = Number.isFinite(record?.ratio) ? Math.round(record.ratio * 100) : null;
        const total = Number.isFinite(record?.total) ? record.total : 0;
        const para = Number.isFinite(record?.para) ? record.para : 0;
        const finished = Boolean(readFinishedAt(id));
        const count = trace?.count ?? 0;
        if (!percent && !finished && count === 0)
            return;
        let chip = chips.get(id);
        if (!chip) {
            const host = nodes.find((node) => node.dataset.traceId === id);
            if (!host)
                return;
            const target = host.querySelector('.result__meta, .note-card__foot') ?? host;
            chip = document.createElement('span');
            chip.className = 'trace-chip';
            target.insertBefore(chip, target.querySelector('.result__cta'));
            chips.set(id, chip);
        }
        const parts = [];
        const hints = [];
        if (finished) {
            parts.push('✓');
            hints.push('已读完');
        }
        else if (percent) {
            if (para > 0 && total > 0) {
                parts.push(`${para}/${total}`);
                hints.push(`读到第 ${para} 段（共 ${total} 段）`);
            }
            else {
                parts.push(`${percent}%`);
                hints.push(`读到 ${percent}%`);
            }
        }
        if (count > 0) {
            parts.push(`●${count}`);
            hints.push(`批过 ${count} 处`);
        }
        chip.textContent = parts.join(' · ');
        chip.title = hints.join('，');
    };
    for (const id of ids)
        render(id, undefined);
    void fetchNoteTraces(ids)
        .then((result) => {
        for (const id of ids)
            render(id, result.traces?.[id]);
    })
        .catch(() => {
        // 静默：拿不到批注数就只显示本地进度
    });
}
