import { fetchSameCategoryRelated } from '../api.js';
import { recordClick } from '../storage/readingStore.js';
/**
 * 详情页「相关文档」：文档已归类时，展示同分类下的其他文档（最多 3 篇）。
 * 失败静默——没有分类或没有同类文档时，这一块保持不出现。
 */
export function initRelatedDocs() {
    const content = document.querySelector('[data-reading-content]');
    const card = document.querySelector('[data-related-card]');
    const target = document.querySelector('[data-related-category]');
    const docId = content?.dataset.readingDocId ?? '';
    if (!card || !target || !docId)
        return;
    target.replaceChildren();
    void fetchSameCategoryRelated(docId, 3)
        .then((result) => {
        if (!result || result.items.length === 0)
            return;
        const head = document.createElement('p');
        head.className = 'related-note__head';
        head.textContent = `同类：${result.categoryName ?? '未分类'}`;
        target.append(head);
        for (const item of result.items) {
            const link = document.createElement('a');
            link.className = 'related related--note';
            link.href = `#/doc/${item.id}`;
            link.addEventListener('click', () => recordClick(item.id, 'category'));
            const title = document.createElement('span');
            title.className = 'related__title';
            title.textContent = item.title;
            const meta = document.createElement('span');
            meta.className = 'related__meta';
            meta.textContent = `${item.author || '未知作者'} · ${item.updatedAt.slice(0, 10)}`;
            link.append(title, meta);
            target.append(link);
        }
        card.hidden = false;
    })
        .catch(() => {
        // 静默：没有分类推荐不影响阅读
    });
}
