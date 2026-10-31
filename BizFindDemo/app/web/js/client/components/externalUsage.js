import { escapeHtml } from '../dom.js';
import { formatNumber } from '../format.js';
import { barChartSvg } from './barChart.js';
function money(value) {
    return `¥${value.toFixed(2)}`;
}
function rangeText(days) {
    return `最近 ${days} 天`;
}
export function externalUsageSkeleton() {
    return `<div class="analytics-page" aria-busy="true" aria-label="正在加载外部用量">
    <div class="skeleton skeleton--line" style="width: 220px"></div>
    <div class="skeleton skeleton--analytics"></div>
  </div>`;
}
function operationCard(title, data, hint) {
    return `<section class="analytics-card">
    <div class="analytics-card__head"><h2>${title}</h2><span>${escapeHtml(hint)}</span></div>
    <div class="usage-operation">
      <div><strong>${formatNumber(data.calls)}</strong><span>API 调用</span></div>
      <div><strong>${formatNumber(data.success)}</strong><span>成功计费</span></div>
      <div><strong>${formatNumber(data.empty)}</strong><span>空结果</span></div>
      <div><strong>${formatNumber(data.failure)}</strong><span>失败</span></div>
      <div><strong>${formatNumber(data.cacheHits)}</strong><span>缓存命中</span></div>
      <div><strong>${money(data.costYuan)}</strong><span>参考费用</span></div>
    </div>
  </section>`;
}
export function externalUsageHtml(route, data) {
    const daysOptions = [7, 30, 90, 180]
        .map((days) => `<option value="${days}" ${route.days === days ? 'selected' : ''}>${rangeText(days)}</option>`)
        .join('');
    const chartSeries = data.series.map((point) => ({
        date: point.date,
        count: point.searchCalls + point.fetchCalls,
    }));
    const rows = data.series
        .slice()
        .reverse()
        .filter((point) => point.searchCalls > 0 || point.fetchCalls > 0 || point.cacheHits > 0 || point.costYuan > 0);
    return `<div class="analytics-page">
    <div class="analytics-head">
      <div>
        <h1>外部 Web 用量</h1>
        <p>只统计 DeepSeek Search / Fetch 调用与缓存命中；与内部 Core 检索分析分开。</p>
      </div>
      <form class="analytics-filters" data-usage-form>
        <label>范围 <select data-usage-days>${daysOptions}</select></label>
        <a class="analytics-link" href="#/analytics">内部检索分析 →</a>
        <button class="btn btn--ghost" type="submit">刷新</button>
      </form>
    </div>

    <div class="analytics-stats">
      <div class="analytics-stat"><span>参考费用</span><strong>${money(data.totalCostYuan)}</strong></div>
      <div class="analytics-stat"><span>API 调用</span><strong>${formatNumber(data.search.calls + data.fetch.calls)}</strong></div>
      <div class="analytics-stat"><span>缓存命中</span><strong>${formatNumber(data.cacheHits)}</strong></div>
    </div>

    <section class="analytics-card">
      <div class="analytics-card__head">
        <h2>每日 API 调用</h2>
        <span>${escapeHtml(data.fromDay)} 至 ${escapeHtml(data.toDay)}</span>
      </div>
      ${barChartSvg(chartSeries)}
    </section>

    <div class="analytics-grid">
      ${operationCard('Search 调用', data.search, '按成功请求计费')}
      ${operationCard('Fetch 调用', data.fetch, '正文缺失时触发')}
    </div>

    <section class="analytics-card">
      <div class="analytics-card__head"><h2>每日明细</h2><span>不含缓存命中的计费</span></div>
      ${rows.length
        ? `<div class="usage-table-wrap"><table class="usage-table">
              <thead><tr>
                <th>日期</th><th>Search</th><th>Fetch</th><th>缓存命中</th><th>参考费用</th>
              </tr></thead>
              <tbody>${rows
            .map((point) => `<tr>
                    <td>${escapeHtml(point.date)}</td>
                    <td>${formatNumber(point.searchCalls)}</td>
                    <td>${formatNumber(point.fetchCalls)}</td>
                    <td>${formatNumber(point.cacheHits)}</td>
                    <td>${money(point.costYuan)}</td>
                  </tr>`)
            .join('')}</tbody>
            </table></div>`
        : '<p class="analytics-empty">所选范围内还没有外部调用记录。</p>'}
      <p class="analytics-note">参考费用按成功 Search/Fetch 各 5 元/1000 次估算；失败、空结果和缓存命中不计费。实际账单以 DeepSeek 平台为准。</p>
    </section>
  </div>`;
}
