export function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
export function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
}
export function debounce(fn, delay) {
    let timer;
    return (...args) => {
        if (timer !== undefined)
            window.clearTimeout(timer);
        timer = window.setTimeout(() => {
            timer = undefined;
            fn(...args);
        }, delay);
    };
}
export function qs(selector, root = document) {
    return root.querySelector(selector);
}
let toastTimer;
export function toast(message) {
    document.querySelector('.toast')?.remove();
    const element = document.createElement('div');
    element.className = 'toast';
    element.textContent = message;
    document.body.append(element);
    requestAnimationFrame(() => element.classList.add('toast--in'));
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
        element.classList.remove('toast--in');
        window.setTimeout(() => element.remove(), 250);
    }, 2200);
}
export async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    }
    catch {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.append(area);
        area.select();
        let ok = false;
        try {
            ok = document.execCommand('copy');
        }
        catch {
            ok = false;
        }
        area.remove();
        return ok;
    }
}
