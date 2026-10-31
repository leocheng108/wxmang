import { escapeHtml } from '../dom.js';
import { formatDate, formatNumber } from '../format.js';
import { brandMark, icon } from '../icons.js';
import { buildSearchHash } from '../router.js';
import { searchBoxHtml } from './searchBox.js';
const CATEGORY_META = {
    制度与流程: {
        icon: 'policy',
        query: '制度 流程',
        description: '管理办法、审批链路与合规要求',
    },
    合同与法务: {
        icon: 'contract',
        query: '合同审批',
        description: '合同模板、用印与风险条款',
    },
    财务与报销: {
        icon: 'finance',
        query: '差旅报销',
        description: '报销标准、发票与预算规则',
    },
    人力与行政: {
        icon: 'people',
        query: '新员工入职',
        description: '入职、考勤、绩效与员工服务',
    },
    产品与技术: {
        icon: 'product',
        query: '产品 发布',
        description: '产品能力、研发流程与开放 API',
    },
    市场与客户: {
        icon: 'market',
        query: '客户 续约',
        description: '市场洞察、客户成功与案例',
    },
    教育: {
        icon: 'people',
        query: '教育',
        description: '教育话题、升学与讨论',
    },
    美食: {
        icon: 'food',
        query: '美食',
        description: '饮食文化、菜谱与探店',
    },
    易经: {
        icon: 'book',
        query: '易经',
        description: '易经与传统经典',
    },
};
const FALLBACK_CATEGORIES = Object.keys(CATEGORY_META).slice(0, 6);
const FALLBACK_HOT = [
    '差旅报销标准',
    '合同审批流程',
    '供应商准入',
    '数据安全分级',
    '新员工入职清单',
];
const EXTERNAL_HOT = [
    'DeepSeek 最新模型',
    'AI Agent 趋势',
    'TypeScript 2026',
    '企业知识管理',
    '数据安全',
    '开源项目',
];
function categoryCard(name, count, query, course = false, external = false) {
    const meta = CATEGORY_META[name];
    return `<a class="category-card" href="${buildSearchHash({ q: query })}">
    <span class="category-card__icon">${icon(meta?.icon ?? 'grid', 20)}</span>
    <span class="category-card__body">
      <strong>${escapeHtml(name)}</strong>
      <span>${escapeHtml(external
        ? '通过 DeepSeek 检索外部网页'
        : (meta?.description ?? (course ? '按课程检索' : '浏览该标签下的内容')))}</span>
    </span>
    ${external ? '' : `<span class="category-card__count">${formatNumber(count)}<small>篇</small></span>`}
  </a>`;
}
function capability(iconName, title, description) {
    return `<div class="capability">
    <span class="capability__icon">${icon(iconName, 18)}</span>
    <div><strong>${title}</strong><p>${description}</p></div>
  </div>`;
}
export function homeHtml(stats, health, recent, core, canConfigure = true) {
    const isDemo = stats?.demo !== false;
    const activeCore = health?.cores?.find((item) => item.name === core) ??
        health?.cores?.find((item) => item.name === health?.defaultCore);
    const coreName = activeCore?.name ?? health?.solr.core ?? core ?? 'wxmang';
    const coreLabel = activeCore?.label ?? coreName;
    const isCourseCore = coreName === 'wuJun' || coreName === 'gameTheory';
    const activeBackend = stats?.backend ?? activeCore?.backend ?? health?.backend;
    const isExternal = activeBackend === 'external';
    const counts = new Map((stats?.categories ?? []).map((item) => [item.name, item.count]));
    const names = isExternal
        ? [...EXTERNAL_HOT]
        : isDemo
            ? [...FALLBACK_CATEGORIES]
            : (stats?.categories ?? []).map((item) => item.name);
    if (isDemo && !isExternal) {
        for (const category of stats?.categories ?? []) {
            if (!names.includes(category.name))
                names.push(category.name);
        }
    }
    const categories = names
        .slice(0, isExternal ? 6 : isDemo || isCourseCore ? 12 : 6)
        .map((name) => ({
        name,
        count: counts.get(name) ?? 0,
        query: isDemo && !isExternal ? (CATEGORY_META[name]?.query ?? name) : name,
    }));
    const hot = isExternal
        ? EXTERNAL_HOT
        : stats?.hotQueries?.length
            ? stats.hotQueries
            : isDemo
                ? FALLBACK_HOT
                : categories.map((category) => category.name);
    const docCount = stats?.docCount ?? health?.mock.docCount ?? 0;
    const unitLabel = isExternal ? '主题' : isDemo ? '业务域' : isCourseCore ? '课程' : '标签';
    const docUnit = isExternal ? '条外部结果' : isDemo ? '篇文档' : '篇内容';
    const browseTitle = isExternal
        ? '外部 Web 热门检索'
        : isDemo
            ? '按业务域浏览'
            : isCourseCore
                ? '按课程浏览'
                : '按标签浏览';
    const updated = stats?.updatedAt ? formatDate(stats.updatedAt) : '—';
    return `<div class="home ${isCourseCore ? 'home--courses' : ''}">
    <section class="hero">
      <div class="hero__badge">${icon('sparkle', 14)} 智能匹配 · 中文分词 · 同义词扩展</div>
      <div class="hero__brand">${brandMark(56)}<h1>资料搜索</h1></div>
      <p class="hero__tagline">${isExternal
        ? '实时检索外部网页，结果可查看正文。'
        : `在 <span>${formatNumber(docCount)}</span> ${docUnit}中，用自然语言找到你要的答案。`}</p>
      <div class="hero__search">${searchBoxHtml({ variant: 'hero' })}</div>
      <div class="hero__actions">
        <button class="btn btn--primary" data-submit-search type="button">开始检索 ${icon('arrow-right', 16)}</button>
        <a class="btn btn--ghost" href="${buildSearchHash({ q: hot[0] ?? '东北' })}">${isExternal ? '热门检索' : isDemo ? '热门知识' : '热门标签'}</a>
      </div>
      <div class="hero__hot">
        <span class="hero__hot-label">${icon('trend', 15)} ${isExternal ? '外部热门' : '大家在搜'}</span>
        <div class="chips">${hot
        .slice(0, 6)
        .map((query) => `<a class="chip" href="${buildSearchHash({ q: query })}">${escapeHtml(query)}</a>`)
        .join('')}</div>
      </div>
      <div class="hero__highlights">
        ${isExternal
        ? '<span class="hero__highlight"><i class="hero__dot hero__dot--blue"></i>DeepSeek 实时</span>'
        : `<span class="hero__highlight"><i class="hero__dot hero__dot--blue"></i>${formatNumber(docCount)} ${docUnit}</span>`}
        <span class="hero__highlight"><i class="hero__dot hero__dot--green"></i>${isExternal ? `${coreLabel}` : activeBackend === 'solr' ? `${coreLabel} · Solr` : '内置演示索引'}</span>
        <span class="hero__highlight"><i class="hero__dot hero__dot--yellow"></i>${isExternal ? '点击结果查看正文' : '中文分词'}</span>
      </div>
    </section>

    <section class="home-body">
      <div class="panel">
        <div class="panel__head">
          <div>
            <h2>${browseTitle}</h2>
            <p>${isExternal ? '由 DeepSeek 实时检索外部网页，不写入内部索引；点击结果查看正文，详情可打开原文。' : isDemo ? '从熟悉的业务场景出发，找到对应的制度、模板与案例。' : isCourseCore ? '按课程进入，快速定位某讲内容。' : '从热门标签进入，快速定位相关内容。'}</p>
          </div>
          <span class="panel__meta">${isExternal
        ? 'DeepSeek 实时 · 不写入索引'
        : `${categories.length} 个${unitLabel} · ${formatNumber(docCount)} ${docUnit}`}</span>
        </div>
        <div class="home-resume" data-resume-dock hidden>
        <button class="home-resume__handle" type="button" data-resume-toggle aria-expanded="false">续读</button>
        <div class="home-resume__panel" data-resume-panel hidden>
          <p class="home-resume__title">接着读</p>
          <ol class="home-resume__list" data-resume-list></ol>
        </div>
      </div>

      <div class="category-grid">${categories
        .map((item) => categoryCard(item.name, item.count, item.query, isCourseCore, isExternal))
        .join('')}</div>
      </div>

      <aside class="home-aside">
        <div class="side-card side-card--status">
          <div class="side-card__head">
            <h3>索引状态</h3>
            <span class="side-card__time">${updated}</span>
          </div>
          <div class="index-stats">
            ${isExternal
        ? `<div><strong>实时</strong><span>外部结果</span></div>
                   <div><strong>DeepSeek</strong><span>检索后端</span></div>
                   <div><strong>不写入</strong><span>Solr 索引</span></div>`
        : `<div><strong>${formatNumber(docCount)}</strong><span>${docUnit}</span></div>
                   <div><strong>${categories.length}</strong><span>个${unitLabel}</span></div>
                   <div><strong>${activeBackend === 'solr' ? 'Solr' : '内置'}</strong><span>检索后端</span></div>`}
          </div>
          <p class="side-card__note">${isExternal
        ? '通过 DeepSeek Search API 实时检索；结果支持正文查看，详情页可打开原网页。'
        : activeBackend === 'solr'
            ? `已连接 Solr / ${escapeHtml(coreName)}，高亮、分面与标题命中实时返回。`
            : '未连接 Solr，正在使用内置演示索引；配置后自动切换。'}</p>
          <button class="text-btn" data-status type="button" ${canConfigure ? '' : 'hidden'}>查看检索配置 ${icon('chevron-right', 14)}</button>
        </div>

        <div class="side-card">
          <div class="side-card__head">
            <h3>最近搜索</h3>
            ${recent.length > 0 ? `<button class="text-btn text-btn--muted" data-clear-recent type="button">清除</button>` : ''}
          </div>
          ${recent.length > 0
        ? `<div class="chips chips--col">${recent
            .map((query) => `<a class="chip chip--ghost" href="${buildSearchHash({ q: query })}">${icon('clock', 14)}${escapeHtml(query)}</a>`)
            .join('')}</div>`
        : `<p class="side-card__empty">还没有搜索记录，试试上方的热门标签。</p>`}
        </div>
      </aside>
    </section>

    <section class="capabilities">
      ${isExternal
        ? `${capability('external', 'DeepSeek 实时检索', '由 DeepSeek Search API 返回实时网页结果，按相关性排序。')}
             ${capability('link', '正文与原文', '详情页优先展示 DeepSeek 正文，也可一键打开原网页。')}
             ${capability('database', '不写入索引', '外部结果不写入 Solr，不影响内部三个 Core。')}`
        : `${capability('sparkle', '中文分词与同义扩展', '基于词表与 bigram 召回，近义表达也能命中。')}
             ${capability('wand', '短语优先', '先完整短语，0 条才回退分词检索，结果标注匹配方式。')}
             ${capability('database', 'Solr 可插拔', '现有 Core 直接接入，检索字段与字段映射可配置。')}`}
    </section>
  </div>`;
}
