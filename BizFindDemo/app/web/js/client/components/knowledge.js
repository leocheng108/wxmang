import { escapeHtml } from '../dom.js';
import { formatNumber } from '../format.js';
import { buildTopicsHash } from '../router.js';
const PALETTE = [
    '#2f5d8a',
    '#2f7d72',
    '#8c6d4f',
    '#a05a3a',
    '#7b4f6d',
    '#5f7d5a',
    '#8a6a3d',
    '#4f627d',
    '#6b6f8a',
];
function colorFor(name) {
    let hash = 0;
    for (let index = 0; index < name.length; index += 1) {
        hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
    }
    return PALETTE[hash % PALETTE.length];
}
function radius(count) {
    return Math.max(7, Math.min(24, 6 + Math.sqrt(count) * 1.0));
}
function linkFor(category) {
    return buildTopicsHash({ category: category.id });
}
function nodeSvg(category, x, y, side, child = false, hasChildren = false) {
    const r = child ? 5.5 : radius(category.count);
    const color = colorFor(category.name);
    const labelX = side === 'left' ? x - r - 14 : x + r + 14;
    const anchor = side === 'left' ? 'end' : 'start';
    const label = escapeHtml(category.name);
    const count = `${formatNumber(category.count)} 篇`;
    const markerX = side === 'left' ? x + r * 0.65 : x - r * 0.65;
    const markerY = y - r * 0.65;
    return `<a class="knowledge-link" href="${linkFor(category)}" aria-label="${label}，${count}"
    ${hasChildren ? `data-knowledge-toggle="${escapeHtml(category.id)}" data-knowledge-name="${escapeHtml(category.name)}" aria-expanded="false"` : ''}>
    <title>${label} · ${count}${child ? ' · 二级分类' : ''}${hasChildren ? ' · 点击展开二级' : ''}</title>
    ${child ? '' : `<circle cx="${x}" cy="${y}" r="${r + 7}" fill="${color}" fill-opacity=".10" />`}
    ${child
        ? `<rect x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" rx="1.5" fill="${color}" transform="rotate(45 ${x} ${y})" stroke="#f6f1e8" stroke-width="1.5" />`
        : `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" fill-opacity=".94" stroke="#f6f1e8" stroke-width="2" />`}
    ${hasChildren
        ? `<circle class="knowledge-branch-badge" cx="${markerX}" cy="${markerY}" r="6.5" fill="#f6f1e8" stroke="${color}" stroke-width="1" />
         <text class="knowledge-branch-marker" data-knowledge-marker="${escapeHtml(category.id)}" x="${markerX}" y="${markerY + 3}" text-anchor="middle">+</text>`
        : ''}
    <text class="knowledge-node__name ${child ? 'is-child' : ''}" x="${labelX}" y="${y + 1}" text-anchor="${anchor}">${label}</text>
    <text class="knowledge-node__count" x="${labelX}" y="${y + (child ? 16 : 19)}" text-anchor="${anchor}">${count}${child ? ' · 二级' : ''}</text>
  </a>`;
}
function categorySvg(category, side, rootX, rootY, x, y, childrenByParent) {
    const color = colorFor(category.name);
    const children = childrenByParent.get(category.id) ?? [];
    const bend = side === 'left' ? -70 : 70;
    const parentLine = `<path class="knowledge-branch" d="M${rootX} ${rootY} C${rootX + bend} ${rootY}, ${x} ${(rootY + y) / 2}, ${x} ${y}" stroke="${color}" />`;
    const childParts = children.map((child, childIndex) => {
        const childX = side === 'left' ? x - 48 : x + 48;
        const childY = y + 40 + childIndex * 30;
        return `<path class="knowledge-branch knowledge-branch--child" d="M${x} ${y} C${x} ${y + 10}, ${childX} ${childY - 8}, ${childX} ${childY}" stroke="${color}" />
      ${nodeSvg(child, childX, childY, side, true)}`;
    });
    const childGroup = children.length
        ? `<g class="knowledge-children is-hidden" data-knowledge-children="${escapeHtml(category.id)}">${childParts.join('')}</g>`
        : '';
    return `<g class="knowledge-root-branch" data-knowledge-root-group="${escapeHtml(category.id)}"
    data-knowledge-x="${x}" data-knowledge-y="${y}" data-knowledge-color="${color}">
    ${parentLine}${childGroup}${nodeSvg(category, x, y, side, false, children.length > 0)}
  </g>`;
}
export function knowledgeSkeleton() {
    return `<div class="knowledge-page" aria-busy="true" aria-label="正在加载分类知识树">
    <div class="skeleton skeleton--line" style="width: 220px"></div>
    <div class="skeleton skeleton--title"></div>
    <div class="knowledge-canvas knowledge-canvas--skeleton">
      <div class="skeleton skeleton--card"></div>
    </div>
  </div>`;
}
export function knowledgeHtml(data) {
    const categories = data.categories;
    const roots = categories.filter((category) => !category.parentId);
    const childrenByParent = new Map();
    for (const category of categories) {
        if (!category.parentId)
            continue;
        const children = childrenByParent.get(category.parentId) ?? [];
        children.push(category);
        childrenByParent.set(category.parentId, children);
    }
    const half = Math.ceil(roots.length / 2);
    const left = roots.slice(0, half);
    const right = roots.slice(half);
    const maxRows = Math.max(left.length, right.length, 1);
    const startY = 70;
    const rowGap = Math.min(80, 560 / maxRows);
    const rootX = 600;
    const rootY = 360;
    const leftX = 344;
    const rightX = 856;
    const levelCount = childrenByParent.size > 0 ? 2 : 1;
    const svg = `<svg class="knowledge-tree" viewBox="0 0 1200 720" role="img" aria-label="全部分类知识树">
    <circle class="knowledge-root-halo" cx="${rootX}" cy="${rootY}" r="82" />
    <circle class="knowledge-root-halo knowledge-root-halo--dash" cx="${rootX}" cy="${rootY}" r="103" />
    <a class="knowledge-link knowledge-link--root" href="${buildTopicsHash()}" data-knowledge-root aria-label="全部主帖">
      <title>全部主帖 · ${formatNumber(data.totalRoots)} 篇</title>
      <circle cx="${rootX}" cy="${rootY}" r="43" fill="#263039" />
      <text class="knowledge-root__name" x="${rootX}" y="${rootY - 3}" text-anchor="middle">wxmang</text>
      <text class="knowledge-root__count" x="${rootX}" y="${rootY + 17}" text-anchor="middle">${formatNumber(data.totalRoots)} 篇</text>
    </a>
    ${left
        .map((category, index) => categorySvg(category, 'left', rootX, rootY, leftX, startY + index * rowGap, childrenByParent))
        .join('')}
    ${right
        .map((category, index) => categorySvg(category, 'right', rootX, rootY, rightX, startY + index * rowGap, childrenByParent))
        .join('')}
  </svg>`;
    return `<div class="knowledge-page">
    <header class="knowledge-head">
      <div>
        <span class="knowledge-eyebrow">wxmang · topic archive</span>
        <h1>分类知识树</h1>
        <p>全部分类 × 主帖体量。点击一级分类展开二级，再点击二级进入对应分类。</p>
      </div>
      <div class="knowledge-stats">
        <div><strong>${formatNumber(categories.length)}</strong><span>分类</span></div>
        <div><strong>${formatNumber(data.totalRoots)}</strong><span>主帖</span></div>
        <div><strong>${levelCount}</strong><span>层级</span></div>
        <div><strong>${formatNumber(data.uncategorizedRoots)}</strong><span>未分类</span></div>
      </div>
    </header>
    <div class="knowledge-canvas">
      ${svg}
      <div class="knowledge-focus-note" data-knowledge-focus-note hidden></div>
    </div>
    <footer class="knowledge-foot">
      <div class="knowledge-legend">
        <span><i class="knowledge-dot"></i>一级分类</span>
        <span><i class="knowledge-diamond"></i>二级分类</span>
        <span><i class="knowledge-line"></i>节点面积 = 主帖数量</span>
      </div>
      <span>同一主帖可归入多个分类 · 综合杂谈 ${formatNumber(categories.find((category) => category.name === '综合杂谈')?.count ?? 0)} 篇待细分</span>
    </footer>
  </div>`;
}
