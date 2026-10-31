import { escapeAttr, escapeHtml } from '../dom.js';
import { formatDate, formatDateTime, formatNumber } from '../format.js';
import { icon } from '../icons.js';
import { buildDocHash, buildSearchHash } from '../router.js';
export function detailSkeleton() {
    return `<div class="detail-layout" aria-busy="true" aria-label="正在加载文档">
    <div class="detail-main">
      <div class="skeleton skeleton--line" style="width: 150px"></div>
      <div class="skeleton skeleton--title"></div>
      <div class="skeleton skeleton--line" style="width: 64%"></div>
      <div class="skeleton skeleton--paragraph"></div>
      <div class="skeleton skeleton--paragraph"></div>
      <div class="skeleton skeleton--paragraph"></div>
    </div>
    <aside class="detail-side"><div class="skeleton skeleton--side"></div></aside>
  </div>`;
}
function attachmentsHtml(detail) {
    if (detail.doc.attachments.length === 0)
        return '';
    return `<section class="doc__section">
    <h2>附件 <span class="doc__section-count">${detail.doc.attachments.length}</span></h2>
    <ul class="attachments">${detail.doc.attachments
        .map((file) => `<li class="attachment">
          <span class="attachment__badge">${escapeHtml(file.type.slice(0, 4).toUpperCase())}</span>
          <span class="attachment__body">
            <strong>${escapeHtml(file.name)}</strong>
            <span>${escapeHtml(file.type)} · ${escapeHtml(file.size)}</span>
          </span>
          <span class="attachment__demo">演示附件</span>
        </li>`)
        .join('')}</ul>
  </section>`;
}
function threadRepliesHtml(detail, q) {
    const thread = detail.thread;
    if (!thread)
        return '';
    const isReply = (thread.depth ?? 0) > 0;
    const rootLink = isReply
        ? `<a class="thread-root-link" href="${buildDocHash(thread.rootId, q)}">${icon('arrow-up', 14)} 回到主帖：${escapeHtml(thread.rootTitle)}</a>`
        : '';
    const replies = thread.replies.map((reply) => {
        const childCount = reply.directReplyCount ?? 0;
        return `<article class="thread-reply" id="reply-${escapeAttr(reply.id)}">
      <div class="thread-reply__meta">
        <span class="thread-reply__avatar">${escapeHtml((reply.author || '?').slice(0, 1))}</span>
        <strong>${escapeHtml(reply.author)}</strong>
        <span>${formatDate(reply.updatedAt)}</span>
        ${reply.depth ? `<span class="thread-reply__depth">第 ${reply.depth} 层</span>` : ''}
      </div>
      ${reply.snippetHtml ? `<p class="thread-reply__snippet">${reply.snippetHtml}</p>` : '<p class="thread-reply__snippet">（无正文）</p>'}
      ${childCount > 0
            ? `<div class="thread-reply__actions">
              <button class="text-btn" type="button"
                data-thread-open
                data-root-id="${escapeAttr(thread.rootId)}"
                data-parent-id="${escapeAttr(reply.id)}"
                data-reply-title="${escapeAttr(reply.title)}">
                ${icon('message', 14)} 查看该回复下的 ${childCount} 条后续
              </button>
            </div>`
            : ''}
    </article>`;
    });
    return `<section class="doc__section thread-section">
    ${rootLink}
    <div class="thread-section__head">
      <div>
        <span class="thread-section__eyebrow">讨论脉络</span>
        <h2>第一级回贴 <span class="doc__section-count">${thread.replies.length}</span></h2>
        <p>主帖之下的直接回复；展开任一条查看其完整分支。</p>
      </div>
      <span class="thread-section__mark">${icon('message', 18)}</span>
    </div>
    ${thread.replies.length > 0
        ? `<div class="thread-replies">${replies.join('')}</div>`
        : '<p class="doc__empty">这条主帖还没有第一级回复。</p>'}
  </section>`;
}
function noteEntryHtml(note) {
    return `<article class="note-entry" data-note-entry>
    <div class="note-entry__content">${escapeHtml(note.content)}</div>
    <time class="note-entry__time" datetime="${escapeAttr(note.createdAt)}">${formatDateTime(note.createdAt)}</time>
  </article>`;
}
export function detailHtml(detail, q, backHref, backLabel = '返回检索结果', notes = [], canWrite = false) {
    const doc = detail.doc;
    const terms = detail.insight.terms;
    const hasUrl = Boolean(doc.url && doc.url !== '#');
    const hasDepartment = Boolean(doc.department);
    const annotationCount = notes.filter((note) => note.kind === 'annotation').length;
    const openQuestionCount = notes.filter((note) => note.kind === 'annotation' &&
        (note.markKind === 'question' || note.markKind === 'evidence') &&
        !note.resolvedAt).length;
    const summaryParts = [];
    if (annotationCount > 0)
        summaryParts.push(`${annotationCount} 条批注`);
    if (openQuestionCount > 0)
        summaryParts.push(`${openQuestionCount} 个没想通的问题`);
    const questionsLine = summaryParts.length > 0
        ? `<p class="doc__questions"><span>这篇有 ${summaryParts.join(' · ')}</span><button class="text-btn" type="button" data-jump-annotation>看第一条</button></p>`
        : '';
    const hasPopularity = doc.popularity > 0;
    const hasTags = detail.tagsHtml.length > 0;
    const regularNotes = notes.filter((note) => (note.kind ?? 'note') === 'note');
    const annotations = notes.filter((note) => note.kind === 'annotation');
    const annotationsJson = JSON.stringify(annotations).replace(/</g, '\\u003c');
    const loginReturn = encodeURIComponent(`/#/doc/${doc.id}`);
    const notePanel = `<section class="note-panel" data-note-panel data-note-doc-id="${escapeAttr(doc.id)}">
    <div class="note-panel__head">
      <div>
        <span class="note-panel__eyebrow">reading note</span>
        <h2>我的笔记</h2>
      </div>
      <span class="note-panel__status" data-note-status>${canWrite ? (regularNotes.length > 0 ? `已归档 ${regularNotes.length} 条` : '尚未记录') : '需登录'}</span>
    </div>
    ${canWrite
        ? `<div class="note-panel__archive" data-note-archive>
             ${regularNotes.length > 0
            ? regularNotes.map(noteEntryHtml).join('')
            : '<p class="note-panel__empty">还没有归档笔记，写下第一条感悟。</p>'}
           </div>
           <div class="note-panel__compose">
             <span class="note-panel__compose-label">写一条新的感悟</span>
             <textarea class="note-panel__input" data-note-input maxlength="20000"
               placeholder="读完这段，你想到了什么…"></textarea>
             <div class="note-panel__foot">
               <span data-note-hint>保存后归档，历史笔记只读</span>
               <button class="note-panel__save" type="button" data-note-save>保存笔记</button>
             </div>
           </div>`
        : `<div class="note-panel__login">
             ${icon('user', 15)}
             <span>登录后可以记录自己的笔记</span>
             <a href="/auth/login?returnTo=${loginReturn}">去登录</a>
           </div>`}
  </section>`;
    const paragraphs = detail.contentHtml.length > 0
        ? detail.contentHtml.map((paragraph, index) => `<p data-para="${index + 1}">${paragraph}</p>`).join('')
        : '<p class="doc__empty">该文档暂未录入正文，可查看附件或联系文档负责人。</p>';
    return `<div class="detail">
    <div class="detail-top">
      <a class="back-link" href="${backHref}">${icon('arrow-left', 16)} ${backLabel}</a>
      <span class="detail-top__hint">${q ? `检索词：${escapeHtml(q)}` : '文档详情'}</span>
    </div>

    <nav class="crumbs" aria-label="面包屑">
      <a href="#/">首页</a>${icon('chevron-right', 13)}
      <span>${escapeHtml(doc.source)}</span>${icon('chevron-right', 13)}
      <span class="crumbs__current">${escapeHtml(doc.category)}</span>
    </nav>

    <div class="detail-layout">
      <div class="doc-docks">
        <aside class="doc-dock" data-series-dock hidden>
          <button class="doc-dock__handle" type="button" data-series-toggle aria-expanded="false">系列</button>
          <div class="doc-dock__panel" data-series-panel hidden>
            <div class="dock-series" data-doc-series></div>
          </div>
        </aside>
      </div>
      <article class="doc">
        <svg class="annotation-connector-layer" data-annotation-connector-layer aria-hidden="true"></svg>
        <div class="annotation-float-layer" data-annotation-float-layer></div>
        <div class="doc__badges">
          <span class="badge badge--blue">${escapeHtml(doc.category)}</span>
          <span class="badge">${escapeHtml(doc.source)}</span>
        </div>
        <h1 class="doc__title">${detail.titleHtml}</h1>
        <p class="doc__summary">${detail.summaryHtml}</p>
        ${detail.notice
        ? `<div class="notice notice--compact">${icon('info', 15)}<div><p>${escapeHtml(detail.notice)}</p></div></div>`
        : ''}
        <div class="doc__meta">
          <span>${icon('user', 15)}${escapeHtml(doc.author)}</span>
          ${hasDepartment ? `<span>${icon('building', 15)}${escapeHtml(doc.department)}</span>` : ''}
          <span>${icon('calendar', 15)}${formatDate(doc.updatedAt)}</span>
          ${hasPopularity ? `<span>${icon('trend', 15)}${formatNumber(doc.popularity)} 次浏览</span>` : ''}
        </div>
        ${questionsLine}
        <div class="doc__actions">
          ${hasUrl
        ? `<a class="btn btn--primary" href="${escapeAttr(doc.url)}" target="_blank" rel="noopener noreferrer">打开原文 ${icon('external', 15)}</a>`
        : ''}
          <button class="btn btn--ghost" data-copy type="button">${icon('copy', 15)}复制链接</button>
          <button class="btn btn--ghost" data-status type="button">${icon('database', 15)}索引信息</button>
        </div>

        <hr class="doc__rule" />
        <div class="doc__content" data-reading-content data-reading-doc-id="${escapeAttr(doc.id)}">
          ${paragraphs}
          <div class="annotation-layer" data-annotation-layer></div>
        </div>
        <script type="application/json" data-reading-annotations>${annotationsJson}</script>
        ${threadRepliesHtml(detail, q)}
        ${attachmentsHtml(detail)}

        ${hasTags
        ? `<div class="doc__tags">
                <span class="doc__tags-label">${icon('hash', 14)}标签</span>
                ${detail.tagsHtml
            .map((tag, index) => `<a class="tag tag--link" href="${buildSearchHash({ q: detail.doc.tags[index] ?? '' })}">${tag}</a>`)
            .join('')}
              </div>`
        : ''}
      </article>

      <aside class="detail-side">
        ${notePanel}

        <section class="side-card side-card--related" data-related-card hidden>
          <h2 class="side-card__title">相关文档</h2>
          <div class="related-note" data-related-category></div>
          <div class="related-note" data-annotation-related></div>
        </section>

        <section class="side-card side-card--tip">
          <h2 class="side-card__title">${icon('sparkle', 15)}检索提示</h2>
          ${terms.length > 0
        ? `<p>已高亮与当前检索相关的词：</p><div class="chips">${terms
            .slice(0, 6)
            .map((term) => `<span class="chip chip--static">${escapeHtml(term)}</span>`)
            .join('')}</div>`
        : '<p>从检索结果进入详情页，可自动高亮命中的标题、摘要与正文段落。</p>'}
          ${q ? `<a class="text-btn" href="${buildSearchHash({ q })}">在结果中查看全部匹配 ${icon('arrow-right', 14)}</a>` : ''}
        </section>
      </aside>
    </div>

    <button class="annotation-add" type="button" data-annotation-add hidden>添加批注</button>
    <div class="annotation-composer" data-annotation-composer hidden>
      <div class="annotation-composer__head">写批注</div>
      <div class="annotation-composer__quote" data-annotation-quote></div>
      <textarea data-annotation-input maxlength="4000" placeholder="写下你对这段话的理解…"></textarea>
      <div class="annotation-composer__foot">
        <span data-annotation-status></span>
        <button class="text-btn" type="button" data-annotation-cancel>取消</button>
        <button class="btn btn--primary" type="button" data-annotation-save>保存批注</button>
      </div>
    </div>
  </div>`;
}
