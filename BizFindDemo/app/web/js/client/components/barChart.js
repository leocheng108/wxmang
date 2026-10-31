import { escapeHtml } from '../dom.js';
/**
 * 原生 SVG 柱状图：不引入图表库，适配当前“无打包器 + CSP self”的前端。
 */
export function barChartSvg(series, options = {}) {
    const width = options.width ?? 760;
    const height = options.height ?? 280;
    const margin = { top: 18, right: 16, bottom: 38, left: 42 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const maxCount = Math.max(1, ...series.map((item) => item.count));
    const ticks = 4;
    const slot = plotWidth / Math.max(1, series.length);
    const barWidth = Math.max(2, Math.min(22, slot * 0.62));
    const labelEvery = Math.max(1, Math.ceil(series.length / 9));
    const labelIndexes = new Set();
    for (let index = 0; index < series.length; index += labelEvery) {
        labelIndexes.add(index);
    }
    if (series.length > 0) {
        const last = series.length - 1;
        const previous = last - (last % labelEvery);
        if (previous !== last && last - previous < 2)
            labelIndexes.delete(previous);
        labelIndexes.add(last);
    }
    const grid = Array.from({ length: ticks + 1 }, (_, index) => {
        const value = Math.round((maxCount / ticks) * index);
        const y = margin.top + plotHeight - (value / maxCount) * plotHeight;
        return `<g class="bar-chart__grid">
      <line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>
      <text x="${margin.left - 8}" y="${y + 4}" text-anchor="end">${value}</text>
    </g>`;
    }).join('');
    const bars = series
        .map((item, index) => {
        const x = margin.left + index * slot + (slot - barWidth) / 2;
        const barHeight = item.count === 0 ? 0 : Math.max(1, (item.count / maxCount) * plotHeight);
        const y = margin.top + plotHeight - barHeight;
        const label = labelIndexes.has(index)
            ? `<text class="bar-chart__label" x="${x + barWidth / 2}" y="${height - 14}" text-anchor="middle">${escapeHtml(item.date.slice(5))}</text>`
            : '';
        return `<g class="bar-chart__bar" aria-label="${escapeHtml(item.date)} ${item.count} 次">
        <title>${escapeHtml(item.date)}：${item.count} 次</title>
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="3"></rect>
        ${label}
      </g>`;
    })
        .join('');
    return `<svg class="bar-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="每日检索频率柱状图">
    ${grid}
    <line class="bar-chart__axis" x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${width - margin.right}" y2="${margin.top + plotHeight}"></line>
    ${bars}
    <text class="bar-chart__y-title" x="12" y="${margin.top + plotHeight / 2}" transform="rotate(-90 12 ${margin.top + plotHeight / 2})" text-anchor="middle">次数</text>
  </svg>`;
}
