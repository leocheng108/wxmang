import { fetchDetail, fetchHealth, fetchMe, fetchStats, fetchNote, saveNote, searchNotes, logout, recordSearch } from './api.js';
import { analyticsSkeleton } from './components/analytics.js';
import { externalUsageSkeleton } from './components/externalUsage.js';
import { usersSkeleton } from './components/users.js';
import { siteFooter, siteHeader, statusDialogHtml } from './components/chrome.js';
import { detailHtml, detailSkeleton } from './components/detail.js';
import { homeHtml } from './components/home.js';
import { searchSkeleton } from './components/results.js';
import { initSearchBox } from './components/searchBox.js';
import { knowledgeSkeleton } from './components/knowledge.js';
import { notesHtml, notesSkeleton } from './components/notes.js';
import { topicsHtml, topicSkeleton } from './components/topics.js';
import { initAnnotations } from './features/annotations.js';
import { initRelatedDocs } from './features/relatedDocs.js';
import { initQuestionsPanel } from './features/questions.js';
import { initTraces } from './features/traces.js';
import { initResumeDock } from './features/resume.js';
import { applyReadingPrefs, initReadingControls } from './features/readingPrefs.js';
import { clearAllLocal, migrateLegacy } from './storage/readingStore.js';
import { initReadingPosition } from './features/readingPosition.js';
import { initDocSeries } from './features/series.js';
import { clearKnowledgeFocus, focusKnowledgeBranch } from './features/knowledge.js';
import { closeTopicCombos, handleTopicsChange, handleTopicsClick, handleTopicsInput, handleTopicsSubmit, resetTopicExpandAll, syncTopicFilterFromDom, topicViewState, } from './features/topics.js';
import { closeThreadModal, openThreadModal } from './features/thread.js';
import { abortPageLoaders, loadAnalytics, loadExternalUsage, loadKnowledge, loadSearch, loadTopics, loadUsers, } from './features/pages.js';
import { copyText, escapeHtml, toast } from './dom.js';
import { formatDateTime } from './format.js';
import { icon } from './icons.js';
import { addRecentSearch, clearRecentSearches, getRecentSearches } from './recent.js';
import { getSessionId } from './session.js';
import { buildAnalyticsHash, buildAdminUsersHash, buildDocHash, buildExternalUsageHash, buildHomeHash, buildNotesHash, buildSearchHash, getActiveCore, parseRoute, setActiveCore, } from './router.js';
const app = (() => {
    const element = document.getElementById('app');
    if (!element)
        throw new Error('未找到 #app 挂载点');
    return element;
})();
let health = null;
let stats = null;
let me = null;
let statsCore = null;
let renderVersion = 0;
let detailController = null;
let notesController = null;
migrateLegacy();
applyReadingPrefs();
let pendingRestoreY = null;
function pagesContext() {
    return {
        isCurrent: (value) => value === renderVersion,
        renderError,
        activeCore: (route) => routeCore(route),
        isLoggedIn: Boolean(me),
        health,
        onSearchRendered: () => {
            initTraces();
            if (pendingRestoreY === null)
                return;
            const y = pendingRestoreY;
            pendingRestoreY = null;
            requestAnimationFrame(() => window.scrollTo(0, y));
        },
        rerender: () => {
            void render();
        },
    };
}
function topicsContext() {
    return {
        isLoggedIn: Boolean(me),
        rerender: () => {
            void render();
        },
    };
}
function isAbort(error) {
    return error instanceof Error && error.name === 'AbortError';
}
function pageShell(route, content) {
    return `<div class="app-page">
    ${siteHeader(route, health, me)}
    <div id="main" class="main">${content}</div>
    ${siteFooter(health, route.core ?? health?.defaultCore)}
  </div>`;
}
function documentTitle(route) {
    if (route.name === 'search')
        return `${route.q} · 资料搜索`;
    if (route.name === 'detail')
        return '文档详情 · 资料搜索';
    if (route.name === 'topics')
        return '分类管理 · 资料搜索';
    if (route.name === 'knowledge')
        return '分类知识树 · 资料搜索';
    if (route.name === 'notes')
        return '我的笔记 · 资料搜索';
    if (route.name === 'analytics')
        return '检索分析 · 资料搜索';
    if (route.name === 'adminUsers')
        return '用户管理 · 资料搜索';
    if (route.name === 'externalUsage')
        return '外部 Web 用量 · 资料搜索';
    return '资料搜索 · 企业业务检索引擎';
}
function takeRestoreY() {
    try {
        const back = sessionStorage.getItem('bizfind:backHash');
        if (back !== window.location.hash) {
            sessionStorage.removeItem('bizfind:backHash');
            sessionStorage.removeItem('bizfind:scrollY');
            return null;
        }
        const y = Number(sessionStorage.getItem('bizfind:scrollY') ?? '0');
        sessionStorage.removeItem('bizfind:backHash');
        sessionStorage.removeItem('bizfind:scrollY');
        return Number.isFinite(y) && y > 0 ? y : null;
    }
    catch {
        return null;
    }
}
function clearRestoreState() {
    try {
        sessionStorage.removeItem('bizfind:backHash');
        sessionStorage.removeItem('bizfind:scrollY');
    }
    catch {
        // 隐私模式下 sessionStorage 可能不可用
    }
}
function backHref(q) {
    let stored = null;
    try {
        stored = sessionStorage.getItem('bizfind:backHash');
    }
    catch {
        stored = null;
    }
    if (stored?.startsWith('#/search') || stored?.startsWith('#/topics'))
        return stored;
    return q ? buildSearchHash({ q }) : buildHomeHash();
}
function routeCore(route) {
    // 分析/用量页不是检索 Core，但返回检索时应保留进入前的 Core 上下文。
    if (!route.core && (route.name === 'analytics' || route.name === 'externalUsage')) {
        return getActiveCore() ?? health?.defaultCore ?? health?.solr.core;
    }
    return route.core ?? health?.defaultCore ?? health?.solr.core;
}
function renderError(error) {
    const main = document.getElementById('main');
    if (!main)
        return;
    const message = error instanceof Error ? error.message : '未知错误';
    main.innerHTML = `<section class="state-card">
    <div class="state-card__icon">${icon('alert', 28)}</div>
    <h1>检索服务暂时不可用</h1>
    <p>${escapeHtml(message)}</p>
    <div class="state-card__actions">
      <button class="btn btn--primary" data-retry type="button">重新尝试</button>
      <a class="btn btn--ghost" href="#/">返回首页</a>
    </div>
  </section>`;
}
function initNotePanel() {
    const panel = document.querySelector('[data-note-panel]');
    if (!panel)
        return;
    const input = panel.querySelector('[data-note-input]');
    const saveButton = panel.querySelector('[data-note-save]');
    const archive = panel.querySelector('[data-note-archive]');
    const status = panel.querySelector('[data-note-status]');
    const hint = panel.querySelector('[data-note-hint]');
    const docId = panel.dataset.noteDocId ?? '';
    if (!input || !docId)
        return;
    let saving = false;
    const setStatus = (text) => {
        if (status)
            status.textContent = text;
    };
    const appendNote = (note) => {
        if (!archive)
            return;
        archive.querySelector('.note-panel__empty')?.remove();
        const entry = document.createElement('article');
        entry.className = 'note-entry';
        entry.setAttribute('data-note-entry', '');
        const content = document.createElement('div');
        content.className = 'note-entry__content';
        content.textContent = note.content;
        const time = document.createElement('time');
        time.className = 'note-entry__time';
        time.dateTime = note.createdAt;
        time.textContent = formatDateTime(note.createdAt);
        entry.append(content, time);
        archive.append(entry);
        archive.scrollTop = archive.scrollHeight;
    };
    const save = async () => {
        if (!input.value.trim()) {
            setStatus('内容为空，未保存');
            if (hint)
                hint.textContent = '写一点内容再保存';
            return;
        }
        if (saving)
            return;
        saving = true;
        if (saveButton)
            saveButton.disabled = true;
        setStatus('保存中…');
        try {
            const result = await saveNote(docId, input.value);
            appendNote(result.note);
            input.value = '';
            setStatus(`已归档 ${result.notes.length} 条`);
            if (hint)
                hint.textContent = '已保存为只读历史笔记';
            input.focus();
        }
        catch (error) {
            setStatus('保存失败');
            if (hint)
                hint.textContent = error instanceof Error ? error.message : '请稍后重试';
        }
        finally {
            saving = false;
            if (saveButton)
                saveButton.disabled = false;
        }
    };
    input.addEventListener('input', () => {
        setStatus(input.value.trim() ? '正在书写…' : '尚未记录');
        if (hint)
            hint.textContent = '保存后归档，历史笔记只读';
    });
    input.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            void save();
        }
    });
    saveButton?.addEventListener('click', () => void save());
}
function initNotesSuggest() {
    const form = document.querySelector('[data-notes-search]');
    const input = form?.querySelector('input[name="q"]');
    const panel = form?.querySelector('[data-notes-suggest]');
    if (!form || !input || !panel)
        return;
    let timer = null;
    let controller = null;
    let active = -1;
    const hide = () => {
        panel.hidden = true;
        panel.replaceChildren();
        active = -1;
    };
    const setActive = (index) => {
        const buttons = [...panel.querySelectorAll('[data-note-doc]')];
        active = Math.max(-1, Math.min(index, buttons.length - 1));
        buttons.forEach((button, buttonIndex) => {
            button.classList.toggle('is-active', buttonIndex === active);
        });
    };
    const highlight = (content, query) => {
        const index = content.toLowerCase().indexOf(query.toLowerCase());
        if (index < 0)
            return escapeHtml(content);
        return `${escapeHtml(content.slice(0, index))}<mark>${escapeHtml(content.slice(index, index + query.length))}</mark>${escapeHtml(content.slice(index + query.length))}`;
    };
    const search = async () => {
        const query = input.value.trim();
        if (!query) {
            hide();
            return;
        }
        controller?.abort();
        controller = new AbortController();
        try {
            const result = await searchNotes(query, controller.signal, 5);
            if (input.value.trim() !== query)
                return;
            if (result.notes.length === 0) {
                hide();
                return;
            }
            panel.innerHTML = result.notes
                .map((note) => `<button class="notes-suggest__item" type="button"
            data-note-doc="${escapeHtml(note.docId)}">
            <span class="notes-suggest__content">${highlight(note.content, query)}</span>
            <span class="notes-suggest__meta">${formatDateTime(note.createdAt)} · 回到原帖</span>
          </button>`)
                .join('');
            panel.hidden = false;
            active = -1;
        }
        catch (error) {
            if (!isAbort(error))
                hide();
        }
    };
    input.addEventListener('input', () => {
        if (timer !== null)
            window.clearTimeout(timer);
        timer = window.setTimeout(() => void search(), 180);
    });
    input.addEventListener('keydown', (event) => {
        if (panel.hidden)
            return;
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive(active + 1);
        }
        else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive(active - 1);
        }
        else if (event.key === 'Enter' && active >= 0) {
            event.preventDefault();
            panel.querySelectorAll('[data-note-doc]')[active]?.click();
        }
        else if (event.key === 'Escape') {
            hide();
        }
    });
    input.addEventListener('blur', () => {
        window.setTimeout(hide, 180);
    });
    panel.addEventListener('mousedown', (event) => {
        event.preventDefault();
    });
    panel.addEventListener('click', (event) => {
        const button = event.target.closest('[data-note-doc]');
        if (!button)
            return;
        const docId = button.dataset.noteDoc;
        if (!docId)
            return;
        hide();
        window.location.hash = buildDocHash(docId, input.value.trim());
    });
}
async function loadNotes(route, version) {
    if (!me) {
        const returnTo = encodeURIComponent(`/${window.location.hash}`);
        window.location.href = `/auth/login?returnTo=${returnTo}`;
        return;
    }
    notesController = new AbortController();
    try {
        const data = await searchNotes(route.q, notesController.signal);
        if (version !== renderVersion)
            return;
        const main = document.getElementById('main');
        if (!main)
            return;
        main.innerHTML = notesHtml(data, route.q);
        initNotesSuggest();
        initQuestionsPanel();
        initTraces();
    }
    catch (error) {
        if (isAbort(error) || version !== renderVersion)
            return;
        renderError(error);
    }
}
async function loadDetail(route, version) {
    detailController = new AbortController();
    try {
        const notePromise = me
            ? fetchNote(route.id, detailController.signal).catch(() => null)
            : Promise.resolve(null);
        const [detail, noteResponse] = await Promise.all([
            fetchDetail(route.id, route.q, routeCore(route), route.url, detailController.signal),
            notePromise,
        ]);
        if (version !== renderVersion)
            return;
        const main = document.getElementById('main');
        if (!main)
            return;
        document.title = `${detail.doc.title} · 资料搜索`;
        const fromResults = sessionStorage.getItem('bizfind:backHash')?.startsWith('#/search') ?? false;
        const backLabel = fromResults ? '返回检索结果' : route.q ? '查看全部结果' : '返回首页';
        main.innerHTML = detailHtml(detail, route.q, backHref(route.q), backLabel, noteResponse?.notes ?? [], Boolean(me));
        initNotePanel();
        // 会改变正文布局的部分先跑（续读条插在正文顶部、操作区加按钮），
        // 否则批注标记与浮卡会按旧位置绘制，出现错位。
        initReadingControls();
        initReadingPosition();
        initAnnotations(Boolean(me));
        initRelatedDocs();
        initDocSeries();
        // 字体/布局稳定后再校一次，兜住图片与字体异步加载造成的位移
        window.dispatchEvent(new Event('resize'));
        if (route.p && /^\d{1,4}$/.test(route.p)) {
            const paragraph = document.querySelector(`p[data-para="${route.p}"]`);
            if (paragraph) {
                document.querySelector('.reading-resume')?.remove();
                requestAnimationFrame(() => {
                    const y = paragraph.getBoundingClientRect().top + window.scrollY - 90;
                    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
                    window.scrollTo({ top: Math.min(Math.max(0, y), max) });
                });
            }
        }
    }
    catch (error) {
        if (isAbort(error) || version !== renderVersion)
            return;
        renderError(error);
    }
}
async function render() {
    const route = parseRoute();
    const version = (renderVersion += 1);
    // 浏览器里可能还留着切换前的 core 名（例如 core=wxmang），先归一化到当前可用 core
    const knownCores = health?.cores?.map((core) => core.name) ?? [];
    const rawCore = routeCore(route);
    const requestedCore = rawCore && knownCores.length > 0 && !knownCores.includes(rawCore)
        ? (health?.defaultCore ?? knownCores[0])
        : rawCore;
    if (route.core !== undefined && route.core !== requestedCore)
        route.core = requestedCore;
    const selectedCore = me ? requestedCore : (health?.defaultCore ?? requestedCore);
    if (!me) {
        const adminRoute = route.name === 'analytics' ||
            route.name === 'externalUsage' ||
            route.name === 'adminUsers';
        const publicCore = health?.defaultCore ?? 'wxmang';
        const otherCore = route.core !== undefined && route.core !== publicCore;
        if (adminRoute || otherCore) {
            window.location.hash = buildHomeHash(publicCore);
            return;
        }
    }
    if (!me?.roles.includes('search_admin') &&
        (route.name === 'analytics' ||
            route.name === 'externalUsage' ||
            route.name === 'adminUsers')) {
        window.location.hash = buildHomeHash(selectedCore ?? undefined);
        return;
    }
    setActiveCore(selectedCore);
    abortPageLoaders();
    detailController?.abort();
    notesController?.abort();
    pendingRestoreY = route.name === 'search' ? takeRestoreY() : null;
    if (route.name === 'home' && selectedCore && statsCore !== selectedCore) {
        try {
            stats = await fetchStats(selectedCore);
            statsCore = selectedCore;
        }
        catch (error) {
            console.warn('获取当前 Core 统计失败', error);
        }
        if (version !== renderVersion)
            return;
    }
    document.title = documentTitle(route);
    if (route.name === 'topics')
        syncTopicFilterFromDom();
    if (route.name === 'home')
        requestAnimationFrame(() => initResumeDock());
    const content = route.name === 'home'
        ? homeHtml(stats, health, me ? getRecentSearches() : [], selectedCore, Boolean(me))
        : route.name === 'search'
            ? searchSkeleton()
            : route.name === 'topics'
                ? topicSkeleton()
                : route.name === 'knowledge'
                    ? knowledgeSkeleton()
                    : route.name === 'notes'
                        ? notesSkeleton()
                        : route.name === 'adminUsers'
                            ? usersSkeleton()
                            : route.name === 'analytics'
                                ? analyticsSkeleton()
                                : route.name === 'externalUsage'
                                    ? externalUsageSkeleton()
                                    : detailSkeleton();
    app.innerHTML = pageShell(route, content);
    initSearchBox({
        core: selectedCore,
        sessionId: getSessionId(),
        allowHistory: Boolean(me),
        onSearch: goToSearch,
        onOpenDoc: (id, query) => {
            clearRestoreState();
            if (query.trim())
                addRecentSearch(query.trim());
            const hash = buildDocHash(id, query);
            if (window.location.hash === hash)
                void render();
            else
                window.location.hash = hash;
        },
    });
    window.scrollTo(0, 0);
    // SPA 自己管理滚动：默认让浏览器恢复旧位置会和「续读位置」打架
    if ('scrollRestoration' in history)
        history.scrollRestoration = 'manual';
    if (route.name === 'search')
        await loadSearch(route, version, pagesContext());
    else if (route.name === 'topics')
        await loadTopics(route, version, pagesContext());
    else if (route.name === 'knowledge')
        await loadKnowledge(route, version, pagesContext());
    else if (route.name === 'notes')
        await loadNotes(route, version);
    else if (route.name === 'adminUsers')
        await loadUsers(version, pagesContext());
    else if (route.name === 'detail')
        await loadDetail(route, version);
    else if (route.name === 'analytics')
        await loadAnalytics(route, version, pagesContext());
    else if (route.name === 'externalUsage')
        await loadExternalUsage(route, version, pagesContext());
}
function goToSearch(query) {
    const q = query.trim();
    if (!q)
        return;
    clearRestoreState();
    if (me)
        addRecentSearch(q);
    if (me) {
        void recordSearch({
            sessionId: getSessionId(),
            keyword: q,
            core: getActiveCore(),
            source: 'submit',
        }).catch((error) => console.warn('记录检索历史失败', error));
    }
    const hash = buildSearchHash({ q });
    if (window.location.hash === hash) {
        void render();
    }
    else {
        window.location.hash = hash;
    }
}
async function copyCurrentLink() {
    const ok = await copyText(window.location.href);
    toast(ok ? '链接已复制' : '复制失败，请从地址栏手动复制');
}
function handleInput(event) {
    handleTopicsInput(event, topicsContext());
}
function handleChange(event) {
    if (handleTopicsChange(event))
        return;
    const authorSelect = event.target.closest('[data-user-filter]');
    if (authorSelect) {
        const route = parseRoute();
        if (route.name !== 'search')
            return;
        const userName = authorSelect.value || undefined;
        const hash = buildSearchHash({ ...route, userName, page: 1 });
        if (window.location.hash === hash)
            void render();
        else
            window.location.hash = hash;
        return;
    }
    const usageFilter = event.target.closest('[data-usage-days]');
    if (usageFilter) {
        const route = parseRoute();
        if (route.name !== 'externalUsage')
            return;
        const hash = buildExternalUsageHash(Number(usageFilter.value) || route.days);
        if (window.location.hash === hash)
            void render();
        else
            window.location.hash = hash;
        return;
    }
    const analyticsFilter = event.target.closest('[data-analytics-days], [data-analytics-core]');
    if (analyticsFilter) {
        const route = parseRoute();
        if (route.name !== 'analytics')
            return;
        const days = Number(document.querySelector('[data-analytics-days]')?.value ?? route.days);
        const core = document.querySelector('[data-analytics-core]')?.value;
        const hash = buildAnalyticsHash({ days, core: core || null });
        if (window.location.hash === hash)
            void render();
        else
            window.location.hash = hash;
        return;
    }
    const select = event.target.closest('[data-core-select]');
    if (!select)
        return;
    const core = select.value;
    const route = parseRoute();
    const hash = route.name === 'search'
        ? buildSearchHash({ ...route, core, page: 1, userName: undefined })
        : route.name === 'analytics'
            ? buildAnalyticsHash({ days: route.days, core })
            : route.name === 'detail'
                ? route.q
                    ? buildSearchHash({ q: route.q, core })
                    : buildHomeHash(core)
                : buildHomeHash(core);
    if (window.location.hash === hash)
        void render();
    else
        window.location.hash = hash;
}
function handleSubmit(event) {
    if (handleTopicsSubmit(event, topicsContext()))
        return;
    const notesForm = event.target.closest('[data-notes-search]');
    if (notesForm) {
        event.preventDefault();
        const q = notesForm.querySelector('input[name="q"]')?.value.trim() ?? '';
        const hash = buildNotesHash({ q });
        if (window.location.hash === hash)
            void render();
        else
            window.location.hash = hash;
        return;
    }
    const usageForm = event.target.closest('[data-usage-form]');
    if (usageForm) {
        event.preventDefault();
        const route = parseRoute();
        if (route.name !== 'externalUsage')
            return;
        const days = Number(usageForm.querySelector('[data-usage-days]')?.value ?? 30);
        const hash = buildExternalUsageHash(days);
        if (window.location.hash === hash)
            void render();
        else
            window.location.hash = hash;
        return;
    }
    const form = event.target.closest('[data-analytics-form]');
    if (!form)
        return;
    event.preventDefault();
    const route = parseRoute();
    if (route.name !== 'analytics')
        return;
    const days = Number(form.querySelector('[data-analytics-days]')?.value ?? 30);
    const core = form.querySelector('[data-analytics-core]')?.value;
    const hash = buildAnalyticsHash({ days, core: core || null });
    if (window.location.hash === hash)
        void render();
    else
        window.location.hash = hash;
}
async function openStatusDialog() {
    if (!health) {
        try {
            health = await fetchHealth();
        }
        catch {
            toast('无法获取索引状态');
            return;
        }
    }
    try {
        stats = await fetchStats(getActiveCore());
        statsCore = getActiveCore() ?? null;
    }
    catch {
        // 统计失败不影响状态面板
    }
    const dialog = document.createElement('dialog');
    dialog.className = 'status-dialog';
    dialog.innerHTML = statusDialogHtml(health, stats);
    document.body.append(dialog);
    dialog.addEventListener('click', (event) => {
        const target = event.target;
        if (target === dialog || target.closest('[data-close-dialog]'))
            dialog.close();
        const clearButton = target.closest('[data-clear-local]');
        if (clearButton) {
            if (clearButton.dataset.armed !== '1') {
                clearButton.dataset.armed = '1';
                clearButton.textContent = '再点一次确认清除';
                return;
            }
            clearAllLocal();
            clearRecentSearches();
            try {
                window.localStorage.removeItem('bizfind:topic-pins');
            }
            catch {
                // 忽略存储不可用
            }
            dialog.close();
            toast('本机记录已清除');
            window.setTimeout(() => window.location.reload(), 600);
        }
    });
    dialog.addEventListener('close', () => dialog.remove());
    dialog.showModal();
}
function handleClick(event) {
    const target = event.target;
    const threadButton = target.closest('[data-thread-open]');
    if (threadButton) {
        event.preventDefault();
        void openThreadModal(threadButton);
        return;
    }
    if (target.closest('[data-thread-close]')) {
        closeThreadModal();
        return;
    }
    const knowledgeRoot = target.closest('[data-knowledge-root]');
    if (knowledgeRoot && document.querySelector('.knowledge-tree.is-focused')) {
        event.preventDefault();
        clearKnowledgeFocus();
        return;
    }
    const knowledgeToggle = target.closest('[data-knowledge-toggle]');
    if (knowledgeToggle) {
        event.preventDefault();
        const id = knowledgeToggle.getAttribute('data-knowledge-toggle') ?? '';
        const branch = [...document.querySelectorAll('[data-knowledge-children]')].find((group) => group.getAttribute('data-knowledge-children') === id);
        if (!branch)
            return;
        if (!branch.classList.contains('is-hidden')) {
            clearKnowledgeFocus();
            return;
        }
        clearKnowledgeFocus();
        focusKnowledgeBranch(knowledgeToggle);
        return;
    }
    if (handleTopicsClick(target, event, topicsContext()))
        return;
    if (target.closest('[data-status]')) {
        event.preventDefault();
        void openStatusDialog();
        return;
    }
    if (target.closest('[data-logout]')) {
        event.preventDefault();
        void logout()
            .catch(() => '/')
            .then((redirectTo) => {
            window.location.replace(redirectTo);
        });
        return;
    }
    if (target.closest('[data-close-dialog]')) {
        target.closest('dialog')?.close();
        return;
    }
    const copyButton = target.closest('[data-copy]');
    if (copyButton) {
        event.preventDefault();
        void copyCurrentLink();
        return;
    }
    if (target.closest('[data-clear-recent]')) {
        event.preventDefault();
        clearRecentSearches();
        void render();
        return;
    }
    if (target.closest('[data-retry]')) {
        event.preventDefault();
        void render();
        return;
    }
    if (target.closest('[data-submit-search]')) {
        event.preventDefault();
        document.querySelector('[data-search-form]')?.requestSubmit();
        return;
    }
    const searchLink = target.closest('a[href^="#/search"]');
    if (searchLink) {
        const href = searchLink.getAttribute('href') ?? '';
        const q = new URLSearchParams(href.split('?')[1] ?? '').get('q');
        if (q && me)
            addRecentSearch(q);
    }
    const result = target.closest('a[data-result], a[data-topic-open]');
    if (result) {
        try {
            sessionStorage.setItem('bizfind:backHash', window.location.hash);
            sessionStorage.setItem('bizfind:scrollY', String(window.scrollY));
        }
        catch {
            // 隐私模式下忽略滚动位置记忆
        }
    }
}
async function boot() {
    app.innerHTML = `<div class="boot">
    <div class="boot__mark">${icon('search', 26)}</div>
    <p>正在加载资料搜索…</p>
  </div>`;
    const [healthResult, statsResult, meResult] = await Promise.allSettled([
        fetchHealth(),
        fetchStats(),
        fetchMe(),
    ]);
    if (healthResult.status === 'fulfilled')
        health = healthResult.value;
    else
        console.warn('获取索引状态失败', healthResult.reason);
    if (statsResult.status === 'fulfilled') {
        stats = statsResult.value;
        statsCore = health?.defaultCore ?? null;
    }
    else {
        console.warn('获取索引统计失败', statsResult.reason);
    }
    if (meResult.status === 'fulfilled') {
        me = meResult.value;
    }
    else {
        me = null;
        console.warn('当前为未登录访问，仅开放 wxmang 公共检索');
    }
    app.addEventListener('click', handleClick);
    app.addEventListener('change', handleChange);
    app.addEventListener('input', handleInput);
    app.addEventListener('search', handleInput);
    app.addEventListener('submit', handleSubmit);
    window.addEventListener('hashchange', () => {
        void render();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            clearKnowledgeFocus();
            closeTopicCombos();
            if (document.getElementById('thread-modal')?.hidden === false)
                closeThreadModal();
        }
    });
    await render();
}
void boot();
