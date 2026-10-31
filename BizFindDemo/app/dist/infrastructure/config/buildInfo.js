import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
/**
 * 交付物里由打包脚本写入 build-info.json；
 * 开发环境没有该文件时回落到环境变量或 dev，保证 /api/version 永远可用。
 */
export function readBuildInfo() {
    const fallback = {
        version: process.env.APP_VERSION ?? '1.0.0',
        commit: process.env.APP_COMMIT ?? 'dev',
        builtAt: process.env.APP_BUILT_AT ?? '',
    };
    try {
        const raw = readFileSync(resolve(process.env.BUILD_INFO_FILE ?? 'build-info.json'), 'utf8');
        const parsed = JSON.parse(raw);
        return {
            version: parsed.version ?? fallback.version,
            commit: parsed.commit ?? fallback.commit,
            builtAt: parsed.builtAt ?? fallback.builtAt,
        };
    }
    catch {
        return fallback;
    }
}
//# sourceMappingURL=buildInfo.js.map