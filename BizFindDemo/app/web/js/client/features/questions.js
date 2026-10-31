import { fetchQuestions, resolveQuestion } from '../api.js';
import { formatDateTime } from '../format.js';
import { escapeHtml } from '../dom.js';
/**
 * 「还在想的问题」：把疑问 / 依据型批注聚成一页待解决问题。
 * 阅读页不出现任何提示，这里只是回看的地方。
 */
export function initQuestionsPanel() {
    const panel = document.querySelector('[data-questions-panel]');
    if (!panel)
        return;
    let status = 'open';
    const render = (data) => {
        const items = data.items
            .map((item) => {
            const note = item.note;
            const quote = note.quote ? `<span class="question-item__quote">「${escapeHtml(note.quote)}」</span>` : '';
            return `<li class="question-item" data-question-id="${escapeHtml(note.id)}">
          ${quote}
          <p class="question-item__text">${escapeHtml(note.content)}</p>
          <div class="question-item__meta">
            <a class="question-item__doc" href="#/doc/${encodeURIComponent(note.docId)}">${escapeHtml(item.docTitle)}</a>
            <span>${formatDateTime(note.createdAt)}</span>
            <button class="text-btn" type="button" data-resolve="${escapeHtml(note.id)}">
              ${status === 'open' ? '想通了' : '重新打开'}
            </button>
          </div>
        </li>`;
        })
            .join('');
        panel.innerHTML = `<div class="questions-head">
        <h2>还在想的问题</h2>
        <div class="questions-tabs">
          <button type="button" class="questions-tab${status === 'open' ? ' is-active' : ''}" data-q-status="open">未解决 ${data.openCount}</button>
          <button type="button" class="questions-tab${status === 'resolved' ? ' is-active' : ''}" data-q-status="resolved">已想通 ${data.resolvedCount}</button>
        </div>
      </div>
      ${data.items.length > 0 ? `<ul class="questions-list">${items}</ul>` : `<p class="questions-empty">${status === 'open' ? '暂时没有悬着的问题。' : '还没有标为「想通了」的问题。'}</p>`}`;
    };
    const load = (next = status) => {
        status = next;
        void fetchQuestions(status, 50)
            .then((data) => render(data))
            .catch(() => {
            panel.innerHTML = '';
        });
    };
    panel.addEventListener('click', (event) => {
        const target = event.target;
        const tab = target?.closest('[data-q-status]');
        if (tab) {
            const next = tab.dataset.qStatus === 'resolved' ? 'resolved' : 'open';
            if (next !== status)
                load(next);
            return;
        }
        const resolveButton = target?.closest('[data-resolve]');
        if (resolveButton) {
            const id = resolveButton.dataset.resolve ?? '';
            const item = resolveButton.closest('[data-question-id]');
            resolveButton.setAttribute('disabled', 'true');
            void resolveQuestion(id, status === 'open')
                .then(() => {
                item?.remove();
                load(status);
            })
                .catch(() => {
                resolveButton.removeAttribute('disabled');
            });
        }
    });
    load('open');
}
