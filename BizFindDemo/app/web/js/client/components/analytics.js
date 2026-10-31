import { escapeHtml } from '../dom.js';
import { formatNumber } from '../format.js';
import { barChartSvg } from './barChart.js';
export function analyticsSkeleton() {
    return `<div class="analytics-page" aria-busy="true" aria-label="正在加载检索分析">
    <div class="skeleton skeleton--line" style="width: 220px"></div>
    <div class="skeleton skeleton--analytics"></div>
  </div>`;
}
function rangeText(days) {
    return `最近 ${days} 天`;
}
export function analyticsHtml(route, data, health) {
    const cores = (health?.cores ?? []).filter((core) => core.backend !== 'external');
    const maxKeyword = Math.max(1, ...data.topKeywords.map((item) => item.count));
    const maxCore = Math.max(1, ...data.byCore.map((item) => item.count));
    const daysOptions = [7, 30, 90, 180]
        .map((days) => `<option value="${days}" ${route.days === days ? 'selected' : ''}>${rangeText(days)}</option>`)
        .join('');
    const coreOptions = [
        `<option value="">全部 Core</option>`,
        ...cores.map((core) => `<option value="${escapeHtml(core.name)}" ${route.core === core.name ? 'selected' : ''}>${escapeHtml(core.label)}</option>`),
    ].join('');
    return `<div class="analytics-page">
    <div class="analytics-head">
      <div>
        <h1>内部检索分析</h1>
        <p>统计检索频率、热门关键词与 Core 分布，观察这个演示站的使用路径。</p>
      </div>
      <form class="analytics-filters" data-analytics-form>
        <label>范围 <select data-analytics-days>${daysOptions}</select></label>
        <label>Core <select data-analytics-core>${coreOptions}</select></label>
        <button class="btn btn--ghost" type="submit">刷新</button>
      </form>
    </div>

    <div class="analytics-stats">
      <div class="analytics-stat"><span>检索次数</span><strong>${formatNumber(data.total)}</strong></div>
      <div class="analytics-stat"><span>独立会话</span><strong>${formatNumber(data.sessions)}</strong></div>
      <div class="analytics-stat"><span>统计范围</span><strong>${escapeHtml(rangeText(route.days))}</strong></div>
    </div>

    <section class="analytics-card">
      <div class="analytics-card__head">
        <h2>每日检索频率</h2>
        <span>${data.series.length ? `${escapeHtml(data.series[0].date)} 至 ${escapeHtml(data.series[data.series.length - 1].date)}` : rangeText(route.days)}</span>
      </div>
      ${barChartSvg(data.series)}
    </section>

    <div class="analytics-grid">
      <section class="analytics-card">
        <div class="analytics-card__head"><h2>热门检索词</h2><span>Top ${data.topKeywords.length}</span></div>
        ${data.topKeywords.length
        ? `<ol class="analytics-keywords">${data.topKeywords
            .map((item, index) => `<li>
                    <span class="analytics-keywords__index">${index + 1}</span>
                    <span class="analytics-keywords__text">${escapeHtml(item.keyword)}</span>
                    <span class="analytics-keywords__track"><i style="width:${Math.round((item.count / maxKeyword) * 100)}%"></i></span>
                    <strong>${formatNumber(item.count)}</strong>
                  </li>`)
            .join('')}</ol>`
        : '<p class="analytics-empty">所选范围内还没有检索记录。</p>'}
      </section>

      <section class="analytics-card">
        <div class="analytics-card__head"><h2>Core 分布</h2><span>检索次数</span></div>
        ${data.byCore.length
        ? `<ul class="analytics-cores">${data.byCore
            .map((item) => `<li>
                    <span>${escapeHtml(item.core)}</span>
                    <span class="analytics-keywords__track"><i style="width:${Math.round((item.count / maxCore) * 100)}%"></i></span>
                    <strong>${formatNumber(item.count)}</strong>
                  </li>`)
            .join('')}</ul>`
        : '<p class="analytics-empty">暂无 Core 数据。</p>'}
      </section>
    </div>
  </div>`;
}
