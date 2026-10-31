import { randomBytes, randomUUID, scryptSync, timingSafeEqual, } from 'node:crypto';
import express, {} from 'express';
import session from 'express-session';
import { hasRole, rolesForGroups } from '../application/auth/roles.js';
import { SqliteSessionStore } from '../infrastructure/auth/SqliteSessionStore.js';
import { SqliteUserStore, } from '../infrastructure/auth/SqliteUserStore.js';
const COOKIE_NAME = 'bizfind.sid';
const SCRYPT_KEY_LENGTH = 64;
function escapeHtml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
function safeReturnTo(value) {
    const raw = typeof value === 'string' ? value : '';
    if (!raw.startsWith('/') || raw.startsWith('//'))
        return '/';
    return raw;
}
function hashPassword(password) {
    const salt = randomBytes(16).toString('base64url');
    const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH, {
        N: 16_384,
        r: 8,
        p: 1,
        maxmem: 32 * 1024 * 1024,
    }).toString('base64url');
    return `scrypt$${salt}$${hash}`;
}
function verifyPassword(password, stored) {
    const [algorithm, salt, encoded] = stored.split('$');
    if (algorithm !== 'scrypt' || !salt || !encoded)
        return false;
    try {
        const expected = Buffer.from(encoded, 'base64url');
        const actual = scryptSync(password, salt, expected.length, {
            N: 16_384,
            r: 8,
            p: 1,
            maxmem: 32 * 1024 * 1024,
        });
        return expected.length === actual.length && timingSafeEqual(expected, actual);
    }
    catch {
        return false;
    }
}
function toAuthContext(user) {
    const groups = user.role === 'admin' ? ['search-users', 'search-admins'] : ['search-users'];
    return {
        provider: 'local',
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
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
function loginPage(error, returnTo) {
    const message = error
        ? `<p class="login__error">${escapeHtml(error)}</p>`
        : '<p class="login__hint">演示账号由管理员创建，普通用户只能查看和批注。</p>';
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>登录 · 资料检索</title>
  <style>
    :root { color-scheme: light; --ink: #2d261c; --muted: #8b7c68; --line: #eadfce; --red: #a83226; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
      color: var(--ink); background: radial-gradient(circle at 12% 8%, #fff8eb 0, #f6efe3 42%, #eee5d7 100%);
      font-family: "Kaiti SC", "STKaiti", "KaiTi", "Noto Serif SC", serif; }
    .login { width: min(390px, 100%); padding: 30px 30px 26px; border: 1px solid var(--line);
      border-radius: 20px; background: rgba(255, 253, 248, .94);
      box-shadow: 0 24px 60px rgba(74, 52, 25, .12); }
    .seal { display: inline-grid; place-items: center; width: 40px; height: 40px; margin-bottom: 18px;
      border: 1px solid #c9a66b; border-radius: 50%; color: var(--red); font-size: 21px; }
    h1 { margin: 0 0 6px; font-size: 23px; font-weight: 600; letter-spacing: .04em; }
    .sub { margin: 0 0 22px; color: var(--muted); font-family: ui-monospace, Consolas, monospace; font-size: 10px; letter-spacing: .1em; }
    label { display: block; margin: 13px 0 6px; color: #796b58; font-size: 12px; }
    input { width: 100%; height: 40px; padding: 0 11px; border: 1px solid #decdb7; border-radius: 9px;
      outline: none; color: var(--ink); background: #fffdf8; font-family: inherit; font-size: 15px; }
    input:focus { border-color: #c69a5d; box-shadow: 0 0 0 3px rgba(198, 154, 93, .12); }
    button { width: 100%; height: 41px; margin-top: 20px; border: 0; border-radius: 9px;
      color: #fffaf1; background: var(--red); cursor: pointer; font-family: inherit; font-size: 15px; letter-spacing: .08em; }
    button:hover { background: #8f291f; }
    .login__hint { margin: 18px 0 0; color: var(--muted); font-size: 11px; line-height: 1.7; }
    .login__error { margin: 14px 0 0; padding: 8px 10px; border-radius: 7px; color: #9e2d22;
      background: #fff0eb; font-size: 12px; line-height: 1.6; }
    .login__foot { margin: 17px 0 0; color: #b0a18e; font-size: 10px; }
  </style>
</head>
<body>
  <main class="login">
    <div class="seal">阅</div>
    <h1>资料检索</h1>
    <p class="sub">DEMO EDITION · LOCAL ACCESS</p>
    <form method="post" action="/auth/login">
      <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">
      <label for="username">用户名</label>
      <input id="username" name="username" autocomplete="username" required autofocus>
      <label for="password">密码</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      ${message}
      <button type="submit">进入检索</button>
    </form>
    <p class="login__foot">内部演示系统 · 请勿使用真实敏感资料</p>
  </main>
</body>
</html>`;
}
export async function createLocalAuthRuntime(config) {
    if (!config.sessionSecret) {
        throw new Error('AUTH_MODE=local 但缺少 SESSION_SECRET');
    }
    if (!config.adminPassword || config.adminPassword.length < 8) {
        throw new Error('AUTH_MODE=local 但缺少足够强度的 DEMO_ADMIN_PASSWORD');
    }
    const store = new SqliteSessionStore(config.sessionDb, config.sessionTtlMinutes * 60_000);
    const users = new SqliteUserStore(config.userDb);
    const sessionMiddleware = session({
        name: COOKIE_NAME,
        secret: config.sessionSecret,
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
    if (!users.hasAdmin()) {
        const admin = users.create({
            id: `local-${randomUUID()}`,
            username: config.adminUser,
            passwordHash: hashPassword(config.adminPassword),
            displayName: '管理员',
            role: 'admin',
        });
        console.log(`[auth] 已创建演示管理员：${admin.username}`);
    }
    const attachAuth = (req, _res, next) => {
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
    const attempts = new Map();
    const isLimited = (ip) => {
        const now = Date.now();
        const item = attempts.get(ip);
        if (!item || item.resetAt <= now) {
            attempts.delete(ip);
            return false;
        }
        return item.count >= 8;
    };
    const recordFailure = (ip) => {
        const now = Date.now();
        const item = attempts.get(ip);
        if (!item || item.resetAt <= now) {
            attempts.set(ip, { count: 1, resetAt: now + 15 * 60_000 });
            return;
        }
        item.count += 1;
    };
    const router = express.Router();
    router.get('/auth/login', (req, res) => {
        const returnTo = safeReturnTo(req.query.returnTo);
        if (req.auth) {
            res.redirect(returnTo);
            return;
        }
        res.setHeader('Cache-Control', 'no-store');
        res.type('html').send(loginPage('', returnTo));
    });
    router.post('/auth/login', async (req, res, next) => {
        try {
            const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
            const returnTo = safeReturnTo(req.body?.returnTo);
            if (isLimited(ip)) {
                res
                    .status(429)
                    .type('html')
                    .send(loginPage('尝试次数过多，请 15 分钟后再试。', returnTo));
                return;
            }
            const username = String(req.body?.username ?? '').trim();
            const password = String(req.body?.password ?? '');
            const user = users.findByUsername(username);
            if (!user || !verifyPassword(password, user.passwordHash)) {
                recordFailure(ip);
                res
                    .status(401)
                    .type('html')
                    .send(loginPage('用户名或密码错误。', returnTo));
                return;
            }
            attempts.delete(ip);
            const auth = toAuthContext(user);
            await regenerateSession(req);
            req.session.auth = auth;
            req.session.authStartedAt = Date.now();
            await saveSession(req);
            res.redirect(returnTo);
        }
        catch (error) {
            next(error);
        }
    });
    router.post('/auth/logout', async (req, res, next) => {
        try {
            await destroySession(req);
            res.clearCookie(COOKIE_NAME, { path: '/' });
            if (req.get('accept')?.includes('application/json')) {
                res.json({ redirectTo: '/auth/login' });
                return;
            }
            res.redirect('/auth/login');
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
    const parseCreateUser = (req, res) => {
        const username = String(req.body?.username ?? '').trim();
        const password = String(req.body?.password ?? '');
        const displayName = String(req.body?.displayName ?? '').trim();
        if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
            res.status(400).json({ error: 'Bad Request', message: '用户名需为 3–32 位字母、数字、点、下划线或短横线', status: 400 });
            return null;
        }
        if (password.length < 8 || password.length > 128) {
            res.status(400).json({ error: 'Bad Request', message: '密码长度需为 8–128 位', status: 400 });
            return null;
        }
        if (!displayName || displayName.length > 40) {
            res.status(400).json({ error: 'Bad Request', message: '显示名不能为空且不能超过 40 字', status: 400 });
            return null;
        }
        return { username, password, displayName };
    };
    router.get('/api/admin/users', requireRole('search_admin'), (_req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.json({ users: users.list() });
    });
    router.post('/api/admin/users', requireRole('search_admin'), (req, res, next) => {
        try {
            const input = parseCreateUser(req, res);
            if (!input)
                return;
            if (users.findByUsername(input.username)) {
                res.status(409).json({ error: 'Conflict', message: '用户名已存在', status: 409 });
                return;
            }
            const user = users.create({
                id: `local-${randomUUID()}`,
                username: input.username,
                passwordHash: hashPassword(input.password),
                displayName: input.displayName,
                role: 'user',
            });
            res.status(201).json({ user });
        }
        catch (error) {
            if (error instanceof Error && /UNIQUE/.test(error.message)) {
                res.status(409).json({ error: 'Conflict', message: '用户名已存在', status: 409 });
                return;
            }
            next(error);
        }
    });
    return {
        mode: 'local',
        sessionMiddleware,
        attachAuth,
        requireAuth,
        requireRole,
        router,
        close: () => {
            users.close();
            store.close();
        },
    };
}
//# sourceMappingURL=localAuthRuntime.js.map