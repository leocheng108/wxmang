import { buildAdminUsersHash, buildAnalyticsHash, buildHomeHash, buildKnowledgeHash, buildNotesHash, buildTopicsHash } from '../router.js';
import { escapeHtml } from '../dom.js';
import { formatNumber } from '../format.js';
import { brandMark, icon } from '../icons.js';
import { searchBoxHtml } from './searchBox.js';
export function statusPill(health, coreName) {
    const coreBackend = health?.cores?.find((core) => core.name === coreName)?.backend;
    const backend = coreBackend ?? health?.backend ?? null;
    const label = backend === 'solr'
        ? 'Solr 已连接'
        : backend === 'external'
            ? '外部搜索'
            : backend === 'mock'
                ? '演示索引'
                : '检测中';
    const modifier = backend === 'solr'
        ? 'is-solr'
        : backend === 'external'
            ? 'is-external'
            : backend === 'mock'
                ? 'is-mock'
                : 'is-loading';
    return `<button class="status-pill ${modifier}" data-status type="button"
    title="查看索引与 Solr 连接状态" aria-label="查看索引状态">
    <span class="status-pill__dot"></span><span class="status-pill__text">${label}</span>
  </button>`;
}
function corePicker(route, health, canSelect) {
    if (route.name === 'analytics' || route.name === 'externalUsage')
        return '';
    const cores = health?.cores ?? [];
    if (!canSelect) {
        const current = cores.find((core) => core.name === health?.defaultCore);
        return `<span class="core-picker core-picker--static">
      <span class="core-picker__label">索引</span>
      <strong>${escapeHtml(current?.label ?? 'wxmang 论坛')}</strong>
    </span>`;
    }
    if (cores.length <= 1)
        return '';
    const selected = route.core ?? health?.defaultCore ?? cores[0]?.name;
    return `<label class="core-picker" title="选择检索 Core">
    <span class="core-picker__label">索引</span>
    <select data-core-select aria-label="选择检索 Core">
      ${cores
        .map((core) => `<option value="${escapeHtml(core.name)}" ${core.name === selected ? 'selected' : ''}>${escapeHtml(core.label)}</option>`)
        .join('')}
    </select>
  </label>`;
}
function userControl(user) {
    if (!user)
        return '';
    const initial = escapeHtml(user.displayName.trim().slice(0, 1) || '用');
    return `<span class="user-chip" title="${escapeHtml(user.username)}">
    <span class="user-chip__avatar">${initial}</span>
    <span class="user-chip__name">${escapeHtml(user.displayName)}</span>
    <button class="user-chip__logout" data-logout type="button" aria-label="退出登录">退出</button>
  </span>`;
}
function authControl(user) {
    if (user)
        return userControl(user);
    const returnTo = encodeURIComponent(window.location.pathname + window.location.hash);
    return `<a class="topbar__link topbar__link--login" href="/auth/login?returnTo=${returnTo}">登录</a>`;
}
function adminLinks(route, user) {
    if (!user?.roles.includes('search_admin'))
        return '';
    const analyticsHref = buildAnalyticsHash({ days: 30, core: route.core ?? null });
    return `<a class="topbar__link" href="${analyticsHref}">检索分析</a>
    <a class="topbar__link" href="/admin/site.html">链接导入</a>
    <a class="topbar__link" href="${buildAdminUsersHash()}">用户管理</a>`;
}
export function siteHeader(route, health, user = null) {
    if (route.name === 'home') {
        return `<header class="topbar topbar--home">
      <div class="topbar__actions">
        ${corePicker(route, health, Boolean(user))}
        <a class="topbar__link" href="${buildKnowledgeHash()}">知识树</a>
        <a class="topbar__link" href="${buildTopicsHash()}">分类管理</a>
        ${user ? `<a class="topbar__link" href="${buildNotesHash()}">我的笔记</a>` : ''}
        ${adminLinks(route, user)}
        ${user ? '<button class="topbar__link" data-status type="button">检索配置</button>' : ''}
        ${authControl(user)}
        ${user ? statusPill(health, route.core) : ''}
      </div>
    </header>`;
    }
    return `<header class="topbar">
    <a class="brand brand--small" href="${buildHomeHash(route.core ?? health?.defaultCore)}" aria-label="返回首页">
      ${brandMark(32)}<span class="brand__name">资料搜索</span>
    </a>
    <div class="topbar__search">${searchBoxHtml({
        variant: 'compact',
        value: route.name === 'search' || route.name === 'detail' ? route.q : '',
    })}</div>
    <div class="topbar__actions">
      ${corePicker(route, health, Boolean(user))}
      <a class="topbar__link" href="${buildKnowledgeHash()}">知识树</a>
      <a class="topbar__link" href="${buildTopicsHash()}">分类管理</a>
      ${user ? `<a class="topbar__link" href="${buildNotesHash()}">我的笔记</a>` : ''}
      ${adminLinks(route, user)}
      ${user && route.name !== 'externalUsage' ? statusPill(health, route.core) : ''}
      ${authControl(user)}
    </div>
  </header>`;
}
export function siteFooter(health, coreName) {
    const core = coreName ?? health?.solr.core;
    const coreInfo = health?.cores?.find((item) => item.name === core);
    const coreLabel = coreInfo?.label;
    const labelSuffix = coreLabel && coreLabel !== core ? ` · ${coreLabel}` : '';
    const external = coreInfo?.backend === 'external';
    return `<footer class="site-footer">
    <div class="site-footer__inner">
      <div class="site-footer__brand">
        ${brandMark(22)}<span>资料搜索 BizFind</span><span class="site-footer__sep">·</span><span>企业业务检索演示</span>
      </div>
      <div class="site-footer__meta">
        <span>${external ? '数据来自 DeepSeek 外部检索' : health?.backend === 'solr' ? '数据来自 Solr 索引' : '示例数据均为虚构'}</span><span class="dot"></span>
        <span>${core ? `${external ? '外部源' : 'Core'} ${escapeHtml(core)}${labelSuffix}` : '内置演示索引'}</span>
        <span class="dot"></span><span>v${escapeHtml(health?.version ?? '1.0.0')}</span>
      </div>
    </div>
  </footer>`;
}
export function statusDialogHtml(health, stats = null) {
    const solr = health?.solr;
    const coreName = stats?.core ?? solr?.core ?? '—';
    const coreLabel = stats?.coreLabel ?? coreName;
    const coreHealth = health?.cores?.find((item) => item.name === coreName);
    const isExternal = (stats?.backend ?? coreHealth?.backend ?? health?.backend) === 'external';
    const isSolr = (stats?.backend ?? coreHealth?.backend ?? health?.backend) === 'solr';
    const reachable = coreHealth?.reachable ?? solr?.reachable ?? false;
    const docCount = isSolr ? (stats?.docCount ?? 0) : isExternal ? 0 : (health?.mock.docCount ?? 0);
    const docLabel = isExternal ? '外部结果' : isSolr ? 'Solr 文档' : '内置文档';
    const backendLabel = isExternal ? 'DeepSeek 外部搜索' : isSolr ? 'Solr' : '内置演示索引';
    return `<div class="dialog__head">
      <div>
        <h2>检索与索引配置</h2>
        <p>前端与 API 不变，只需切换后端实现。</p>
      </div>
      <button class="icon-btn" data-close-dialog type="button" aria-label="关闭">${icon('close', 18)}</button>
    </div>
    <div class="dialog__body">
      <div class="status-grid">
        <div><span>当前后端</span><strong>${backendLabel}</strong></div>
        <div><span>${docLabel}</span><strong>${isExternal ? '实时' : `${formatNumber(docCount)} 篇`}</strong></div>
        <div><span>Solr 地址</span><code>${escapeHtml(isExternal ? 'api.deepseek.com' : (solr?.url ?? '—'))}</code></div>
        <div><span>当前 Core</span><code>${escapeHtml(coreName)}</code></div>
        <div><span>Core 名称</span><strong>${escapeHtml(coreLabel)}</strong></div>
        <div><span>连通状态</span><strong class="${reachable ? 'is-ok' : 'is-warn'}">${reachable ? '可用' : '未连接'}</strong></div>
        <div><span>探测耗时</span><strong>${solr?.latencyMs != null ? `${solr.latencyMs} ms` : '—'}</strong></div>
      </div>
      ${solr?.error ? `<p class="dialog__error">${escapeHtml(solr.error)}</p>` : ''}
      <p class="dialog__hint">服务启动时会自动探测 Solr：连接成功即使用 Solr 检索，失败则回退到内置索引。修改 <code>.env</code> 后重启生效。</p>
      <pre class="dialog__code">SOLR_ENABLED=true
SOLR_URL=${escapeHtml(solr?.url ?? 'http://127.0.0.1:8983/solr')}
SOLR_CORES=wxmang,wuJun,gameTheory
SOLR_CORE=${escapeHtml(coreName)}</pre>
      <p class="dialog__hint">真实交互点：<code>src/infrastructure/search/solr/SolrClient.ts</code>、<code>SolrSearchAdapter.ts</code>；字段映射见 <code>solr/README.md</code>。</p>

      <div class="dialog__section">
        <h3>本机记录</h3>
        <p class="dialog__hint">续读位置、阅读痕迹、最近搜索、置顶分类都只存在这台机器的浏览器里，不占服务器数据。</p>
        <button class="btn btn--ghost" type="button" data-clear-local>清除本机记录</button>
      </div>
    </div>`;
}
