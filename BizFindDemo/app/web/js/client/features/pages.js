import { fetchAnalytics, fetchExternalUsage, fetchSearch, fetchTopicCategories, fetchTopics, fetchUsers, createUser, } from '../api.js';
import { analyticsHtml } from '../components/analytics.js';
import { externalUsageHtml } from '../components/externalUsage.js';
import { knowledgeHtml } from '../components/knowledge.js';
import { resultsHtml } from '../components/results.js';
import { initTopicTraces } from './topicTraces.js';
import { topicsHtml } from '../components/topics.js';
import { usersHtml } from '../components/users.js';
import { toast } from '../dom.js';
import { resetTopicExpandAll, topicViewState } from './topics.js';
let searchAbort = null;
let analyticsAbort = null;
let usageAbort = null;
let topicAbort = null;
let knowledgeAbort = null;
let usersAbort = null;
function isAbortError(error) {
    return error instanceof Error && error.name === 'AbortError';
}
/** 切换路由时取消所有在途请求 */
export function abortPageLoaders() {
    searchAbort?.abort();
    analyticsAbort?.abort();
    usageAbort?.abort();
    topicAbort?.abort();
    knowledgeAbort?.abort();
    usersAbort?.abort();
}
export async function loadSearch(route, version, ctx) {
    searchAbort = new AbortController();
    try {
        const core = ctx.activeCore(route);
        const response = await fetchSearch({ ...route, core }, searchAbort.signal);
        if (!ctx.isCurrent(version))
            return;
        const main = document.getElementById('main');
        if (!main)
            return;
        main.innerHTML = resultsHtml(route, response);
        ctx.onSearchRendered();
    }
    catch (error) {
        if (isAbortError(error) || !ctx.isCurrent(version))
            return;
        ctx.renderError(error);
    }
}
export async function loadAnalytics(route, version, ctx) {
    analyticsAbort = new AbortController();
    try {
        const to = new Date();
        const from = new Date(to.getTime() - (route.days - 1) * 86_400_000);
        const localDay = (date) => new Intl.DateTimeFormat('en-CA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(date);
        const data = await fetchAnalytics({
            from: localDay(from),
            to: localDay(to),
            core: route.core,
        }, analyticsAbort.signal);
        if (!ctx.isCurrent(version))
            return;
        const main = document.getElementById('main');
        if (!main)
            return;
        main.innerHTML = analyticsHtml(route, data, ctx.health);
    }
    catch (error) {
        if (isAbortError(error) || !ctx.isCurrent(version))
            return;
        ctx.renderError(error);
    }
}
export async function loadExternalUsage(route, version, ctx) {
    usageAbort = new AbortController();
    try {
        const to = new Date();
        const from = new Date(to.getTime() - (route.days - 1) * 86_400_000);
        const localDay = (date) => new Intl.DateTimeFormat('en-CA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(date);
        const data = await fetchExternalUsage({ from: localDay(from), to: localDay(to) }, usageAbort.signal);
        if (!ctx.isCurrent(version))
            return;
        const main = document.getElementById('main');
        if (!main)
            return;
        main.innerHTML = externalUsageHtml(route, data);
    }
    catch (error) {
        if (isAbortError(error) || !ctx.isCurrent(version))
            return;
        ctx.renderError(error);
    }
}
export async function loadTopics(route, version, ctx) {
    topicAbort = new AbortController();
    try {
        const [categories, search] = await Promise.all([
            fetchTopicCategories(topicAbort.signal),
            fetchTopics({
                q: route.q,
                categoryId: route.category,
                page: route.page,
                pageSize: 12,
            }, topicAbort.signal),
        ]);
        if (!ctx.isCurrent(version))
            return;
        const main = document.getElementById('main');
        if (!main)
            return;
        const topicState = topicViewState();
        main.innerHTML = topicsHtml({ categories, search }, route, ctx.isLoggedIn, 0, topicState.categoryFilter, topicState.expandAll);
        resetTopicExpandAll();
        initTopicTraces();
    }
    catch (error) {
        if (isAbortError(error) || !ctx.isCurrent(version))
            return;
        ctx.renderError(error);
    }
}
export async function loadKnowledge(_route, version, ctx) {
    knowledgeAbort = new AbortController();
    try {
        const categories = await fetchTopicCategories(knowledgeAbort.signal);
        if (!ctx.isCurrent(version))
            return;
        const main = document.getElementById('main');
        if (!main)
            return;
        main.innerHTML = knowledgeHtml(categories);
    }
    catch (error) {
        if (isAbortError(error) || !ctx.isCurrent(version))
            return;
        ctx.renderError(error);
    }
}
export async function loadUsers(version, ctx) {
    if (!ctx.isLoggedIn) {
        window.location.href = `/auth/login?returnTo=${encodeURIComponent('/#/admin/users')}`;
        return;
    }
    usersAbort = new AbortController();
    try {
        const data = await fetchUsers(usersAbort.signal);
        if (!ctx.isCurrent(version))
            return;
        const main = document.getElementById('main');
        if (!main)
            return;
        main.innerHTML = usersHtml(data);
        initUserAdmin(ctx);
    }
    catch (error) {
        if (isAbortError(error) || !ctx.isCurrent(version))
            return;
        ctx.renderError(error);
    }
}
function initUserAdmin(ctx) {
    const form = document.querySelector('[data-user-form]');
    if (!form)
        return;
    const status = form.querySelector('[data-user-status]');
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const username = String(data.get('username') ?? '').trim();
        const displayName = String(data.get('displayName') ?? '').trim();
        const password = String(data.get('password') ?? '');
        if (!username || !displayName || password.length < 8) {
            if (status)
                status.textContent = '请填写完整，密码至少 8 位';
            return;
        }
        const submit = form.querySelector('button[type="submit"]');
        if (submit)
            submit.disabled = true;
        if (status)
            status.textContent = '正在创建…';
        void createUser({ username, displayName, password })
            .then(() => {
            toast(`用户 ${username} 已创建`);
            ctx.rerender();
        })
            .catch((error) => {
            if (status)
                status.textContent = error instanceof Error ? error.message : '创建失败';
            if (submit)
                submit.disabled = false;
        });
    });
}
