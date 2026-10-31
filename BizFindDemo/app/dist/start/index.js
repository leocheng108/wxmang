import { createApp } from './app.js';
import { config } from '../infrastructure/config/AppConfig.js';
import { readBuildInfo } from '../infrastructure/config/buildInfo.js';
async function main() {
    const { app, runtime, auth } = await createApp();
    const server = app.listen(config.port, config.host, () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : config.port;
        const backend = runtime.service.backend === 'solr'
            ? `Solr · ${config.solr.baseUrl}/${config.solr.core}`
            : '内置演示索引（Solr 未连接）';
        console.log('');
        console.log('  资料搜索 BizFind · 企业业务检索引擎');
        console.log(`  本地访问   http://${config.host}:${port}`);
        console.log(`  检索后端   ${backend}`);
        const build = readBuildInfo();
        console.log(`  版本       ${build.version} (${build.commit})`);
        console.log(`  索引数据   ${runtime.mockDocCount} 篇示例文档`);
        if (runtime.service.backend === 'mock') {
            console.log('  提示       配置 SOLR_URL / SOLR_CORE 后重启即可切换到 Solr');
        }
        console.log('');
    });
    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`端口 ${config.port} 已被占用，可在 .env 中修改 PORT 后重试。`);
        }
        else {
            console.error('服务启动失败：', error);
        }
        process.exit(1);
    });
    let closing = false;
    const shutdown = (signal) => {
        if (closing)
            return;
        closing = true;
        console.log(`\n收到 ${signal}，正在关闭服务…`);
        server.close(() => {
            auth.close();
            void runtime.close().finally(() => process.exit(0));
        });
        setTimeout(() => process.exit(1), 5000).unref();
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}
main().catch((error) => {
    console.error('启动失败：', error instanceof Error ? error.message : error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map