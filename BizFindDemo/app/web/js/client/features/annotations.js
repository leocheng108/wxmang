import { recordClick } from '../storage/readingStore.js';
import { deleteAnnotation, fetchAnnotationRecommendations, saveNote, updateAnnotationMark, } from '../api.js';
import { toast } from '../dom.js';
import { formatDateTime } from '../format.js';
import { buildSpans, locateOffset, resolveAnchor } from '../../domain/content/annotationAnchor.js';
import { MARK_GLYPH, MARK_KINDS, MARK_LABEL, familyOf, } from '../../domain/content/marks.js';
/**
 * 详情页批注：选区偏移锚点、行内标记、朱红浮动卡与连接线。
 * 只操作 DOM 与后端笔记接口，不依赖页面路由状态。
 */
export function initAnnotations(canWrite) {
    const doc = document.querySelector('.doc');
    const content = document.querySelector('[data-reading-content]');
    const layer = document.querySelector('[data-annotation-layer]');
    const floatLayer = document.querySelector('[data-annotation-float-layer]');
    const connectorLayer = document.querySelector('[data-annotation-connector-layer]');
    const dataScript = document.querySelector('[data-reading-annotations]');
    const composer = document.querySelector('[data-annotation-composer]');
    const addButton = document.querySelector('[data-annotation-add]');
    const quoteBox = document.querySelector('[data-annotation-quote]');
    const annotationInput = composer?.querySelector('[data-annotation-input]');
    const annotationStatus = composer?.querySelector('[data-annotation-status]');
    if (!doc || !content || !layer || !composer || !annotationInput)
        return;
    const docId = content.dataset.readingDocId ?? '';
    if (!docId)
        return;
    let annotations = [];
    try {
        annotations = JSON.parse(dataScript?.textContent ?? '[]');
    }
    catch {
        annotations = [];
    }
    let pending = null;
    // 只把正文段落算进偏移：续读条、标记层都插在正文容器里，
    // 若按整容器取文本，它们的文字会被算进偏移，导致所有锚点整体后移。
    const contentTextNodes = () => {
        const nodes = [];
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => (node.parentElement?.closest('.reading-resume, .annotation-layer')
                ? NodeFilter.FILTER_REJECT
                : NodeFilter.FILTER_ACCEPT),
        });
        let current = walker.nextNode();
        while (current) {
            nodes.push(current);
            current = walker.nextNode();
        }
        return nodes;
    };
    const textOffset = (node, offset) => {
        let position = 0;
        for (const textNode of contentTextNodes()) {
            if (textNode === node)
                return position + offset;
            if (textNode.contains(node))
                return position + offset;
            position += textNode.data.length;
        }
        return position + offset;
    };
    const rangeFromOffsets = (start, end) => {
        const nodes = contentTextNodes();
        let position = 0;
        let startNode = null;
        let startOffset = 0;
        let endNode = null;
        let endOffset = 0;
        let cursor = 0;
        let node = nodes[cursor] ?? null;
        while (node) {
            const next = position + node.data.length;
            if (!startNode && start >= position && start <= next) {
                startNode = node;
                startOffset = start - position;
            }
            if (!endNode && end >= position && end <= next) {
                endNode = node;
                endOffset = end - position;
            }
            if (startNode && endNode)
                break;
            position = next;
            cursor += 1;
            node = nodes[cursor] ?? null;
        }
        if (!startNode || !endNode)
            return null;
        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        return range;
    };
    /** 用文本节点数组和全局字符区间构造 Range */
    const rangeFromTextOffsets = (start, end) => {
        const nodes = contentTextNodes();
        const lengths = nodes.map((node) => node.data.length);
        const from = locateOffset(lengths, start, 'start');
        const to = locateOffset(lengths, end, 'end');
        if (!from || !to)
            return null;
        const range = document.createRange();
        range.setStart(nodes[from.node], from.offset);
        range.setEnd(nodes[to.node], to.offset);
        return range;
    };
    const rangeForAnnotation = (annotation) => {
        const start = annotation.startOffset ?? -1;
        const end = annotation.endOffset ?? -1;
        if (start < 0 || end <= start)
            return null;
        const nodes = contentTextNodes();
        const full = nodes.map((node) => node.data).join('');
        const parts = [...content.querySelectorAll(':scope > p')].map((paragraph) => paragraph.textContent ?? '');
        const { spans, total } = buildSpans(parts);
        const resolved = resolveAnchor({
            full,
            spans: total === full.length ? spans : [],
            quote: annotation.quote ?? '',
            startOffset: start,
            endOffset: end,
            paragraphIndex: annotation.paragraphIndex ?? 0,
        });
        annotation.paragraphIndex = resolved.paragraphIndex;
        return rangeFromTextOffsets(resolved.start, resolved.end);
    };
    const renderMarkers = () => {
        layer.replaceChildren();
        const rootRect = content.getBoundingClientRect();
        for (const annotation of annotations) {
            if (annotation.kind !== 'annotation')
                continue;
            if (annotation.startOffset === undefined || annotation.endOffset === undefined)
                continue;
            const range = rangeForAnnotation(annotation);
            if (!range)
                continue;
            const resolvedParagraph = (range.startContainer.parentElement ?? content).closest('p');
            if (resolvedParagraph) {
                const index = [...content.querySelectorAll(':scope > p')].indexOf(resolvedParagraph);
                if (index >= 0)
                    annotation.paragraphIndex = index;
            }
            const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
            // getClientRects 返回的是「行内盒片段」而非视觉行：同一行里跨 <mark>、换行或
            // 亚像素（125%/150% 缩放）都会给出 top 略有差异的多个 rect。
            // 用四舍五入的 top 当行号会把一行拆成两行，于是同一位置出现两条相位错开的圆点。
            // 这里改成按垂直重叠比例合并，一行只留一个 marker。
            const lines = [];
            for (const rect of rects) {
                const height = rect.bottom - rect.top;
                const existing = lines.find((line) => {
                    const overlap = Math.min(line.bottom, rect.bottom) - Math.max(line.top, rect.top);
                    return overlap > Math.min(line.bottom - line.top, height) * 0.5;
                });
                if (existing) {
                    existing.left = Math.min(existing.left, rect.left);
                    existing.right = Math.max(existing.right, rect.right);
                    existing.top = Math.min(existing.top, rect.top);
                    existing.bottom = Math.max(existing.bottom, rect.bottom);
                }
                else {
                    lines.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
                }
            }
            for (const line of lines) {
                const marker = document.createElement('span');
                marker.className = 'annotation-marker annotation-line-marker';
                marker.dataset.annotationId = annotation.id;
                marker.setAttribute('aria-hidden', 'true');
                marker.classList.add(`annotation-line-marker--${annotation.markFamily ?? 'mark'}`);
                marker.style.left = `${line.left - rootRect.left}px`;
                marker.style.top = `${line.bottom - rootRect.top - 1}px`;
                marker.style.width = `${Math.max(8, line.right - line.left)}px`;
                layer.append(marker);
            }
        }
    };
    // 右侧「相关文档」里按批注增量追加，上限 5 条，失败静默
    const relatedNote = document.querySelector('[data-annotation-related]');
    const relatedCard = document.querySelector('[data-related-card]');
    const relatedSeen = new Set();
    let relatedCount = 0;
    const appendRelated = (text) => {
        if (!relatedNote || relatedCount >= 5)
            return;
        void fetchAnnotationRecommendations(docId, text, 2)
            .then((result) => {
            if (!result || result.items.length === 0)
                return;
            if (relatedNote.dataset.headed !== "1") {
                const head = document.createElement('p');
                head.className = 'related-note__head';
                head.textContent = `因为你批了「${result.terms.slice(0, 2).join(" · ")}」`;
                relatedNote.append(head);
                relatedNote.dataset.headed = "1";
            }
            relatedNote.hidden = false;
            if (relatedCard)
                relatedCard.hidden = false;
            for (const item of result.items) {
                if (relatedCount >= 5)
                    break;
                if (relatedSeen.has(item.id))
                    continue;
                relatedSeen.add(item.id);
                relatedCount += 1;
                const link = document.createElement('a');
                link.className = 'related related--note';
                link.href = `#/doc/${item.id}`;
                const title = document.createElement('span');
                title.className = 'related__title';
                title.textContent = item.title;
                const meta = document.createElement('span');
                meta.className = 'related__meta';
                meta.textContent = `${item.sameAuthor ? "同作者" : "同主题"} · 命中 ${item.because.join("、")}`;
                link.append(title, meta);
                link.addEventListener('click', () => recordClick(item.id, 'annotation'));
                relatedNote.append(link);
            }
        })
            .catch(() => {
            // 静默：推荐失败不影响批注本身
        });
    };
    const closeMarkMenu = () => {
        document.querySelector('[data-mark-menu]')?.remove();
    };
    const openMarkMenu = (annotation, anchor) => {
        closeMarkMenu();
        const menu = document.createElement('div');
        menu.className = 'annotation-mark-menu';
        menu.dataset.markMenu = '1';
        for (const kind of MARK_KINDS) {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = `annotation-mark-menu__item${annotation.markKind === kind ? ' is-active' : ''}`;
            const glyph = document.createElement('span');
            glyph.className = 'annotation-mark-menu__glyph';
            glyph.textContent = MARK_GLYPH[familyOf(kind)];
            item.append(glyph, document.createTextNode(MARK_LABEL[kind]));
            item.addEventListener('click', () => {
                void updateAnnotationMark(annotation.id, kind)
                    .then((updated) => {
                    annotation.markKind = updated.markKind;
                    annotation.markFamily = updated.markFamily;
                    annotation.markSource = 'user';
                    closeMarkMenu();
                    renderMarkers();
                    renderFloatCards();
                })
                    .catch((error) => {
                    toast(error instanceof Error ? error.message : '修改笔法失败');
                });
            });
            menu.append(item);
        }
        const rect = anchor.getBoundingClientRect();
        menu.style.left = `${Math.max(8, Math.min(window.innerWidth - 190, rect.left - 40))}px`;
        const top = rect.bottom + 6 + 250 > window.innerHeight ? rect.top - 256 : rect.bottom + 6;
        menu.style.top = `${Math.max(8, top)}px`;
        document.body.append(menu);
    };
    const cardRects = new WeakMap();
    const drawConnector = (card, rect) => {
        if (!connectorLayer)
            return;
        const docRect = doc.getBoundingClientRect();
        const startX = card.offsetLeft + card.offsetWidth;
        const startY = card.offsetTop + Math.min(28, card.offsetHeight / 2);
        const endX = rect.left - docRect.left + 2;
        // 与圆点同一条视觉线（圆点画在标记条底部，约在文字下 5px）
        const endY = rect.bottom - docRect.top + 5;
        const midX = (startX + endX) / 2;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'annotation-connector');
        path.setAttribute('d', `M${startX} ${startY} C${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`);
        path.setAttribute('marker-end', 'url(#annotation-arrow)');
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('class', 'annotation-connector-dot');
        dot.setAttribute('cx', String(startX));
        dot.setAttribute('cy', String(startY));
        dot.setAttribute('r', '2.1');
        connectorLayer.append(dot, path);
    };
    /** 卡片避让：按原位置自上而下排，被前一张压住的顺势下移，再补画连线 */
    const resolveCardOverlaps = () => {
        if (!floatLayer || !connectorLayer)
            return;
        for (const node of [...connectorLayer.children]) {
            if (node.tagName.toLowerCase() !== 'defs')
                node.remove();
        }
        const cards = [...floatLayer.querySelectorAll('.annotation-float-card')].sort((a, b) => a.offsetTop - b.offsetTop);
        let cursor = 0;
        for (const card of cards) {
            const top = Math.max(card.offsetTop, cursor);
            if (top !== card.offsetTop)
                card.style.top = `${top}px`;
            cursor = top + card.offsetHeight + 8;
        }
        for (const card of cards) {
            const rect = cardRects.get(card);
            if (rect)
                drawConnector(card, rect);
        }
    };
    const renderFloatCards = () => {
        if (!floatLayer)
            return;
        floatLayer.replaceChildren();
        if (connectorLayer) {
            connectorLayer.replaceChildren();
            connectorLayer.setAttribute('viewBox', `0 0 ${Math.max(1, doc.offsetWidth)} ${Math.max(1, doc.scrollHeight)}`);
            connectorLayer.innerHTML = `<defs>
        <marker id="annotation-arrow" viewBox="0 0 8 8" refX="7" refY="4"
          markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L8 4 L0 8 Z" fill="#c8a66a"></path>
        </marker>
      </defs>`;
        }
        const docRect = doc.getBoundingClientRect();
        for (const annotation of annotations) {
            if (annotation.kind !== 'annotation')
                continue;
            if (annotation.startOffset === undefined || annotation.endOffset === undefined)
                continue;
            const range = rangeForAnnotation(annotation);
            if (!range)
                continue;
            const resolvedParagraph = (range.startContainer.parentElement ?? content).closest('p');
            if (resolvedParagraph) {
                const index = [...content.querySelectorAll(':scope > p')].indexOf(resolvedParagraph);
                if (index >= 0)
                    annotation.paragraphIndex = index;
            }
            const rect = [...range.getClientRects()].find((item) => item.width > 0);
            if (!rect)
                continue;
            const card = document.createElement('article');
            card.className = 'annotation-float-card';
            card.dataset.annotationId = annotation.id;
            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'annotation-float-card__delete';
            deleteButton.title = '删除批注';
            deleteButton.setAttribute('aria-label', '删除批注');
            deleteButton.textContent = '×';
            deleteButton.addEventListener('click', (event) => {
                event.stopPropagation();
                if (!window.confirm('删除这条批注？'))
                    return;
                deleteButton.disabled = true;
                void deleteAnnotation(annotation.id)
                    .then(() => {
                    annotations = annotations.filter((item) => item.id !== annotation.id);
                    renderMarkers();
                    renderFloatCards();
                    toast('批注已删除');
                })
                    .catch((error) => {
                    deleteButton.disabled = false;
                    toast(error instanceof Error ? error.message : '删除批注失败');
                });
            });
            card.append(deleteButton);
            const cardText = document.createElement('p');
            cardText.textContent = annotation.content;
            const time = document.createElement('time');
            time.dateTime = annotation.createdAt;
            time.textContent = formatDateTime(annotation.createdAt);
            card.append(cardText, time);
            const markButton = document.createElement('button');
            markButton.type = 'button';
            markButton.className = 'annotation-float-card__mark';
            markButton.dataset.annotationMark = annotation.id;
            markButton.title = '修改这条批注的笔法';
            const family = annotation.markFamily ?? familyOf(annotation.markKind ?? 'point');
            markButton.textContent = `${MARK_GLYPH[family]} ${MARK_LABEL[annotation.markKind ?? 'point']}`;
            markButton.addEventListener('click', (event) => {
                event.stopPropagation();
                openMarkMenu(annotation, markButton);
            });
            card.append(markButton);
            const linkButton = document.createElement('button');
            linkButton.type = 'button';
            linkButton.className = 'annotation-float-card__link';
            linkButton.textContent = '链接';
            linkButton.title = '复制这一段的链接';
            linkButton.addEventListener('click', (event) => {
                event.stopPropagation();
                const para = (annotation.paragraphIndex ?? 0) + 1;
                const url = `${window.location.origin}${window.location.pathname}#/doc/${annotation.docId}?p=${para}`;
                void navigator.clipboard
                    .writeText(url)
                    .then(() => toast('段落链接已复制'))
                    .catch(() => toast('复制失败，请手动复制地址栏'));
            });
            card.append(linkButton);
            const anchorTop = rect.top - docRect.top;
            card.style.top = `${Math.max(0, anchorTop)}px`;
            const cardWidth = Math.min(210, Math.max(0, docRect.left - 32));
            if (cardWidth < 140) {
                card.remove();
                continue;
            }
            card.style.width = `${cardWidth}px`;
            card.style.left = `${-(cardWidth + 16)}px`;
            floatLayer.append(card);
            cardRects.set(card, rect);
        }
        resolveCardOverlaps();
    };
    const closeComposer = () => {
        composer.hidden = true;
        if (addButton)
            addButton.hidden = true;
        pending = null;
        annotationInput.value = '';
        window.getSelection()?.removeAllRanges();
    };
    const openComposer = () => {
        if (!canWrite || !pending)
            return;
        if (addButton)
            addButton.hidden = true;
        quoteBox.textContent = `“${pending.quote}”`;
        annotationStatus.textContent = '';
        annotationInput.value = '';
        composer.hidden = false;
        const rect = rangeFromOffsets(pending.startOffset, pending.endOffset)?.getBoundingClientRect();
        if (rect) {
            const width = 320;
            const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left));
            const top = rect.bottom + 10 + 160 > window.innerHeight ? rect.top - 170 : rect.bottom + 10;
            composer.style.left = `${left}px`;
            composer.style.top = `${Math.max(12, top)}px`;
        }
        annotationInput.focus();
    };
    content.addEventListener('mouseup', () => {
        if (!canWrite)
            return;
        window.setTimeout(() => {
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
                if (addButton)
                    addButton.hidden = true;
                return;
            }
            const range = selection.getRangeAt(0);
            if (!content.contains(range.commonAncestorContainer)) {
                if (addButton)
                    addButton.hidden = true;
                return;
            }
            const raw = range.toString();
            if (!raw.trim()) {
                if (addButton)
                    addButton.hidden = true;
                return;
            }
            const leading = raw.length - raw.trimStart().length;
            const trailing = raw.length - raw.trimEnd().length;
            const startOffset = textOffset(range.startContainer, range.startOffset) + leading;
            const endOffset = textOffset(range.endContainer, range.endOffset) - trailing;
            if (endOffset <= startOffset) {
                toast('这段选不了，试着只选一句话');
                return;
            }
            // 必须与 textOffset 用同一套文本基准：content.textContent 里还含续读条，
            // 两边基准不一致会让“原文”和“偏移”互相错位几十个字。
            const fullText = contentTextNodes()
                .map((node) => node.data)
                .join('');
            const paragraph = (range.startContainer.parentElement ?? content).closest('p');
            const paragraphs = [...content.querySelectorAll(':scope > p')];
            pending = {
                startOffset,
                endOffset,
                quote: fullText.slice(startOffset, endOffset),
                prefix: fullText.slice(Math.max(0, startOffset - 24), startOffset),
                suffix: fullText.slice(endOffset, endOffset + 24),
                paragraphIndex: paragraph ? paragraphs.indexOf(paragraph) : 0,
            };
            if (addButton) {
                const rect = range.getBoundingClientRect();
                addButton.style.left = `${Math.max(12, Math.min(window.innerWidth - 112, rect.left))}px`;
                addButton.style.top = `${Math.max(12, Math.min(window.innerHeight - 38, rect.bottom + 8))}px`;
                addButton.hidden = false;
            }
        }, 0);
    });
    addButton?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openComposer();
    });
    document.addEventListener('mousedown', (event) => {
        if (!event.target.closest?.('[data-annotation-add], [data-annotation-composer]')) {
            if (addButton)
                addButton.hidden = true;
        }
    });
    composer.querySelector('[data-annotation-cancel]')?.addEventListener('click', closeComposer);
    composer.querySelector('[data-annotation-save]')?.addEventListener('click', () => {
        if (!pending)
            return;
        const text = annotationInput.value.trim();
        if (!text) {
            if (annotationStatus)
                annotationStatus.textContent = '请先写批注';
            return;
        }
        const anchor = pending;
        annotationInput.disabled = true;
        saveNote(docId, text, { kind: 'annotation', ...anchor })
            .then((result) => {
            annotations.push(result.note);
            closeComposer();
            renderMarkers();
            renderFloatCards();
            appendRelated(text);
        })
            .catch((error) => {
            if (annotationStatus) {
                annotationStatus.textContent = error instanceof Error ? error.message : '保存失败';
            }
        })
            .finally(() => {
            annotationInput.disabled = false;
        });
    });
    document.addEventListener('mousedown', (event) => {
        const node = event.target;
        if (!node?.closest?.('[data-mark-menu], [data-annotation-mark]'))
            closeMarkMenu();
    });
    document.addEventListener('click', (event) => {
        const trigger = event.target?.closest?.('[data-jump-annotation]');
        if (!trigger)
            return;
        event.preventDefault();
        const first = annotations.find((item) => item.kind === 'annotation');
        if (!first)
            return;
        const marker = document.querySelector('[data-annotation-id="' + first.id + '"]');
        const y = marker ? marker.getBoundingClientRect().top + window.scrollY - 120 : 0;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    });
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape')
            return;
        // 优先收起输入框，其次浮标菜单
        if (!composer.hidden) {
            closeComposer();
            return;
        }
        if (addButton && !addButton.hidden) {
            addButton.hidden = true;
            return;
        }
        closeMarkMenu();
    });
    renderMarkers();
    renderFloatCards();
    window.addEventListener('resize', () => {
        renderMarkers();
        renderFloatCards();
    });
    // 行高、字体、图片都会在首次绘制后改变正文高度；高度一变就重画，避免标记错位。
    // 标记层是绝对定位的，不会反过来影响正文高度，不存在循环触发。
    if (typeof ResizeObserver !== 'undefined') {
        let pendingFrame = false;
        const observer = new ResizeObserver(() => {
            if (pendingFrame)
                return;
            pendingFrame = true;
            requestAnimationFrame(() => {
                pendingFrame = false;
                renderMarkers();
                renderFloatCards();
            });
        });
        observer.observe(content);
    }
    if (typeof document !== 'undefined' && document.fonts) {
        void document.fonts.ready.then(() => {
            renderMarkers();
            renderFloatCards();
        });
    }
}
