export const GROUP_ROLE_MAP = {
    'search-users': 'search_user',
    'search-admins': 'search_admin',
    'external-search': 'external_search',
    auditors: 'auditor',
};
export function rolesForGroups(groups) {
    return [...new Set(groups.map((group) => GROUP_ROLE_MAP[group]).filter(Boolean))];
}
export function hasRole(roles, role) {
    return roles.includes(role);
}
export function canSearch(roles) {
    return roles.some((role) => role === 'search_user' || role === 'search_admin' || role === 'auditor');
}
//# sourceMappingURL=roles.js.map