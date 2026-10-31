import { fetchTopicTraces } from '../api.js';
/**
 * 分类阅读痕迹：在每个分类旁标出「我批过几篇」。
 * 纯记录（按 docId 聚合批注数），没有痕迹的分类不显示任何东西。
 */
export function initTopicTraces() {
    const rows = [...document.querySelectorAll('[data-topic-cat-id]')];
    if (rows.length === 0)
        return;
    const render = (traces) => {
        for (const row of rows) {
            const id = row.dataset.topicCatId ?? '';
            const count = traces[id] ?? 0;
            if (count <= 0)
                continue;
            const link = row.querySelector('.topic-category');
            if (!link || link.querySelector('.topic-category__traced'))
                continue;
            const badge = document.createElement('span');
            badge.className = 'topic-category__traced';
            badge.textContent = `你批过 ${count} 篇`;
            badge.title = `这个分类里有 ${count} 篇文档带你的批注`;
            link.append(badge);
        }
    };
    void fetchTopicTraces()
        .then((result) => render(result.traces ?? {}))
        .catch(() => {
        // 静默：没有痕迹就不显示
    });
}
