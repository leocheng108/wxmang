import { fetchRecentKeywords, fetchSuggest, hideRecentKeyword } from '../api.js';
import { debounce, escapeAttr, escapeHtml, qs, toast } from '../dom.js';
import { icon } from '../icons.js';
import { removeRecentSearch } from '../recent.js';
const TYPE_ICON = {
    hot: 'trend',
    doc: 'doc',
    keyword: 'hash',
    correction: 'wand',
    recent: 'clock',
};
const TYPE_LABEL = {
    hot: '热门',
    doc: '文档',
    keyword: '关键词',
    correction: '纠错',
    recent: '最近',
};
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/** 高亮联想词中与当前输入匹配的字符，样式与结果页命中词一致 */
function highlightSuggestText(text, query) {
    const rawTerms = [query, ...query.split(/[\s,，、;；]+/)]
        .map((term) => term.trim())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);
    const terms = [...new Set(rawTerms)];
    if (terms.length === 0)
        return escapeHtml(text);
    const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'giu');
    return text
        .split(pattern)
        .map((part, index) => index % 2 === 1 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part))
        .join('');
}
function mergeWithRecent(query, recent, suggestions, max = 10) {
    const normalized = query.trim().toLowerCase();
    const recentItems = recent
        .filter((item) => !normalized || item.keyword.toLowerCase().includes(normalized))
        .map((item) => ({
        text: item.keyword,
        type: 'recent',
        hint: '最近搜索',
    }));
    const seen = new Set();
    return [...recentItems, ...suggestions]
        .filter((item) => {
        const key = item.text.trim().toLowerCase();
        if (!key || seen.has(key))
            return false;
        seen.add(key);
        return true;
    })
        .slice(0, max);
}
export function searchBoxHtml(options) {
    const value = options.value ?? '';
    const placeholder = options.placeholder ?? '搜索标题、正文或关键词…';
    return `<form class="searchbox searchbox--${options.variant}" data-search-form role="search" autocomplete="off">
    <div class="searchbox__field">
      <span class="searchbox__icon">${icon('search', options.variant === 'hero' ? 21 : 19)}</span>
      <input class="searchbox__input" data-search-input name="q" type="search" value="${escapeAttr(value)}"
        placeholder="${escapeAttr(placeholder)}" aria-label="搜索业务知识" role="combobox"
        aria-expanded="false" aria-autocomplete="list" aria-controls="suggest-list" spellcheck="false" />
      <button class="searchbox__clear" data-clear-input type="button" aria-label="清空检索词" hidden>${icon('close', 16)}</button>
      <span class="searchbox__ai" title="已启用中文分词、同义词扩展与错拼纠正">
        ${icon('sparkle', 17)}<span class="searchbox__ai-text">智能匹配</span>
      </span>
      <button class="searchbox__submit" type="submit" aria-label="开始检索">${icon('arrow-right', 18)}</button>
    </div>
    <div class="suggest" data-suggest hidden>
      <ul class="suggest__list" id="suggest-list" role="listbox" aria-label="搜索建议"></ul>
      <div class="suggest__foot"><span>↑↓ 选择</span><span>Enter 确认</span><span>Esc 关闭</span></div>
    </div>
  </form>`;
}
export function initSearchBox(options) {
    const form = qs('[data-search-form]');
    if (!form)
        return;
    const input = qs('[data-search-input]', form);
    const clearButton = qs('[data-clear-input]', form);
    const panel = qs('[data-suggest]', form);
    const list = qs('.suggest__list', form);
    if (!input || !clearButton || !panel || !list)
        return;
    let items = [];
    let activeIndex = -1;
    let lastQuery = null;
    let requestId = 0;
    let controller = null;
    let composing = false;
    const isOpen = () => !panel.hidden;
    const setOpen = (open) => {
        panel.hidden = !open;
        input.setAttribute('aria-expanded', String(open));
        if (!open) {
            activeIndex = -1;
            input.removeAttribute('aria-activedescendant');
        }
    };
    const updateActive = () => {
        const nodes = list.querySelectorAll('[data-suggest-index]');
        nodes.forEach((node) => {
            const index = Number(node.dataset.suggestIndex);
            const active = index === activeIndex;
            node.classList.toggle('is-active', active);
            node.setAttribute('aria-selected', String(active));
        });
        if (activeIndex >= 0) {
            input.setAttribute('aria-activedescendant', `sug-${activeIndex}`);
            nodes[activeIndex]?.scrollIntoView({ block: 'nearest' });
        }
        else {
            input.removeAttribute('aria-activedescendant');
        }
    };
    const paint = () => {
        if (items.length === 0) {
            list.innerHTML = `<li class="suggest__empty">没有匹配的联想词，按 Enter 直接检索「${escapeHtml(input.value.trim())}」</li>`;
            return;
        }
        const query = lastQuery ?? input.value.trim();
        list.innerHTML = items
            .map((item, index) => `<li class="suggest__item" role="option" id="sug-${index}"
          data-suggest-index="${index}" data-suggest-text="${escapeAttr(item.text)}"
          aria-selected="false">
          <span class="suggest__icon suggest__icon--${item.type}">${icon(TYPE_ICON[item.type], 17)}</span>
          <span class="suggest__body">
            <span class="suggest__text">${highlightSuggestText(item.text, query)}</span>
            ${item.excerpt ? `<span class="suggest__excerpt">${highlightSuggestText(item.excerpt, query)}</span>` : ''}
            ${item.hint ? `<span class="suggest__hint">${escapeHtml(item.hint)}</span>` : ''}
          </span>
          ${item.type === 'recent'
            ? `<button class="suggest__remove" type="button" data-hide-recent="${escapeAttr(item.text)}"
                  aria-label="从最近搜索中移除 ${escapeAttr(item.text)}" title="从最近搜索中移除">${icon('close', 13)}</button>`
            : ''}
          <span class="suggest__type">${TYPE_LABEL[item.type]}</span>
        </li>`)
            .join('');
    };
    const load = async (query, moveToFirst = false) => {
        controller?.abort();
        controller = new AbortController();
        const current = (requestId += 1);
        try {
            const [response, recent] = await Promise.all([
                fetchSuggest(query, options.core, controller.signal),
                options.sessionId && options.allowHistory !== false
                    ? fetchRecentKeywords(options.sessionId, 10, controller.signal).catch(() => ({ items: [] }))
                    : Promise.resolve({ items: [] }),
            ]);
            if (current !== requestId)
                return;
            items = mergeWithRecent(query, recent.items, response.items, 10);
            lastQuery = query;
            activeIndex = moveToFirst && items.length > 0 ? 0 : -1;
            paint();
            setOpen(items.length > 0);
            updateActive();
        }
        catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError')
                return;
            if (current !== requestId)
                return;
            items = [];
            lastQuery = query;
            paint();
            setOpen(true);
        }
    };
    const move = (delta) => {
        if (items.length === 0)
            return;
        if (activeIndex < 0) {
            activeIndex = delta > 0 ? 0 : items.length - 1;
        }
        else {
            activeIndex = (activeIndex + delta + items.length) % items.length;
        }
        updateActive();
    };
    const choose = (item) => {
        setOpen(false);
        if (item.type === 'doc' && item.id && options.onOpenDoc) {
            options.onOpenDoc(item.id, input.value.trim());
            return;
        }
        input.value = item.text;
        options.onSearch(item.text.trim());
    };
    const submit = () => {
        const query = input.value.trim();
        if (!query) {
            input.focus();
            return;
        }
        setOpen(false);
        options.onSearch(query);
    };
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        submit();
    });
    const run = debounce(() => {
        void load(input.value.trim());
    }, 140);
    input.addEventListener('input', () => {
        clearButton.hidden = input.value.length === 0;
        if (!composing)
            run();
    });
    input.addEventListener('compositionstart', () => {
        composing = true;
    });
    input.addEventListener('compositionend', () => {
        composing = false;
        run();
    });
    input.addEventListener('focus', () => {
        const query = input.value.trim();
        if (items.length > 0 && lastQuery === query) {
            setOpen(true);
            updateActive();
        }
        else {
            void load(query);
        }
    });
    input.addEventListener('keydown', (event) => {
        if (event.isComposing)
            return;
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!isOpen()) {
                void load(input.value.trim(), true);
            }
            else {
                move(1);
            }
        }
        else if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (!isOpen()) {
                void load(input.value.trim(), true);
            }
            else {
                move(-1);
            }
        }
        else if (event.key === 'Enter') {
            if (activeIndex >= 0 && items[activeIndex]) {
                event.preventDefault();
                choose(items[activeIndex]);
            }
        }
        else if (event.key === 'Escape' && isOpen()) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
        }
        else if (event.key === 'Tab') {
            setOpen(false);
        }
    });
    clearButton.addEventListener('click', () => {
        input.value = '';
        clearButton.hidden = true;
        setOpen(false);
        input.focus();
        void load('');
    });
    list.addEventListener('pointerdown', (event) => {
        if (event.target.closest('[data-hide-recent]'))
            return;
        const target = event.target.closest('[data-suggest-index]');
        if (!target)
            return;
        event.preventDefault();
        const index = Number(target.dataset.suggestIndex);
        const item = items[index];
        if (item)
            choose(item);
    });
    list.addEventListener('click', (event) => {
        const button = event.target.closest('[data-hide-recent]');
        if (!button || !options.sessionId)
            return;
        event.preventDefault();
        event.stopPropagation();
        const keyword = button.dataset.hideRecent?.trim();
        if (!keyword)
            return;
        void hideRecentKeyword(options.sessionId, keyword)
            .then(() => {
            items = items.filter((item) => !(item.type === 'recent' && item.text === keyword));
            removeRecentSearch(keyword);
            if (items.length === 0)
                setOpen(false);
            else {
                paint();
                updateActive();
            }
        })
            .catch(() => toast('移除最近搜索失败，请稍后重试'));
    });
    const closeOnOutside = (event) => {
        if (!form.contains(event.target))
            setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    window.addEventListener('hashchange', () => document.removeEventListener('pointerdown', closeOnOutside), { once: true });
    clearButton.hidden = input.value.length === 0;
}
