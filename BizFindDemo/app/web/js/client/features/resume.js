import { fetchDetail } from '../api.js';
import { listUnfinished } from '../storage/readingStore.js';
function collect() {
    return listUnfinished(3).map(({ docId, record }) => ({
        docId,
        title: record.title ?? '',
        para: record.para ?? 1,
        ratio: record.ratio ?? 0,
        at: record.at ?? new Date().toISOString(),
    }));
}
function daysAgo(at) {
    const days = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 86_400_000));
    if (days <= 0)
        return '今天';
    return `${days} 天前`;
}
export function initResumeDock() {
    const dock = document.querySelector('[data-resume-dock]');
    const toggle = document.querySelector('[data-resume-toggle]');
    const panel = document.querySelector('[data-resume-panel]');
    const list = document.querySelector('[data-resume-list]');
    if (!dock || !toggle || !panel || !list)
        return;
    const items = collect();
    if (items.length === 0)
        return;
    const setOpen = (open) => {
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        panel.hidden = !open;
    };
    setOpen(false);
    for (const item of items) {
        const li = document.createElement('li');
        li.className = 'home-resume__item';
        const link = document.createElement('a');
        link.className = 'home-resume__name';
        link.href = `#/doc/${encodeURIComponent(item.docId)}?p=${item.para}`;
        link.textContent = item.title || item.docId;
        const meta = document.createElement('span');
        meta.className = 'home-resume__meta';
        meta.textContent = `${Math.round(item.ratio * 100)}% · ${daysAgo(item.at)}`;
        li.append(link, meta);
        list.append(li);
        // 老记录没有标题：补一次，拿到就替换
        if (!item.title) {
            void fetchDetail(item.docId, '')
                .then((detail) => {
                const title = detail.doc.title?.trim();
                if (title)
                    link.textContent = title;
            })
                .catch(() => {
                // 静默
            });
        }
    }
    dock.hidden = false;
    toggle.addEventListener('click', (event) => {
        event.stopPropagation();
        setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    document.addEventListener('mousedown', (event) => {
        const node = event.target;
        if (!node?.closest?.('[data-resume-dock]'))
            setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape')
            setOpen(false);
    });
}
