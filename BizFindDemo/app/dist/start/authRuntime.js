import { randomBytes } from 'node:crypto';
import express, {} from 'express';
import session from 'express-session';
import * as oidc from 'openid-client';
import { hasRole, rolesForGroups } from '../application/auth/roles.js';
import { SqliteSessionStore } from '../infrastructure/auth/SqliteSessionStore.js';
const COOKIE_NAME = 'bizfind.sid';
function safeReturnTo(value) {
    const raw = typeof value === 'string' ? value : '';
    if (!raw.startsWith('/') || raw.startsWith('//'))
        return '/';
    return raw;
}
function groupClaim(value) {
    if (Array.isArray(value))
        return value.filter((item) => typeof item === 'string');
    if (typeof value === 'string' && value.trim())
        return [value];
    return [];
}
function toAuthContext(claims) {
    const userId = String(claims.sub ?? '');
    const username = String(claims.preferred_username ?? claims.email ?? userId);
    const displayName = String(claims.name ?? username);
    const groups = groupClaim(claims.groups);
    return {
        provider: 'oidc',
        userId,
        username,
        displayName,
        groups,
        roles: rolesForGroups(groups),
    };
}
function saveSession(req) {
    return new Promise((resolve, reject) => {
        req.session.save((error) => (error ? reject(error) : resolve()));
    });
}
function regenerateSession(req) {
    return new Promise((resolve, reject) => {
        req.session.regenerate((error) => (error ? reject(error) : resolve()));
    });
}
function destroySession(req) {
    return new Promise((resolve, reject) => {
        req.session.destroy((error) => (error ? reject(error) : resolve()));
    });
}
export async function createAuthRuntime(config) {
    if (config.mode === 'oidc') {
        if (!config.issuer || !config.clientId || !config.clientSecret) {
            throw new Error('AUTH_MODE=oidc 但 OIDC issuer/client 配置不完整');
        }
        if (!config.sessionSecret) {
            throw new Error('AUTH_MODE=oidc 但缺少 SESSION_SECRET');
        }
    }
    const sessionSecret = config.sessionSecret || randomBytes(32).toString('hex');
    const store = new SqliteSessionStore(config.sessionDb, config.sessionTtlMinutes * 60_000);
    const sessionMiddleware = session({
        name: COOKIE_NAME,
        secret: sessionSecret,
        store,
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            secure: config.cookieSecure,
            path: '/',
            maxAge: config.sessionIdleMinutes * 60_000,
        },
    });
    const devAuth = {
        provider: 'dev',
        userId: config.devUser,
        username: config.devUser,
        displayName: config.devDisplayName,
        groups: config.devGroups,
        roles: rolesForGroups(config.devGroups),
    };
    const attachAuth = (req, _res, next) => {
        if (config.mode === 'dev') {
            req.auth = devAuth;
            next();
            return;
        }
        if (req.session.auth &&
            req.session.authStartedAt &&
            Date.now() - req.session.authStartedAt > config.sessionTtlMinutes * 60_000) {
            req.session.destroy(() => {
                delete req.auth;
                next();
            });
            return;
        }
        req.auth = req.session.auth;
        next();
    };
    const requireAuth = (req, res, next) => {
        if (req.auth) {
            next();
            return;
        }
        if (req.path.startsWith('/api/') || req.baseUrl.startsWith('/api')) {
            res.status(401).json({ error: 'Unauthorized', message: '请先登录', status: 401 });
            return;
        }
        const returnTo = req.originalUrl.startsWith('/') ? req.originalUrl : '/';
        res.redirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
    };
    const requireRole = (role) => (req, res, next) => {
        if (!req.auth) {
            requireAuth(req, res, next);
            return;
        }
        if (!hasRole(req.auth.roles, role)) {
            res.status(403).json({ error: 'Forbidden', message: '权限不足', status: 403 });
            return;
        }
        next();
    };
    let configuration = null;
    if (config.mode === 'oidc') {
        const localHttp = config.issuer.startsWith('http://127.0.0.1:') ||
            config.issuer.startsWith('http://localhost:');
        configuration = await oidc.discovery(new URL(config.issuer), config.clientId, config.clientSecret, undefined, localHttp ? { execute: [oidc.allowInsecureRequests] } : undefined);
    }
    const router = express.Router();
    router.get('/auth/login', async (req, res, next) => {
        try {
            if (config.mode === 'dev') {
                res.redirect(safeReturnTo(req.query.returnTo));
                return;
            }
            if (req.session.auth) {
                res.redirect(safeReturnTo(req.query.returnTo));
                return;
            }
            if (!configuration)
                throw new Error('OIDC 尚未初始化');
            const returnTo = safeReturnTo(req.query.returnTo);
            const codeVerifier = oidc.randomPKCECodeVerifier();
            const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
            const state = oidc.randomState();
            const nonce = oidc.randomNonce();
            req.session.oidc = { codeVerifier, state, nonce, returnTo };
            await saveSession(req);
            const url = oidc.buildAuthorizationUrl(configuration, {
                redirect_uri: config.redirectUri,
                scope: 'openid profile email',
                code_challenge: codeChallenge,
                code_challenge_method: 'S256',
                state,
                nonce,
            });
            res.redirect(url.href);
        }
        catch (error) {
            next(error);
        }
    });
    router.get('/auth/callback', async (req, res, next) => {
        try {
            if (config.mode === 'dev') {
                res.redirect('/');
                return;
            }
            if (!configuration)
                throw new Error('OIDC 尚未初始化');
            if (req.query.error) {
                res.status(400).type('text/plain; charset=utf-8').send(`登录失败：${String(req.query.error_description ?? req.query.error)}`);
                return;
            }
            const pending = req.session.oidc;
            if (!pending) {
                res.status(400).type('text/plain; charset=utf-8').send('登录状态已过期，请重新登录');
                return;
            }
            const currentUrl = new URL(req.originalUrl, `${req.protocol}://${req.get('host') ?? '127.0.0.1:5174'}`);
            const tokens = await oidc.authorizationCodeGrant(configuration, currentUrl, {
                pkceCodeVerifier: pending.codeVerifier,
                expectedState: pending.state,
                expectedNonce: pending.nonce,
            });
            const claims = tokens.claims();
            if (!claims?.sub) {
                res.status(400).type('text/plain; charset=utf-8').send('登录响应缺少 sub');
                return;
            }
            const auth = toAuthContext(claims);
            const returnTo = pending.returnTo;
            await regenerateSession(req);
            req.session.auth = auth;
            req.session.authStartedAt = Date.now();
            if (tokens.id_token)
                req.session.idToken = tokens.id_token;
            await saveSession(req);
            res.redirect(returnTo);
        }
        catch (error) {
            next(error);
        }
    });
    router.post('/auth/logout', async (req, res, next) => {
        try {
            const idToken = req.session.idToken;
            await destroySession(req);
            res.clearCookie(COOKIE_NAME, { path: '/' });
            let redirectTo = '/';
            if (idToken && configuration) {
                const endpoint = configuration.serverMetadata().end_session_endpoint;
                if (endpoint) {
                    const url = new URL(endpoint);
                    url.searchParams.set('id_token_hint', idToken);
                    url.searchParams.set('post_logout_redirect_uri', config.postLogoutRedirectUri);
                    url.searchParams.set('client_id', config.clientId);
                    redirectTo = url.href;
                }
            }
            if (req.get('accept')?.includes('application/json')) {
                res.json({ redirectTo });
                return;
            }
            res.redirect(redirectTo);
        }
        catch (error) {
            next(error);
        }
    });
    router.get('/api/me', (req, res) => {
        if (!req.auth) {
            res.status(401).json({ error: 'Unauthorized', message: '请先登录', status: 401 });
            return;
        }
        res.setHeader('Cache-Control', 'no-store');
        res.json(req.auth);
    });
    return {
        mode: config.mode,
        sessionMiddleware,
        attachAuth,
        requireAuth,
        requireRole,
        router,
        close: () => store.close(),
    };
}
//# sourceMappingURL=authRuntime.js.map