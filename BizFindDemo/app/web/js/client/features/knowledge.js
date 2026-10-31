/**
 * 知识树聚焦：把某个一级分类推到中心、隐藏其余分支；复位时恢复全景。
 * 纯 DOM 操作，不依赖页面路由状态。
 */
export function clearKnowledgeFocus() {
    const tree = document.querySelector('.knowledge-tree');
    if (!tree)
        return;
    tree.classList.remove('is-focused');
    for (const group of document.querySelectorAll('[data-knowledge-root-group]')) {
        group.classList.remove('is-hidden');
        group.removeAttribute('transform');
    }
    for (const line of document.querySelectorAll('.knowledge-focus-branch')) {
        line.remove();
    }
    for (const group of document.querySelectorAll('[data-knowledge-children]')) {
        group.classList.add('is-hidden');
    }
    for (const toggle of document.querySelectorAll('[data-knowledge-toggle]')) {
        toggle.setAttribute('aria-expanded', 'false');
    }
    for (const marker of document.querySelectorAll('[data-knowledge-marker]')) {
        marker.textContent = '+';
    }
    const note = document.querySelector('[data-knowledge-focus-note]');
    if (note) {
        note.hidden = true;
        note.textContent = '';
    }
}
export function focusKnowledgeBranch(toggle) {
    const tree = document.querySelector('.knowledge-tree');
    const id = toggle.getAttribute('data-knowledge-toggle') ?? '';
    const name = toggle.getAttribute('data-knowledge-name') ?? '当前分类';
    const branch = [...document.querySelectorAll('[data-knowledge-children]')].find((group) => group.getAttribute('data-knowledge-children') === id);
    const rootGroup = [...document.querySelectorAll('[data-knowledge-root-group]')].find((group) => group.getAttribute('data-knowledge-root-group') === id);
    if (!tree || !branch || !rootGroup)
        return;
    const sourceX = Number(rootGroup.getAttribute('data-knowledge-x') ?? 0);
    const sourceY = Number(rootGroup.getAttribute('data-knowledge-y') ?? 0);
    const targetX = 760;
    const targetY = 300;
    const color = rootGroup.getAttribute('data-knowledge-color') ?? '#2f5d8a';
    const focusLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    focusLine.setAttribute('class', 'knowledge-branch knowledge-focus-branch');
    focusLine.setAttribute('d', `M650 360 C680 360, ${targetX - 80} ${targetY + 40}, ${targetX} ${targetY}`);
    focusLine.setAttribute('stroke', color);
    tree.insertBefore(focusLine, rootGroup);
    rootGroup.setAttribute('transform', `translate(${targetX - sourceX} ${targetY - sourceY})`);
    for (const group of document.querySelectorAll('[data-knowledge-root-group]')) {
        group.classList.toggle('is-hidden', group !== rootGroup);
    }
    branch.classList.remove('is-hidden');
    toggle.setAttribute('aria-expanded', 'true');
    tree.classList.add('is-focused');
    document.querySelector(`[data-knowledge-marker="${id}"]`)?.replaceChildren('−');
    const note = document.querySelector('[data-knowledge-focus-note]');
    if (note) {
        note.hidden = false;
        note.textContent = `聚焦：${name} · 点击中心返回全景`;
    }
}
