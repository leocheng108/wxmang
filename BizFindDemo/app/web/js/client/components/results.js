import { escapeHtml } from '../dom.js';
import { formatDate, formatNumber, formatTook } from '../format.js';
import { icon } from '../icons.js';
import { buildDocHash, buildSearchHash, toggleFacetHash } from '../router.js';
const SORT_TABS = [
    { key: 'relevance', label: '相关度', hint: '按相关性排序' },
    { key: 'date', label: '最新', hint: '按更新时间倒序' },
    { key: 'parentId', label: '父帖', hint: '按 parentId 字段升序' },
    { key: 'userName', label: '用户', hint: '按用户名升序' },
];
export function searchSkeleton() {
    const cards = Array.from({ length: 4 }, () => '<div class="skeleton skeleton--card"></div>').join('');
    return `<div class="results-layout" aria-busy="true" aria-label="正在检索">
    <section class="results-main">
      <div class="skeleton skeleton--line" style="width: 260px"></div>
      <div class="skeleton skeleton--insight"></div>
      <div class="skeleton skeleton--tabs"></div>
      ${cards}
    </section>
    <aside class="results-side">
      <div class="skeleton skeleton--side"></div>
      <div class="skeleton skeleton--side"></div>
    </aside>
  </div>`;
}
function backendBadge(backend) {
    if (backend === 'solr') {
        return `<span class="backend-badge is-solr">${icon('database', 13)} Solr 实时检索</span>`;
    }
    if (backend === 'external') {
        return `<span class="backend-badge is-external">${icon('external', 13)} DeepSeek 外部检索</span>`;
    }
    return `<span class="backend-badge is-mock">${icon('database', 13)} 内置演示索引</span>`;
}
function matchModeBadge(mode) {
    if (!mode)
        return '';
    const phrase = mode === 'phrase';
    return `<span class="match-mode ${phrase ? 'is-phrase' : 'is-tokenized'}"
    title="${phrase ? '完整短语命中，未进行分词扩展' : '完整短语未命中，已回退到分词检索'}">
    ${phrase ? '精确匹配' : '分词检索'}</span>`;
}
function insightHtml(response) {
    const { insight } = response;
    const terms = insight.terms.length > 0 ? insight.terms : [response.query];
    const synonymGroups = insight.synonyms.slice(0, 3);
    const fuzzyHits = insight.correctedQuery
        ? []
        : insight.fuzzy
            .filter((hit) => hit.term !== insight.originalQuery && hit.matched !== insight.correctedQuery)
            .slice(0, 2);
    const correction = insight.correctedQuery
        ? `<div class="insight__row">
        <span class="insight__label">纠正</span>
        <div class="insight__value">
          <span class="insight__strike">${escapeHtml(insight.originalQuery ?? '')}</span>
          ${icon('arrow-right', 13)}
          <strong>${escapeHtml(insight.correctedQuery)}</strong>
          ${insight.originalQuery
            ? `<a class="insight__minor" href="${buildSearchHash({ q: insight.originalQuery })}">仍搜原词</a>`
            : ''}
        </div>
      </div>`
        : '';
    const synonyms = synonymGroups.length
        ? `<div class="insight__row">
        <span class="insight__label">同义</span>
        <div class="insight__value insight__synonyms">${synonymGroups
            .map((group) => `<span class="syn"><code>${escapeHtml(group.term)}</code>${icon('arrow-right', 12)}${escapeHtml(group.expansions.slice(0, 3).join('、'))}</span>`)
            .join('')}</div>
      </div>`
        : '';
    const fuzzy = fuzzyHits.length
        ? `<div class="insight__row">
        <span class="insight__label">容错</span>
        <div class="insight__value">${fuzzyHits
            .map((hit) => `<span class="syn"><code>${escapeHtml(hit.term)}</code>${icon('arrow-right', 12)}${escapeHtml(hit.matched)}</span>`)
            .join('')}</div>
      </div>`
        : '';
    const notes = insight.notes.length
        ? `<details class="insight__why"><summary>匹配说明</summary><ul>${insight.notes
            .map((note) => `<li>${escapeHtml(note)}</li>`)
            .join('')}</ul></details>`
        : '';
    return `<section class="insight" aria-label="智能匹配说明">
    <div class="insight__head">
      <span class="insight__icon">${icon('sparkle', 18)}</span>
      <strong>智能匹配</strong>
      <span class="insight__badge">中文分词 · 同义词 · 容错</span>
    </div>
    <div class="insight__rows">
      <div class="insight__row">
        <span class="insight__label">理解</span>
        <div class="insight__value"><span class="chips">${terms
        .map((term) => `<span class="chip chip--static">${escapeHtml(term)}</span>`)
        .join('')}</span></div>
      </div>
      ${correction}${synonyms}${fuzzy}
    </div>
    ${notes}
  </section>`;
}
function activeFilters(route) {
    const filters = [];
    if (route.category)
        filters.push({ field: 'category', label: '分类', value: route.category });
    if (route.source)
        filters.push({ field: 'source', label: '来源', value: route.source });
    if (route.department)
        filters.push({ field: 'department', label: '部门', value: route.department });
    return filters;
}
function toolbarHtml(route, response) {
    const filters = activeFilters(route);
    const tabs = response.backend === 'external'
        ? SORT_TABS.filter((tab) => tab.key === 'relevance')
        : route.core === 'wuJun' || route.core === 'gameTheory'
            ? SORT_TABS.filter((tab) => tab.key === 'relevance' || tab.key === 'date')
            : SORT_TABS;
    const userFilter = route.userName
        ? `<a class="filter-chip" href="${buildSearchHash({ ...route, userName: undefined, page: 1 })}"
        title="取消用户筛选">用户：${escapeHtml(route.userName)}${icon('close', 13)}</a>`
        : '';
    return `<div class="results-toolbar">
    <nav class="sort-tabs" aria-label="排序方式">
      ${tabs.map((tab) => `<a class="sort-tab ${route.sort === tab.key ? 'is-active' : ''}"
          href="${buildSearchHash({ q: route.q, sort: tab.key, userName: route.userName, category: route.category, source: route.source, department: route.department })}"
          title="${tab.hint}" aria-label="${tab.hint}"
          ${route.sort === tab.key ? 'aria-current="page"' : ''}>${tab.label}</a>`).join('')}
    </nav>
    ${filters.length || route.userName
        ? `<div class="active-filters">${filters
            .map((filter) => `<a class="filter-chip" href="${toggleFacetHash(route, filter.field, filter.value)}"
                  title="取消筛选">${escapeHtml(filter.label)}：${escapeHtml(filter.value.replace(/\|+$/g, ''))}${icon('close', 13)}</a>`)
            .join('')}${userFilter}<a class="active-filters__clear" href="${buildSearchHash({ q: route.q })}">清除筛选</a></div>`
        : ''}
  </div>`;
}
function userFilterHtml(route, authors) {
    const selected = route.userName ?? '';
    const options = [...authors];
    if (selected && !options.some((author) => author.value === selected)) {
        options.unshift({ value: selected, count: 0 });
    }
    options.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'zh-CN'));
    return `<div class="author-filter">
    <label class="author-filter__label" for="author-filter">用户</label>
    <select id="author-filter" class="author-filter__select" data-user-filter>
      <option value="">全部用户</option>
      ${options
        .map((author) => `<option value="${escapeHtml(author.value)}" ${author.value === selected ? 'selected' : ''}>${escapeHtml(author.value)}${author.count > 0 ? `（${formatNumber(author.count)}）` : ''}</option>`)
        .join('')}
    </select>
    ${selected ? `<a class="author-filter__clear" href="${buildSearchHash({ ...route, userName: undefined, page: 1 })}">清除</a>` : ''}
  </div>`;
}
function matchClass(rate) {
    if (rate >= 70)
        return 'is-high';
    if (rate >= 40)
        return 'is-mid';
    return 'is-low';
}
function hitHtml(hit, index, query) {
    const external = hit.external === true;
    const href = buildDocHash(hit.id, query, undefined, external ? hit.url : undefined);
    const isRoot = hit.rootId !== undefined && (hit.depth === 0 || hit.parentId === '0');
    const hasThread = hit.rootId !== undefined;
    const cta = external
        ? `查看正文 ${icon('arrow-right', 14)}`
        : hasThread
            ? `${isRoot ? '进入讨论' : '查看回复'} ${icon('arrow-right', 14)}`
            : `查看详情 ${icon('arrow-right', 14)}`;
    const aria = external
        ? `查看外部正文：${escapeHtml(hit.title)}`
        : `查看详情：${escapeHtml(hit.title)}`;
    const threadLine = hasThread
        ? `<div class="result__threadline">
        <span class="result__thread-kind ${isRoot ? 'is-root' : 'is-reply'}">
          ${icon(isRoot ? 'message' : 'arrow-up', 12)}
          ${isRoot ? '主帖' : '回复'}
        </span>
        ${isRoot
            ? `<span class="result__thread-count">${hit.directReplyCount ?? 0} 条直接回复</span>`
            : `<span class="result__thread-count">第 ${hit.depth ?? 1} 层 · 所属讨论</span>`}
      </div>`
        : '';
    return `<a class="result ${hasThread ? 'result--thread' : ''}" href="${escapeHtml(href)}" style="--i: ${index}" data-trace-id="${escapeHtml(hit.id)}" data-result
    aria-label="${aria}">
    <div class="result__top">
      <span class="result__source">${icon('building', 13)}${escapeHtml(hit.source)}</span>
      <span class="result__sep">›</span>
      <span>${escapeHtml(hit.category)}</span>
      ${hit.matchRate > 0 ? `<span class="result__rate ${matchClass(hit.matchRate)}" title="综合关键词、同义词与纠错后的匹配度">${hit.matchRate}% 匹配</span>` : ''}
    </div>
    <h2 class="result__title">${hit.titleHtml}</h2>
    ${hit.snippetHtml ? `<p class="result__snippet">${hit.snippetHtml}</p>` : ''}
    ${threadLine}
    <div class="result__meta">
      <span class="result__author">${escapeHtml(hit.author)}</span><span class="dot"></span>
      <span>${formatDate(hit.updatedAt)}</span>
      ${hit.tags.slice(0, 3).map((tag) => `<span class="tag tag--sm">${escapeHtml(tag)}</span>`).join('')}
      <span class="result__cta">${cta}</span>
    </div>
  </a>`;
}
function pageItems(current, total) {
    const wanted = new Set([1, total]);
    for (let offset = -2; offset <= 2; offset += 1) {
        const page = current + offset;
        if (page >= 1 && page <= total)
            wanted.add(page);
    }
    const sorted = [...wanted].sort((a, b) => a - b);
    const items = [];
    let previous = 0;
    for (const page of sorted) {
        if (previous > 0 && page - previous > 1)
            items.push('gap');
        items.push(page);
        previous = page;
    }
    return items;
}
function paginationHtml(route, response) {
    const totalPages = Math.max(1, Math.ceil(response.total / response.pageSize));
    if (totalPages <= 1)
        return '';
    const link = (page, label, className = '', ariaLabel = '') => `<a class="page ${className}" href="${buildSearchHash({ ...route, page })}"
      ${ariaLabel ? `aria-label="${ariaLabel}"` : ''}>${label}</a>`;
    const items = pageItems(response.page, totalPages)
        .map((item) => {
        if (item === 'gap')
            return '<span class="page page--gap">…</span>';
        if (item === response.page) {
            return `<span class="page is-active" aria-current="page">${item}</span>`;
        }
        return link(item, String(item));
    })
        .join('');
    return `<nav class="pagination" aria-label="分页">
    ${response.page > 1
        ? link(response.page - 1, `${icon('arrow-left', 15)}上一页`, 'page--wide', '上一页')
        : '<span class="page page--wide is-disabled">上一页</span>'}
    <div class="pagination__pages">${items}</div>
    ${response.page < totalPages
        ? link(response.page + 1, `下一页${icon('arrow-right', 15)}`, 'page--wide', '下一页')
        : '<span class="page page--wide is-disabled">下一页</span>'}
  </nav>`;
}
function facetsHtml(route, response) {
    if (response.facets.length === 0)
        return '';
    return `<section class="side-card">
    <h2 class="side-card__title">缩小范围</h2>
    ${response.facets
        .map((group) => `<div class="facet-group">
          <h3>${escapeHtml(group.label)}</h3>
          <ul>${group.buckets
        .map((bucket) => {
        const filterValue = bucket.filterValue ?? bucket.value;
        const active = route[group.field] === bucket.value || route[group.field] === bucket.filterValue;
        return `<li><a class="facet ${active ? 'is-active' : ''}"
                href="${toggleFacetHash(route, group.field, filterValue)}">
                <span class="facet__check">${active ? icon('check', 13) : ''}</span>
                <span class="facet__value">${escapeHtml(bucket.value)}</span>
                <span class="facet__count">${formatNumber(bucket.count)}</span>
              </a></li>`;
    })
        .join('')}</ul>
        </div>`)
        .join('')}
  </section>`;
}
function relatedHtml(response) {
    if (response.relatedQueries.length === 0)
        return '';
    return `<section class="side-card">
    <h2 class="side-card__title">相关搜索</h2>
    <div class="chips chips--col">${response.relatedQueries
        .map((query) => `<a class="chip chip--ghost" href="${buildSearchHash({ q: query })}">${icon('search', 13)}${escapeHtml(query)}</a>`)
        .join('')}</div>
  </section>`;
}
function backendCard(response) {
    const external = response.backend === 'external';
    const solr = response.backend === 'solr';
    const label = response.coreLabel ?? (external ? 'DeepSeek 外部 Web' : solr ? 'Solr 实时索引' : '内置演示索引');
    const description = external
        ? '结果由 DeepSeek Search API 实时返回，不写入 Solr；点击结果查看正文，详情页可打开原文。'
        : solr
            ? `Core ${escapeHtml(response.core ?? '—')} · 高亮、分面与拼写建议由 Solr 返回。`
            : '连接 Solr 后自动切换，页面与接口保持不变。';
    return `<section class="side-card side-card--backend">
    <div class="backend-row">
      <span class="backend-dot ${external ? 'is-external' : solr ? 'is-solr' : 'is-mock'}"></span>
      <div>
        <strong>${escapeHtml(label)}</strong>
        <p>${description}</p>
      </div>
    </div>
    <button class="text-btn" data-status type="button">查看检索配置 ${icon('chevron-right', 14)}</button>
  </section>`;
}
function emptyHtml(route, response) {
    const suggestions = response.relatedQueries.slice(0, 5);
    const corrected = response.insight.correctedQuery;
    const original = response.insight.originalQuery;
    return `<div class="empty">
    <div class="empty__icon">${icon('search', 30)}</div>
    <h2>没有找到与「${escapeHtml(route.q)}」完全匹配的内容</h2>
    <p>可以尝试更短的关键词、同义词，或者从下面的推荐开始。</p>
    ${corrected && original
        ? `<a class="btn btn--ghost" href="${buildSearchHash({ q: original })}">搜索原词「${escapeHtml(original)}」</a>`
        : ''}
    <div class="chips empty__chips">${suggestions
        .map((query) => `<a class="chip" href="${buildSearchHash({ q: query })}">${escapeHtml(query)}</a>`)
        .join('')}</div>
  </div>`;
}
export function resultsHtml(route, response) {
    const start = response.total === 0 ? 0 : (response.page - 1) * response.pageSize + 1;
    const end = Math.min(response.total, response.page * response.pageSize);
    return `<div class="results-layout">
    <section class="results-main">
      <h1 class="sr-only">“${escapeHtml(route.q)}”的检索结果</h1>
      <div class="results-head">
        <div class="results-stats">
          <span>找到约 <strong>${formatNumber(response.total)}</strong> 条结果</span>
          <span class="dot"></span><span>用时 ${formatTook(response.tookMs)}</span>
          ${response.total > 0 ? `<span class="dot"></span><span>第 ${start}–${end} 条</span>` : ''}
        </div>
        <div class="results-badges">
          ${matchModeBadge(response.matchMode)}
          ${backendBadge(response.backend)}
        </div>
      </div>
      ${response.notice?.startsWith('Solr 请求失败') ? `<div class="notice">${icon('info', 16)}<div><strong>已自动降级</strong><p>${escapeHtml(response.notice)}</p></div></div>` : ''}
      ${response.didYouMean ? `<div class="did-you-mean">您是不是要找：<a href="${buildSearchHash({ q: response.didYouMean })}">${escapeHtml(response.didYouMean)}</a></div>` : ''}
      ${response.total > 0 ? insightHtml(response) : ''}
      ${toolbarHtml(route, response)}
      ${response.backend !== 'external' ? userFilterHtml(route, response.authors) : ''}
      ${response.total > 0
        ? `<div class="results-list">${response.results.map((hit, index) => hitHtml(hit, index, route.q)).join('')}</div>`
        : emptyHtml(route, response)}
      ${paginationHtml(route, response)}
    </section>
    <aside class="results-side">
      ${facetsHtml(route, response)}
      ${relatedHtml(response)}
      ${backendCard(response)}
    </aside>
  </div>`;
}
