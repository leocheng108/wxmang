import { escapeHtml } from '../dom.js';
import { formatDateTime, formatNumber } from '../format.js';
import { icon } from '../icons.js';
import { buildDocHash, buildNotesHash } from '../router.js';
export function notesSkeleton() {
    return `<div class="notes-page" aria-busy="true" aria-label="正在加载我的笔记">
    <div class="skeleton skeleton--line" style="width: 180px"></div>
    <div class="skeleton skeleton--title"></div>
    <div class="skeleton skeleton--card"></div>
    <div class="skeleton skeleton--card"></div>
  </div>`;
}
export function notesHtml(data, q) {
    const notes = data.notes;
    return `<div class="notes-page">
    <header class="notes-head">
      <div>
        <span class="notes-eyebrow">personal archive · solr notes</span>
        <h1>我的笔记</h1>
        <p>按关键词检索自己写过的阅读感悟，再回到原帖继续阅读。</p>
      </div>
      <div class="notes-count"><strong>${formatNumber(data.total)}</strong><span>条笔记</span></div>
    </header>

    <div class="notes-body">
      <div class="notes-main">
    <form class="notes-search" data-notes-search>
      <span class="notes-search__icon">${icon('search', 18)}</span>
      <input name="q" value="${escapeHtml(q)}" placeholder="搜索我的笔记…" autocomplete="off" />
      <button class="btn btn--primary" type="submit">检索</button>
      ${q ? `<a class="text-btn" href="${buildNotesHash()}">清除</a>` : ''}
      <div class="notes-suggest" data-notes-suggest hidden></div>
    </form>

    <div class="notes-list">
      ${notes.length > 0
        ? notes
            .map((note) => `<article class="note-card" data-trace-id="${escapeHtml(note.docId)}">
                  <div class="note-card__kind">${note.kind === 'annotation' ? '段落批注' : '阅读笔记'}</div>
                  <div class="note-card__content">${escapeHtml(note.content)}</div>
                  <div class="note-card__foot">
                    <time datetime="${escapeHtml(note.createdAt)}">${formatDateTime(note.createdAt)}</time>
                    <span class="note-card__actions">${note.kind === 'annotation' && note.quote ? `<span class="note-card__quote">“${escapeHtml(note.quote)}”</span>` : ''}<a class="text-btn" href="${buildDocHash(note.docId, q)}">回到原帖 ${icon('arrow-right', 13)}</a></span>
                  </div>
                </article>`)
            .join('')
        : `<div class="notes-empty">
              ${icon('search', 24)}
              <h2>${q ? '没有匹配的笔记' : '还没有笔记'}</h2>
              <p>${q ? '换一个关键词试试。' : '打开一篇帖子，在右侧写下第一条阅读感悟。'}</p>
            </div>`}
    </div>

    <footer class="notes-foot">由独立 Solr <code>notes</code> core 提供检索，只返回当前用户自己的笔记。</footer>
      </div>
      <aside class="notes-side">
        <div class="notes-questions" data-questions-panel></div>
      </aside>
    </div>
  </div>`;
}
