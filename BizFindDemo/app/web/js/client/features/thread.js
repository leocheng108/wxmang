import { fetchDetail, fetchThreadReplies } from '../api.js';
import { escapeHtml } from '../dom.js';
import { formatDate } from '../format.js';
import { icon } from '../icons.js';
import { getActiveCore, parseRoute } from '../router.js';
/**
 * 讨论树弹窗：懒建 DOM、加载父帖与后续回复、关闭时恢复滚动位置与焦点。
 * 只依赖检索接口与 DOM，不依赖页面状态。
 */
function ensureThreadModal() {
    let modal = document.getElementById('thread-modal');
    if (modal)
        return modal;
    modal = document.createElement('div');
    modal.id = 'thread-modal';
    modal.className = 'thread-modal';
    modal.hidden = true;
    modal.innerHTML = `<div class="thread-modal__backdrop" data-thread-close></div>
    <div class="thread-modal__panel" role="dialog" aria-modal="true" aria-labelledby="thread-modal-title">
      <div class="thread-modal__head">
        <div>
          <span class="thread-modal__eyebrow">回复分支</span>
          <h2 id="thread-modal-title">后续回复</h2>
        </div>
        <button class="thread-modal__close" type="button" data-thread-close aria-label="关闭">${icon('close', 18)}</button>
      </div>
      <div id="thread-modal-body" class="thread-modal__body"></div>
    </div>`;
    document.body.append(modal);
    modal.addEventListener('click', (event) => {
        const target = event.target;
        if (target.closest('[data-thread-close]'))
            closeThreadModal();
    });
    return modal;
}
export function closeThreadModal() {
    const modal = document.getElementById('thread-modal');
    if (!modal || modal.hidden || modal.classList.contains('is-closing'))
        return;
    modal.classList.remove('is-open');
    modal.classList.add('is-closing');
    window.setTimeout(() => {
        modal.hidden = true;
        modal.classList.remove('is-closing');
        document.body.classList.remove('thread-modal-open');
        const scrollY = Number(modal.dataset.returnScroll ?? '0');
        window.scrollTo(0, scrollY);
        const parentId = modal.dataset.returnParent ?? '';
        if (parentId) {
            const trigger = document.querySelector(`[data-thread-open][data-parent-id="${CSS.escape(parentId)}"]`);
            trigger?.focus({ preventScroll: true });
        }
    }, 180);
}
export async function openThreadModal(button) {
    const rootId = button.dataset.rootId ?? '';
    const parentId = button.dataset.parentId ?? '';
    const title = button.dataset.replyTitle ?? '后续回复';
    const modal = ensureThreadModal();
    const body = document.getElementById('thread-modal-body');
    const heading = document.getElementById('thread-modal-title');
    if (!body || !heading)
        return;
    modal.dataset.returnScroll = String(window.scrollY);
    modal.dataset.returnParent = parentId;
    const route = parseRoute();
    const q = route.name === 'detail' ? route.q : '';
    heading.textContent = title;
    body.innerHTML = '<p class="thread-modal__empty">正在加载后续回复…</p>';
    document.body.classList.add('thread-modal-open');
    modal.hidden = false;
    modal.classList.remove('is-closing');
    requestAnimationFrame(() => modal.classList.add('is-open'));
    modal.querySelector('.thread-modal__close')?.focus({ preventScroll: true });
    try {
        const [result, parentDetail] = await Promise.all([
            fetchThreadReplies(rootId, parentId, q, getActiveCore()),
            fetchDetail(parentId, q, getActiveCore()).catch(() => null),
        ]);
        const parentHtml = parentDetail
            ? `<article class="thread-descendant thread-descendant--parent">
          <div class="thread-descendant__meta">
            <strong>${escapeHtml(parentDetail.doc.author)}</strong>
            <span>${parentDetail.doc.updatedAt ? formatDate(parentDetail.doc.updatedAt) : ''}</span>
          </div>
          <div class="thread-parent__content">${parentDetail.contentHtml.length > 0
                ? parentDetail.contentHtml.map((paragraph) => `<p>${paragraph}</p>`).join('')
                : `<p>${parentDetail.summaryHtml || '（无正文）'}</p>`}</div>
        </article>`
            : '';
        if (result.items.length === 0) {
            body.innerHTML = `${parentHtml}<p class="thread-modal__empty">这条回复下没有后续内容。</p>`;
            return;
        }
        body.innerHTML = `${parentHtml}${result.items
            .map((item) => `<article class="thread-descendant" style="--depth:${Math.max(0, (item.depth ?? 0) - 1)}">
          <div class="thread-descendant__meta">
            <strong>${escapeHtml(item.author)}</strong>
            <span>${item.updatedAt ? formatDate(item.updatedAt) : ''}</span>
            ${item.depth ? `<span>第 ${item.depth} 层</span>` : ''}
          </div>
          ${item.snippetHtml ? `<p>${item.snippetHtml}</p>` : '<p>（无正文）</p>'}
        </article>`)
            .join('')}`;
    }
    catch (error) {
        body.innerHTML = `<p class="thread-modal__empty">${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
    }
}
