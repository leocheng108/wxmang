import express from 'express';
import { join } from 'node:path';
import { config } from '../infrastructure/config/AppConfig.js';
import { createApiRouter } from '../adapter/http/routes.js';
import { createSearchRuntime } from './searchRuntime.js';
import { createLocalAuthRuntime } from './localAuthRuntime.js';
import { createSiteIngestRouter } from './siteIngestRuntime.js';
export async function createApp() {
    const [runtime, auth] = await Promise.all([
        createSearchRuntime(config),
        createLocalAuthRuntime(config.auth),
    ]);
    const app = express();
    app.disable('x-powered-by');
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'same-origin');
        res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'");
        next();
    });
    app.use(express.json({ limit: '64kb' }));
    app.use(express.urlencoded({ extended: false, limit: '16kb' }));
    app.use(auth.sessionMiddleware);
    app.use(auth.attachAuth);
    app.use(auth.router);
    app.use(createSiteIngestRouter(config, auth.requireRole));
    const publicCoreOnly = (req, res, next) => {
        if (req.auth) {
            next();
            return;
        }
        const requested = Array.isArray(req.query.core)
            ? req.query.core[0]
            : req.query.core;
        const core = runtime.resolveCoreName(typeof requested === 'string' ? requested : undefined);
        if (core === runtime.defaultCore) {
            next();
            return;
        }
        res.status(401).json({ error: 'Unauthorized', message: '请先登录后再使用该 Core', status: 401 });
    };
    app.use((req, res, next) => {
        if (!req.path.startsWith('/api')) {
            next();
            return;
        }
        const started = performance.now();
        res.on('finish', () => {
            const elapsed = Math.round(performance.now() - started);
            console.log(`[api] ${req.method} ${req.originalUrl} → ${res.statusCode} (${elapsed}ms)`);
        });
        next();
    });
    // 公共能力：只开放 wxmang 的检索、联想、统计与详情。
    app.use('/api/search', publicCoreOnly);
    app.use('/api/suggest', publicCoreOnly);
    app.use('/api/stats', publicCoreOnly);
    app.use('/api/doc', publicCoreOnly);
    app.use('/api/topics', publicCoreOnly);
    // 其他功能要求登录。
    app.use('/api/cores', auth.requireAuth);
    app.use('/api/history', auth.requireAuth);
    app.use('/api/analytics', auth.requireRole('search_admin'));
    app.use('/api/external/usage', auth.requireRole('search_admin'));
    app.use('/api', createApiRouter(runtime));
    const requireAdminPage = (req, res, next) => {
        if (req.auth?.roles.includes('search_admin')) {
            next();
            return;
        }
        const returnTo = req.originalUrl.startsWith('/') ? req.originalUrl : '/';
        res.redirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
    };
    app.get('/admin/site.html', requireAdminPage, (_req, res) => {
        res.sendFile(join(config.webDir, 'ingest-site.html'));
    });
    app.use(express.static(config.webDir, {
        index: 'index.html',
        extensions: ['html'],
        maxAge: config.nodeEnv === 'production' ? '1h' : 0,
    }));
    // 前端使用 hash 路由，这里只兜底真实路径直达与刷新
    app.use((req, res, next) => {
        if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.includes('.')) {
            next();
            return;
        }
        res.sendFile(join(config.webDir, 'index.html'), (error) => {
            if (error)
                next(error);
        });
    });
    app.use((_req, res) => {
        res.status(404).type('text/plain; charset=utf-8').send('404 Not Found');
    });
    return { app, runtime, auth };
}
//# sourceMappingURL=app.js.map