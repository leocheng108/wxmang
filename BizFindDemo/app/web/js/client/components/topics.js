import { escapeHtml } from '../dom.js';
import { formatDate, formatNumber } from '../format.js';
import { icon } from '../icons.js';
import { buildDocHash, buildTopicsHash } from '../router.js';
export function topicSkeleton() {
    return `<div class="topics-layout" aria-busy="true" aria-label="正在加载分类管理">
    <aside class="topics-side"><div class="skeleton skeleton--side"></div></aside>
    <section class="topics-main">
      <div class="skeleton skeleton--line" style="width: 240px"></div>
      <div class="skeleton skeleton--title"></div>
      <div class="skeleton skeleton--card"></div>
      <div class="skeleton skeleton--card"></div>
    </section>
  </div>`;
}
const TOPIC_PINS_KEY = 'bizfind:topic-pins';
function readStoredPins() {
    try {
        const raw = window.localStorage.getItem(TOPIC_PINS_KEY);
        if (!raw)
            return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed)
            ? parsed.filter((item) => typeof item === 'string')
            : null;
    }
    catch {
        return null;
    }
}
function defaultCommonIds(categories) {
    return categories
        .filter((category) => !category.parentId &&
        category.count > 0 &&
        !['综合杂谈', '待细分'].includes(category.name))
        .slice(0, 5)
        .map((category) => category.id);
}
export function pinnedCategoryIds(categories) {
    const stored = readStoredPins();
    const ids = stored ?? defaultCommonIds(categories);
    return ids.filter((id) => categories.some((category) => category.id === id));
}
export function togglePinnedCategory(id, fallbackIds = []) {
    try {
        const stored = readStoredPins() ?? fallbackIds;
        const next = stored.includes(id)
            ? stored.filter((item) => item !== id)
            : [...stored, id];
        window.localStorage.setItem(TOPIC_PINS_KEY, JSON.stringify(next));
    }
    catch {
        // localStorage 不可用时保持当前页面状态
    }
}
function categoryRow(route, category, active, pinned, matchesFilter, depth = 0, canEdit = false, filterText = category.name.toLowerCase()) {
    const href = buildTopicsHash({ q: route.q, category: category.id, page: 1 });
    const child = depth > 0;
    return `<div class="topic-category-row ${child ? 'topic-category-row--child' : ''} ${matchesFilter ? '' : 'is-filtered'}"
    data-topic-cat-row
    data-topic-cat-id="${escapeHtml(category.id)}"
    data-topic-cat-name="${escapeHtml(filterText)}">
    <a class="topic-category ${child ? 'topic-category--child' : ''} ${active ? 'is-active' : ''}" href="${href}">
      <span class="topic-category__name">${escapeHtml(category.name)}</span>
      <span class="topic-category__count">${formatNumber(category.count)}</span>
    </a>
    <span class="topic-actions">
    ${child
        ? ''
        : `<button class="topic-pin ${pinned ? 'is-pinned' : ''}" type="button"
            data-topic-pin="${escapeHtml(category.id)}"
            title="${pinned ? '取消置顶' : '置顶到常用'}"
            aria-label="${pinned ? '取消置顶' : '置顶到常用'}">${pinned ? '★' : '☆'}</button>`}
    ${canEdit && !child
        ? `<button class="topic-add-child" type="button"
            data-topic-add-child="${escapeHtml(category.id)}"
            data-parent-name="${escapeHtml(category.name)}"
            title="新增二级分类" aria-label="在${escapeHtml(category.name)}下新增二级分类">＋</button>`
        : ''}
    ${canEdit
        ? `<button class="topic-delete" type="button"
            data-topic-delete="${escapeHtml(category.id)}"
            data-topic-name="${escapeHtml(category.name)}"
            data-topic-count="${category.count}"
            data-topic-child="${child ? '1' : '0'}"
            title="删除分类" aria-label="删除分类${escapeHtml(category.name)}">×</button>`
        : ''}
    </span>
  </div>`;
}
function categoryGroup(title, categories, route, pinnedIds, filter, canEdit, open = false) {
    const roots = categories.filter((category) => !category.parentId);
    const childrenByParent = new Map();
    for (const category of categories) {
        if (!category.parentId)
            continue;
        const children = childrenByParent.get(category.parentId) ?? [];
        children.push(category);
        childrenByParent.set(category.parentId, children);
    }
    const query = filter.trim().toLowerCase();
    const rows = roots.map((category) => {
        const children = childrenByParent.get(category.id) ?? [];
        const rootText = [category.name, ...children.map((child) => child.name)]
            .join(' ')
            .toLowerCase();
        const rootMatches = !query || rootText.includes(query);
        const rootRow = categoryRow(route, category, category.id === route.category, pinnedIds.includes(category.id), rootMatches, 0, canEdit, rootText);
        const childRows = children
            .map((child) => {
            const childText = `${category.name} ${child.name}`.toLowerCase();
            return categoryRow(route, child, child.id === route.category, false, !query || childText.includes(query), 1, canEdit, childText);
        })
            .join('');
        return rootRow + childRows;
    });
    const hasMatch = !query ||
        roots.some((category) => [category.name, ...(childrenByParent.get(category.id) ?? []).map((child) => child.name)]
            .join(' ')
            .toLowerCase()
            .includes(query));
    const hasActive = categories.some((category) => category.id === route.category);
    return `<details class="topic-group" data-topic-group ${open || Boolean(query) || hasActive ? 'open' : ''} ${hasMatch ? '' : 'hidden'}>
    <summary>
      <span>${escapeHtml(title)}</span>
      <span class="topic-group__count">${roots.length}</span>
      ${icon('chevron-down', 13)}
    </summary>
    <div class="topic-group__items">
      ${rows.join('') || '<span class="topic-category-empty">暂无分类</span>'}
    </div>
  </details>`;
}
function resultHtml(hit, q) {
    return `<article class="topic-result" data-topic-result="${escapeHtml(hit.id)}">
    <label class="topic-result__check" title="选择这篇主帖">
      <input type="checkbox" data-topic-select value="${escapeHtml(hit.id)}" />
      <span></span>
    </label>
    <div class="topic-result__body">
      <div class="topic-result__top">
        <span class="topic-result__kind">主帖</span>
        <span class="topic-result__count">${formatNumber(hit.directReplyCount ?? 0)} 条直接回复</span>
        <span class="topic-result__date">${formatDate(hit.updatedAt)}</span>
      </div>
      <h2 class="topic-result__title">
        <a data-topic-open href="${buildDocHash(hit.id, q)}">${hit.titleHtml}</a>
      </h2>
      ${hit.snippetHtml ? `<p class="topic-result__snippet">${hit.snippetHtml}</p>` : ''}
      <div class="topic-result__meta">
        <span>${escapeHtml(hit.author)}</span>
        ${(hit.tags ?? []).slice(0, 3).map((tag) => `<span class="tag tag--sm">${escapeHtml(tag)}</span>`).join('')}
      </div>
    </div>
  </article>`;
}
function categoryCombobox(categories) {
    const childrenByParent = new Map();
    for (const category of categories) {
        if (!category.parentId)
            continue;
        const children = childrenByParent.get(category.parentId) ?? [];
        children.push(category);
        childrenByParent.set(category.parentId, children);
    }
    const roots = categories.filter((category) => !category.parentId);
    const options = roots.flatMap((root) => [
        { category: root, depth: 0, search: root.name.toLowerCase() },
        ...(childrenByParent.get(root.id) ?? []).map((child) => ({
            category: child,
            depth: 1,
            search: `${root.name} ${child.name}`.toLowerCase(),
        })),
    ]);
    return `<div class="topic-combo" data-topic-combo>
    <button class="topic-combo__trigger" type="button" data-topic-combo-toggle
      aria-haspopup="listbox" aria-expanded="false">
      <span data-topic-combo-label>选择分类…</span>
      ${icon('chevron-down', 14)}
    </button>
    <input type="hidden" data-topic-category-select value="" />
    <div class="topic-combo__panel" data-topic-combo-panel hidden>
      <label class="topic-combo__search">
        ${icon('search', 14)}
        <input data-topic-combo-search type="search" placeholder="搜索分类…" autocomplete="off" />
      </label>
      <div class="topic-combo__list" role="listbox">
        ${options
        .map(({ category, depth, search }) => `<button class="topic-combo__option ${depth ? 'topic-combo__option--child' : ''}" type="button" role="option"
              data-topic-combo-option
              data-category-id="${escapeHtml(category.id)}"
              data-category-name="${escapeHtml(search)}">
              <span>${depth ? '↳ ' : ''}${escapeHtml(category.name)}</span>
              <span class="topic-combo__count">${formatNumber(category.count)}</span>
            </button>`)
        .join('')}
        <button class="topic-combo__option topic-combo__option--new" type="button" role="option"
          data-topic-combo-option data-category-id="__new__" data-category-name="__new__">
          <span>＋ 新建分类并归类</span>
        </button>
        <span class="topic-combo__empty" data-topic-combo-empty hidden>没有匹配分类</span>
      </div>
    </div>
  </div>`;
}
export function topicsHtml(data, route, canEdit, selectedCount, categoryFilter = '', expandAllGroups = false) {
    const { categories, search } = data;
    const active = categories.categories.find((item) => item.id === route.category);
    const title = active?.name ?? '全部主帖';
    const totalPages = Math.max(1, Math.ceil(search.total / search.pageSize));
    const pageHref = (page) => buildTopicsHash({ q: route.q, category: route.category, page });
    const pinnedIds = pinnedCategoryIds(categories.categories);
    const pinnedRoots = pinnedIds
        .map((id) => categories.categories.find((category) => category.id === id))
        .filter((category) => category !== undefined && !category.parentId);
    const pinnedChildren = categories.categories.filter((category) => Boolean(category.parentId) &&
        Boolean(category.parentId && pinnedIds.includes(category.parentId)));
    const pinned = [...pinnedRoots, ...pinnedChildren];
    const rest = categories.categories.filter((category) => !pinnedIds.includes(category.id) &&
        !(category.parentId && pinnedIds.includes(category.parentId)));
    return `<div class="topics-layout">
    <aside class="topics-side" aria-label="主题分类">
      <div class="topics-side__head">
        <span class="topics-side__eyebrow">wxmang 档案</span>
        <h2>主题分类</h2>
        <p>${formatNumber(categories.totalRoots)} 篇主帖</p>
      </div>
      <label class="topic-filter">
        ${icon('search', 15)}
        <input data-topic-category-filter type="search" value="${escapeHtml(categoryFilter)}"
          placeholder="搜索分类…" autocomplete="off" />
      </label>
      <nav class="topic-categories">
        <a class="topic-category ${!route.category ? 'is-active' : ''}"
          href="${buildTopicsHash({ q: route.q, page: 1 })}">
          <span class="topic-category__name">全部主帖</span>
          <span class="topic-category__count">${formatNumber(categories.totalRoots)}</span>
        </a>
        ${categories.uncategorizedRoots > 0
        ? `<span class="topic-category topic-category--muted">
                <span class="topic-category__name">未分类</span>
                <span class="topic-category__count">${formatNumber(categories.uncategorizedRoots)}</span>
              </span>`
        : ''}
        ${categoryGroup('常用', pinned, route, pinnedIds, categoryFilter, canEdit, true)}
        ${categoryGroup('全部分类', rest, route, pinnedIds, categoryFilter, canEdit, expandAllGroups)}
      </nav>
      <div class="topics-side__foot">
        <span>分类可多选归档 · ☆ 置顶到常用</span>
        ${canEdit ? `<button class="text-btn" type="button" data-topic-new>${icon('hash', 14)} 新建分类</button>` : ''}
      </div>
    </aside>

    <section class="topics-main">
      <header class="topics-head">
        <div>
          <span class="topics-head__eyebrow">分类管理 · 主帖归类</span>
          <h1>${escapeHtml(title)}</h1>
          <p>按分类查看主帖；勾选后可加入或移出分类，也可新建分类。</p>
        </div>
        <span class="topics-head__mark">${icon('message', 22)}</span>
      </header>

      <form class="topics-search" data-topic-search>
        <span class="topics-search__icon">${icon('search', 18)}</span>
        <input name="q" value="${escapeHtml(route.q)}" placeholder="在当前分类中检索主帖…" autocomplete="off" />
        <button class="btn btn--primary" type="submit">检索</button>
      </form>

      <div class="topics-toolbar">
        <div class="topics-toolbar__info">
          <strong>${formatNumber(search.total)}</strong> 篇主帖
          <span class="topics-toolbar__selected" data-topic-selected-count ${selectedCount > 0 ? '' : 'hidden'}>已选 ${selectedCount} 篇</span>
        </div>
        ${canEdit
        ? `<div class="topics-toolbar__assign">
                ${categoryCombobox(categories.categories)}
                <button class="btn btn--ghost" type="button" data-topic-assign ${selectedCount === 0 ? 'disabled' : ''}>
                  加入分类
                </button>
                ${route.category
            ? `<button class="btn btn--ghost topic-remove" type="button" data-topic-remove ${selectedCount === 0 ? 'disabled' : ''}>
                        移出当前分类
                      </button>`
            : ''}
              </div>`
        : '<span class="topics-toolbar__login">登录后可归类和新建分类</span>'}
      </div>

      <div class="topic-results">
        ${search.results.length > 0
        ? search.results.map((hit) => resultHtml(hit, route.q)).join('')
        : `<div class="topic-empty">
                ${icon('search', 24)}
                <h2>没有匹配的主帖</h2>
                <p>换一个关键词，或切换到“全部主帖”。</p>
              </div>`}
      </div>

      ${totalPages > 1
        ? `<nav class="topics-pagination" aria-label="主题分页">
              ${search.page > 1
            ? `<a class="page page--wide" href="${pageHref(search.page - 1)}">${icon('arrow-left', 15)}上一页</a>`
            : '<span class="page page--wide is-disabled">上一页</span>'}
              <span class="topics-pagination__status">第 ${search.page} / ${totalPages} 页</span>
              ${search.page < totalPages
            ? `<a class="page page--wide" href="${pageHref(search.page + 1)}">下一页${icon('arrow-right', 15)}</a>`
            : '<span class="page page--wide is-disabled">下一页</span>'}
            </nav>`
        : ''}
    </section>
  </div>`;
}
