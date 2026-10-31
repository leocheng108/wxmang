import { getPrefs, setPrefs } from '../storage/readingStore.js';
const LAYOUTS = ['tight', 'normal', 'wide'];
const LAYOUT_LABEL = { tight: '紧凑', normal: '标准', wide: '宽松' };
function apply(prefs) {
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    root.dataset.layout = prefs.layout;
}
/** 启动时尽早调用，避免先亮后暗 */
export function applyReadingPrefs() {
    apply(getPrefs());
}
export function initReadingControls() {
    const actions = document.querySelector('.doc__actions');
    if (!actions || actions.querySelector('[data-reading-controls]'))
        return;
    const box = document.createElement('div');
    box.className = 'reading-controls';
    box.dataset.readingControls = '1';
    const themeButton = document.createElement('button');
    themeButton.type = 'button';
    themeButton.className = 'reading-controls__btn';
    themeButton.dataset.readingTheme = '1';
    const layoutButton = document.createElement('button');
    layoutButton.type = 'button';
    layoutButton.className = 'reading-controls__btn';
    layoutButton.dataset.readingLayout = '1';
    const LAYOUT_SHORT = { tight: '紧', normal: '中', wide: '宽' };
    const sync = () => {
        const prefs = getPrefs();
        const night = prefs.theme === 'night';
        themeButton.textContent = night ? '日' : '夜';
        themeButton.title = night ? '切回纸白' : '换成夜纸';
        themeButton.classList.toggle('is-on', night);
        themeButton.setAttribute('aria-pressed', night ? 'true' : 'false');
        layoutButton.textContent = `Aa ${LAYOUT_SHORT[prefs.layout]}`;
        layoutButton.title = `字号与行宽：${LAYOUT_LABEL[prefs.layout]}（点击切换）`;
        layoutButton.classList.toggle('is-on', prefs.layout !== 'normal');
        layoutButton.setAttribute('aria-pressed', prefs.layout !== 'normal' ? 'true' : 'false');
    };
    themeButton.addEventListener('click', (event) => {
        event.preventDefault();
        const theme = getPrefs().theme === 'night' ? 'paper' : 'night';
        const next = setPrefs({ theme });
        apply(next);
        sync();
    });
    layoutButton.addEventListener('click', (event) => {
        event.preventDefault();
        const current = getPrefs().layout;
        const layout = LAYOUTS[(LAYOUTS.indexOf(current) + 1) % LAYOUTS.length];
        const next = setPrefs({ layout });
        apply(next);
        sync();
    });
    box.append(themeButton, layoutButton);
    actions.append(box);
    sync();
}
