const PATHS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m16.4 16.4 4.1 4.1"/>',
    sparkle: '<path d="M12 3l1.7 4.8 4.8 1.7-4.8 1.7L12 16l-1.7-4.8L5.5 9.5l4.8-1.7L12 3Z"/><path d="M18.6 15l.8 2.2 2.1.8-2.1.8-.8 2.2-.8-2.2-2.1-.8 2.1-.8.8-2.2Z"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/>',
    hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    wand: '<path d="M4.5 19.5 16 8"/><path d="M15 3.5l.8 2.1 2.2.9-2.2.9-.8 2.1-.8-2.1-2.2-.9 2.2-.9.8-2.1Z"/><path d="M19.5 14l.6 1.6 1.7.7-1.7.7-.6 1.6-.6-1.6-1.7-.7 1.7-.7.6-1.6Z"/>',
    'arrow-right': '<path d="M4 12h16"/><path d="m14 6 6 6-6 6"/>',
    'arrow-left': '<path d="M20 12H4"/><path d="m10 18-6-6 6-6"/>',
    'arrow-up': '<path d="M12 20V4"/><path d="m6 10 6-6 6 6"/>',
    message: '<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 9 9 0 0 1-3.6-.8L3 21l1.8-5.4a8.5 8.5 0 1 1 16.2-4.1Z"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-right': '<path d="m9 6 6 6-6 6"/>',
    external: '<path d="M14 3h7v7"/><path d="M21 3l-9 9"/><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
    building: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3"/>',
    database: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    alert: '<path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5"/><path d="M12 17.2v.1"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    policy: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="m8 15 2 2 4-4"/>',
    contract: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9"/><path d="M14 3v6h6"/><path d="M15.5 20.5 21 15a2 2 0 0 0-2.8-2.8L12.7 17.7l-.6 3.4 3.4-.6Z"/>',
    finance: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18"/><circle cx="16.5" cy="15" r="1.2"/>',
    people: '<circle cx="9" cy="8" r="3.4"/><path d="M2.8 20c0-3.2 2.8-5.4 6.2-5.4s6.2 2.2 6.2 5.4"/><circle cx="17.2" cy="9" r="2.6"/><path d="M17 14.6c2.7.2 4.5 2 4.5 4.4"/>',
    product: '<path d="M21 8 12 3 3 8v8l9 5 9-5V8Z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/>',
    market: '<path d="M4 20V11M10 20V5M16 20v-6M22 20H2"/>',
    food: '<path d="M6 3v8M4 3v4a2 2 0 0 0 4 0V3M6 13v8"/><path d="M16 3c-2.2 0-3.5 2.2-3.5 5.2 0 2.5 1.3 4.3 3.5 4.3s3.5-1.8 3.5-4.3C19.5 5.2 18.2 3 16 3Z"/><path d="M16 12.5V21"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h6v18H6a2 2 0 0 1-2-2V5Z"/><path d="M20 5a2 2 0 0 0-2-2h-6v18h6a2 2 0 0 0 2-2V5Z"/>',
    filter: '<path d="M3 5h18l-7 8.2V20l-4 1.5v-8.3L3 5Z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5v.1"/>',
    link: '<path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 1 0-5.7-5.7L11.5 6.3"/><path d="M14 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 1 0 5.7 5.7l1.3-1.3"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V6l8-3Z"/><path d="m8.5 12 2.4 2.4 4.6-4.6"/>',
    sort: '<path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4"/>',
};
export function icon(name, size = 18, className = '') {
    return `<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
}
export function brandMark(size = 36, className = '') {
    return `<svg class="brand-mark ${className}" width="${size}" height="${size}" viewBox="0 0 48 48" role="img" aria-label="资料搜索">
    <path d="M24 4a20 20 0 0 1 20 20H24V4Z" fill="#4285f4" stroke="#fff" stroke-width="1.2"/>
    <path d="M44 24a20 20 0 0 1-20 20V24h20Z" fill="#ea4335" stroke="#fff" stroke-width="1.2"/>
    <path d="M24 44A20 20 0 0 1 4 24h20v20Z" fill="#fbbc05" stroke="#fff" stroke-width="1.2"/>
    <path d="M4 24A20 20 0 0 1 24 4v20H4Z" fill="#34a853" stroke="#fff" stroke-width="1.2"/>
    <circle cx="24" cy="24" r="8.4" fill="#fff"/>
    <path d="M30.4 30.4 38 38" stroke="#1a73e8" stroke-width="4.2" stroke-linecap="round"/>
  </svg>`;
}
