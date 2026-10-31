import { fetchDocSeries } from '../api.js';
import { escapeHtml } from '../dom.js';
/**
 * 系列目录：列出整个系列的全部篇目，标出当前这篇，可以任意跳。
 * 读者不一定是按顺序读的，所以给清单而不是只给上一篇/下一篇。
 */
export function initDocSeries() {
    const container = document.querySelector('[data-doc-series]');
    const dock = document.querySelector('[data-series-dock]');
    const toggle = document.querySelector('[data-series-toggle]');
    const panel = document.querySelector('[data-series-panel]');
    const content = document.querySelector('[data-reading-content]');
    const docId = content?.dataset.readingDocId ?? '';
    if (!container || !docId)
        return;
    const render = (series) => {
        const entries = series.items ?? [];
        if (entries.length < 2)
            return;
        const rows = entries
            .map((entry) => {
            const number = entry.sub > 0 ? `${entry.index}.${entry.sub}` : String(entry.index);
            const label = entry.title.replace(/^[【（(][^】）)]*[】）)]\s*/, '');
            if (entry.current) {
                return `<li class="dock-series__item is-current"><span class="dock-series__no">${number}</span><span class="dock-series__name">${escapeHtml(label)}</span></li>`;
            }
            return `<li class="dock-series__item"><span class="dock-series__no">${number}</span><a class="dock-series__name" href="#/doc/${encodeURIComponent(entry.id)}">${escapeHtml(label)}</a></li>`;
        })
            .join('');
        container.innerHTML = `<span class="dock-series__label">系列「${escapeHtml(series.prefix ?? '')}」· 共 ${entries.length} 篇</span>
      <ol class="dock-series__list">${rows}</ol>`;
        container.hidden = false;
        if (dock)
            dock.hidden = false;
        if (!toggle || !panel)
            return;
        const setOpen = (open) => {
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            panel.hidden = !open;
        };
        setOpen(false);
        toggle.addEventListener('click', (event) => {
            event.stopPropagation();
            const open = toggle.getAttribute('aria-expanded') !== 'true';
            setOpen(open);
            if (open) {
                panel.querySelector('.is-current')?.scrollIntoView({ block: 'nearest' });
            }
        });
        document.addEventListener('mousedown', (event) => {
            const node = event.target;
            if (!node?.closest?.('[data-series-dock]'))
                setOpen(false);
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape')
                setOpen(false);
        });
    };
    void fetchDocSeries(docId)
        .then((series) => render(series))
        .catch(() => {
        // 静默：没有系列信息不影响阅读
    });
}
