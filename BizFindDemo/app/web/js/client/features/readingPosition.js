import { getDoc, markFinished, recordVisit, setProgress, } from '../storage/readingStore.js';
/**
 * 续读位置与阅读痕迹：
 * - 记住读到的进度（段落 + 比例）
 * - 记录「已读完」（滚到 95% 以上）
 * - 记录读过几次
 * 存储统一走 storage/readingStore，纯记录，不做评价与提醒。
 */
const MIN_RATIO = 0.03;
const MAX_RATIO = 0.9;
const FINISHED_RATIO = 0.95;
const countedThisMount = new Set();
/** 只有「中间进度」才值得下次继续 */
export function isResumable(position) {
    if (!position || !Number.isFinite(position.ratio))
        return false;
    return position.ratio >= MIN_RATIO && position.ratio <= MAX_RATIO;
}
/** 读到多少（0–100）；没有记录时返回 null */
export function readProgressPercent(docId) {
    const record = getDoc(docId);
    if (!record || !Number.isFinite(record.ratio))
        return null;
    return Math.round(record.ratio * 100);
}
/** 读完的时间；没读完返回 null */
export function readFinishedAt(docId) {
    return getDoc(docId)?.finishedAt ?? null;
}
/** 读过几次 */
export function readVisits(docId) {
    return getDoc(docId)?.visits ?? null;
}
export function initReadingPosition() {
    const content = document.querySelector('[data-reading-content]');
    const docId = content?.dataset.readingDocId ?? '';
    if (!content || !docId)
        return;
    const paragraphs = [...content.querySelectorAll('p[data-para]')];
    if (paragraphs.length === 0)
        return;
    const visits = countedThisMount.has(docId)
        ? (getDoc(docId)?.visits ?? null)
        : (() => {
            countedThisMount.add(docId);
            return recordVisit(docId).visits ?? null;
        })();
    const scrollMax = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const currentParagraph = () => {
        let current = 1;
        for (const paragraph of paragraphs) {
            if (paragraph.getBoundingClientRect().top <= 120) {
                current = Number(paragraph.dataset.para ?? '1');
            }
            else {
                break;
            }
        }
        return Math.min(current, Math.max(1, paragraphs.length - 1));
    };
    const saved = getDoc(docId);
    if (saved && isResumable({ ratio: saved.ratio ?? Number.NaN }) && (saved.para ?? 0) > 1) {
        const at = saved.at ?? new Date().toISOString();
        const days = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 86_400_000));
        const when = days <= 0 ? '今天' : `${days} 天前`;
        const bar = document.createElement('div');
        bar.className = 'reading-resume';
        const seal = document.createElement('span');
        seal.className = 'reading-resume__seal';
        seal.setAttribute('aria-hidden', 'true');
        seal.textContent = '续';
        const body = document.createElement('div');
        body.className = 'reading-resume__body';
        const main = document.createElement('p');
        main.className = 'reading-resume__main';
        main.append(document.createTextNode('上次读到 '));
        const pct = document.createElement('b');
        pct.className = 'reading-resume__pct';
        pct.textContent = `第 ${saved.para} 段`;
        const meta = document.createElement('span');
        meta.className = 'reading-resume__meta';
        const visitNote = visits && visits.count > 1 ? ` · 第 ${visits.count} 次读` : '';
        const totalNote = saved.total ? ` / 共 ${saved.total} 段` : '';
        const percentNote = `${Math.round(saved.ratio * 100)}%`;
        meta.textContent = `${totalNote ? totalNote.slice(3) : percentNote} · ${when}${visitNote}`;
        main.append(pct, meta);
        const track = document.createElement('span');
        track.className = 'reading-resume__track';
        const fill = document.createElement('span');
        fill.className = 'reading-resume__fill';
        fill.style.width = `${Math.min(100, Math.max(3, Math.round(saved.ratio * 100)))}%`;
        track.append(fill);
        body.append(main, track);
        const go = document.createElement('button');
        go.type = 'button';
        go.className = 'reading-resume__go';
        go.textContent = '继续';
        const targetRatio = saved.ratio;
        go.addEventListener('click', () => {
            const max = scrollMax();
            window.scrollTo({ top: Math.min(Math.max(0, targetRatio * max), max), behavior: 'smooth' });
            bar.remove();
        });
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'reading-resume__close';
        close.setAttribute('aria-label', '关闭');
        close.textContent = '×';
        close.addEventListener('click', () => bar.remove());
        bar.append(seal, body, go, close);
        content.prepend(bar);
    }
    let lastSave = 0;
    let userScrolled = false;
    const save = () => {
        if (!userScrolled)
            return;
        // 页面已切走：旧 DOM 已销毁，矩形全为 0，绝不能拿来算位置
        if (!content.isConnected || !content.offsetParent)
            return;
        const max = scrollMax();
        if (max <= 0)
            return;
        const ratio = Math.min(1, Math.max(0, window.scrollY / max));
        if (ratio >= FINISHED_RATIO)
            markFinished(docId);
        if (!isResumable({ ratio }))
            return;
        setProgress(docId, {
            para: currentParagraph(),
            total: paragraphs.length,
            ratio,
            title: document.querySelector('.doc__title')?.textContent?.trim() || undefined,
        });
    };
    window.addEventListener('scroll', () => {
        userScrolled = true;
        const now = Date.now();
        if (now - lastSave < 1200)
            return;
        lastSave = now;
        save();
    }, { passive: true });
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden')
            save();
    });
}
