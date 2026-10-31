import { assignTopics, createTopicCategory, deleteTopicCategory, unassignTopics } from '../api.js';
import { togglePinnedCategory } from '../components/topics.js';
import { escapeHtml, toast } from '../dom.js';
import { buildTopicsHash, parseRoute } from '../router.js';
let categoryFilter = '';
let filterHadText = false;
let expandAllGroups = false;
export function topicViewState() {
    return { categoryFilter, expandAll: expandAllGroups };
}
export function resetTopicExpandAll() {
    expandAllGroups = false;
}
export function syncTopicFilterFromDom() {
    const input = document.querySelector('[data-topic-category-filter]');
    if (input)
        categoryFilter = input.value;
}
function updateTopicSelection() {
    const boxes = [
        ...document.querySelectorAll('[data-topic-select]'),
    ];
    const count = boxes.filter((box) => box.checked).length;
    const badge = document.querySelector('[data-topic-selected-count]');
    if (badge) {
        badge.textContent = `已选 ${count} 篇`;
        badge.hidden = count === 0;
    }
    const assign = document.querySelector('[data-topic-assign]');
    if (assign)
        assign.disabled = count === 0;
    const remove = document.querySelector('[data-topic-remove]');
    if (remove)
        remove.disabled = count === 0;
}
function applyTopicCategoryFilter() {
    const query = categoryFilter.trim().toLowerCase();
    for (const row of document.querySelectorAll('[data-topic-cat-row]')) {
        const name = row.dataset.topicCatName ?? '';
        row.hidden = Boolean(query) && !name.includes(query);
    }
    for (const group of document.querySelectorAll('[data-topic-group]')) {
        const hasRows = [...group.querySelectorAll('[data-topic-cat-row]')].some((row) => !row.hidden);
        group.hidden = Boolean(query) && !hasRows;
        if (query)
            group.open = true;
    }
}
export function closeTopicCombos(except) {
    for (const combo of document.querySelectorAll('[data-topic-combo]')) {
        if (except && combo === except)
            continue;
        const panel = combo.querySelector('[data-topic-combo-panel]');
        const toggle = combo.querySelector('[data-topic-combo-toggle]');
        if (panel)
            panel.hidden = true;
        if (toggle)
            toggle.setAttribute('aria-expanded', 'false');
    }
}
/** 删除分类前的确认：说清楚「删的是结构，不是内容」 */
function confirmDeleteCategory(name, count, isChild) {
    return new Promise((resolve) => {
        const dialog = document.createElement('dialog');
        dialog.className = 'status-dialog confirm-dialog';
        const parts = [];
        parts.push(count > 0
            ? `该分类下有 ${count} 篇文档，删除后会回到「未分类」，文档本身不受影响。`
            : '该分类下没有文档。');
        if (!isChild)
            parts.push('它的二级分类会一并删除。');
        dialog.innerHTML = [
            '<div class="status-dialog__body">',
            `<h2 class="status-dialog__title">删除分类「${escapeHtml(name)}」？</h2>`,
            `<p class="status-dialog__hint">${parts.join('')}</p>`,
            '<div class="status-dialog__actions">',
            '<button class="btn btn--ghost" type="button" data-confirm-cancel>取消</button>',
            '<button class="btn btn--primary" type="button" data-confirm-delete>删除</button>',
            '</div></div>',
        ].join('');
        document.body.append(dialog);
        dialog.querySelector('[data-confirm-cancel]')?.addEventListener('click', () => {
            dialog.close();
            dialog.remove();
            resolve(false);
        });
        dialog.querySelector('[data-confirm-delete]')?.addEventListener('click', () => {
            dialog.close();
            dialog.remove();
            resolve(true);
        });
        dialog.addEventListener('cancel', () => {
            dialog.remove();
            resolve(false);
        });
        dialog.showModal();
    });
}
export function handleTopicsClick(target, event, ctx) {
    const comboToggle = target.closest('[data-topic-combo-toggle]');
    if (comboToggle) {
        event.preventDefault();
        const combo = comboToggle.closest('[data-topic-combo]');
        if (!combo)
            return true;
        closeTopicCombos(combo);
        const panel = combo.querySelector('[data-topic-combo-panel]');
        if (!panel)
            return true;
        const willOpen = panel.hidden;
        panel.hidden = !willOpen;
        comboToggle.setAttribute('aria-expanded', String(willOpen));
        if (willOpen)
            panel.querySelector('[data-topic-combo-search]')?.focus();
        return true;
    }
    const comboOption = target.closest('[data-topic-combo-option]');
    if (comboOption) {
        event.preventDefault();
        const combo = comboOption.closest('[data-topic-combo]');
        if (!combo)
            return true;
        const categoryId = comboOption.dataset.categoryId ?? '';
        const hidden = combo.querySelector('[data-topic-category-select]');
        const label = combo.querySelector('[data-topic-combo-label]');
        if (hidden)
            hidden.value = categoryId;
        if (label)
            label.textContent = comboOption.querySelector('span')?.textContent?.trim() ?? '选择分类…';
        closeTopicCombos();
        return true;
    }
    if (!target.closest('[data-topic-combo]'))
        closeTopicCombos();
    const pinButton = target.closest('[data-topic-pin]');
    if (pinButton) {
        event.preventDefault();
        const pinnedIds = [
            ...document.querySelectorAll('.topic-pin.is-pinned'),
        ]
            .map((button) => button.dataset.topicPin)
            .filter((id) => Boolean(id));
        togglePinnedCategory(pinButton.dataset.topicPin ?? '', pinnedIds);
        ctx.rerender();
        return true;
    }
    const deleteCategoryButton = target.closest('[data-topic-delete]');
    if (deleteCategoryButton) {
        event.preventDefault();
        const id = deleteCategoryButton.dataset.topicDelete ?? '';
        const name = deleteCategoryButton.dataset.topicName ?? '';
        const count = Number(deleteCategoryButton.dataset.topicCount ?? 0);
        const isChild = deleteCategoryButton.dataset.topicChild === '1';
        void confirmDeleteCategory(name, count, isChild).then((ok) => {
            if (!ok)
                return;
            void deleteTopicCategory(id)
                .then((result) => {
                toast(result.unassigned > 0
                    ? `已删除「${name}」，${result.unassigned} 篇文档回到未分类`
                    : `已删除「${name}」`);
                const deleted = new Set(result.deleted);
                const match = /[?&]category=([^&]+)/.exec(window.location.hash);
                if (match && deleted.has(decodeURIComponent(match[1]))) {
                    window.location.hash = buildTopicsHash({ q: '', page: 1 });
                    return;
                }
                ctx.rerender();
            })
                .catch((error) => {
                toast(error instanceof Error ? error.message : '删除分类失败');
            });
        });
        return true;
    }
    const removeButton = target.closest('[data-topic-remove]');
    if (removeButton) {
        event.preventDefault();
        if (!ctx.isLoggedIn) {
            toast('请先登录后再管理主题分类');
            return true;
        }
        const route = parseRoute();
        if (route.name !== 'topics' || !route.category)
            return true;
        const selected = [
            ...document.querySelectorAll('[data-topic-select]:checked'),
        ].map((box) => box.value);
        if (selected.length === 0) {
            toast('请先勾选主帖');
            return true;
        }
        if (!window.confirm(`确认从当前分类移出 ${selected.length} 篇主帖？`))
            return true;
        removeButton.disabled = true;
        void unassignTopics({ docIds: selected, categoryId: route.category })
            .then((result) => {
            toast(`已移出 ${result.removed} 篇`);
            ctx.rerender();
        })
            .catch((error) => {
            toast(error instanceof Error ? error.message : String(error));
            removeButton.disabled = false;
        });
        return true;
    }
    const assignButton = target.closest('[data-topic-assign]');
    if (assignButton) {
        event.preventDefault();
        if (!ctx.isLoggedIn) {
            toast('请先登录后再管理主题分类');
            return true;
        }
        const selected = [
            ...document.querySelectorAll('[data-topic-select]:checked'),
        ].map((box) => box.value);
        if (selected.length === 0) {
            toast('请先勾选主帖');
            return true;
        }
        const select = document.querySelector('[data-topic-category-select]');
        let categoryId = select?.value ?? '';
        let categoryName = '';
        if (categoryId === '__new__') {
            const name = window.prompt('新建分类名称，例如：管理科学、数学');
            if (!name?.trim())
                return true;
            categoryName = name.trim();
            categoryId = '';
        }
        if (!categoryId && !categoryName) {
            toast('请选择分类，或新建一个分类');
            return true;
        }
        assignButton.disabled = true;
        void assignTopics({ docIds: selected, categoryId: categoryId || undefined, categoryName: categoryName || undefined })
            .then((result) => {
            toast(`已归入「${result.category.name}」${result.assigned} 篇`);
            ctx.rerender();
        })
            .catch((error) => {
            toast(error instanceof Error ? error.message : String(error));
            assignButton.disabled = false;
        });
        return true;
    }
    const addChildButton = target.closest('[data-topic-add-child]');
    if (addChildButton) {
        event.preventDefault();
        if (!ctx.isLoggedIn) {
            toast('请先登录后再新建分类');
            return true;
        }
        const parentId = addChildButton.dataset.topicAddChild ?? '';
        const parentName = addChildButton.dataset.parentName ?? '当前分类';
        const name = window.prompt(`在「${parentName}」下新增二级分类名称`);
        if (!name?.trim())
            return true;
        void createTopicCategory(name.trim(), parentId)
            .then(() => {
            toast('二级分类已创建');
            ctx.rerender();
        })
            .catch((error) => {
            toast(error instanceof Error ? error.message : String(error));
        });
        return true;
    }
    if (target.closest('[data-topic-new]')) {
        event.preventDefault();
        if (!ctx.isLoggedIn) {
            toast('请先登录后再新建分类');
            return true;
        }
        const name = window.prompt('新建分类名称，例如：管理科学、数学');
        if (!name?.trim())
            return true;
        void createTopicCategory(name.trim())
            .then(() => {
            toast('分类已创建');
            ctx.rerender();
        })
            .catch((error) => {
            toast(error instanceof Error ? error.message : String(error));
        });
        return true;
    }
    return false;
}
export function handleTopicsInput(event, ctx) {
    const filter = event.target.closest('[data-topic-category-filter]');
    if (filter) {
        categoryFilter = filter.value;
        if (filter.value.trim()) {
            filterHadText = true;
            applyTopicCategoryFilter();
            return true;
        }
        const hadText = filterHadText;
        categoryFilter = '';
        filterHadText = false;
        if (!hadText) {
            applyTopicCategoryFilter();
            return true;
        }
        expandAllGroups = true;
        const route = parseRoute();
        const hash = buildTopicsHash({ q: route.name === 'topics' ? route.q : '', page: 1 });
        if (window.location.hash === hash)
            ctx.rerender();
        else
            window.location.hash = hash;
        return true;
    }
    const comboSearch = event.target.closest('[data-topic-combo-search]');
    if (!comboSearch)
        return true;
    const combo = comboSearch.closest('[data-topic-combo]');
    if (!combo)
        return true;
    const query = comboSearch.value.trim().toLowerCase();
    let visible = 0;
    for (const option of combo.querySelectorAll('[data-topic-combo-option]')) {
        const name = option.dataset.categoryName ?? '';
        const show = !query || name.includes(query);
        option.hidden = !show;
        if (show)
            visible += 1;
    }
    const empty = combo.querySelector('[data-topic-combo-empty]');
    if (empty)
        empty.hidden = visible > 0;
    return false;
}
export function handleTopicsChange(event) {
    const topicBox = event.target.closest('[data-topic-select]');
    if (topicBox) {
        updateTopicSelection();
        return true;
    }
    return false;
}
export function handleTopicsSubmit(event, ctx) {
    const topicForm = event.target.closest('[data-topic-search]');
    if (topicForm) {
        event.preventDefault();
        const route = parseRoute();
        if (route.name !== 'topics')
            return true;
        const q = topicForm.querySelector('input[name="q"]')?.value.trim() ?? '';
        const filterInput = document.querySelector('[data-topic-category-filter]');
        const filterValue = filterInput?.value ?? categoryFilter;
        categoryFilter = filterValue;
        const resetCategory = filterHadText && !filterValue.trim();
        if (resetCategory)
            expandAllGroups = true;
        filterHadText = Boolean(filterValue.trim());
        const hash = buildTopicsHash({
            q,
            category: resetCategory ? undefined : route.category,
            page: 1,
        });
        if (window.location.hash === hash)
            ctx.rerender();
        else
            window.location.hash = hash;
        return true;
    }
    return false;
}
