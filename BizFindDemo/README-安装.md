# 资料搜索 BizFind · Demo 安装说明

这是一个**绿色包**：解开即用。客户机器上不需要安装 Node、Java 或 Solr。

## 一、目录里有什么

```text
BizFindDemo\
  start.cmd                启动（先起 Solr，再起应用）
  stop.cmd                 停止
  status.cmd               查看状态（版本、核心、Solr 连通性）
  reset-data.cmd           清空演示数据（笔记 / 分类 / 历史 / 会话）
  install-autostart.cmd    注册开机自启（需管理员）
  uninstall-autostart.cmd  取消开机自启（需管理员）
  app\                     应用：Node 服务 + 前端 + 本地数据库
  solr\                    检索服务（内含 wxmang_demo 索引，约 130 MB / 7 万篇）
  runtime\                 自带 node.exe 与 JRE 8（Solr 7.7.2 必须用 Java 8）
  首次登录口令.txt           管理员账号与随机口令
```

## 二、程序是怎么跑起来的

```text
start.cmd
  └─ start.ps1
       ├─ 1) 启动 Solr      runtime\jre8\bin\java.exe → solr\bin\solr.cmd -p <SOLR_URL 里的端口>
       │                    Solr 跑在独立进程里，数据在 solr\server\solr\wxmang_demo
       ├─ 2) 启动应用        runtime\node.exe app\dist\start\index.js
       │                    端口、Solr 地址、数据库路径全部来自 app\.env
       └─ 3) 等待就绪        轮询 /api/health，最多等 Solr 180 秒、应用 90 秒
```

两个进程互相独立：Solr 负责检索，Node 负责页面与接口。**关闭 start.cmd 的窗口不会停止服务**（服务在后台），要停止请用 `stop.cmd`。

## 三、第一次使用

1. 双击 `start.cmd`（无需管理员）。
2. 看到 `访问地址 http://127.0.0.1:5180` 即启动完成（首次约 20–60 秒，Solr 要加载索引）。
3. 浏览器打开 <http://127.0.0.1:5180>。
4. 管理员账号与口令见 `首次登录口令.txt`。
5. 登录后可进入「分类管理」「知识树」「用户管理」「链接导入」。

若要开机自启：双击 `install-autostart.cmd`（需管理员）。装好后重启机器无需任何人操作，服务会自己起来。

## 四、端口与数据

| 用途 | 位置 |
|---|---|
| 应用 | `http://127.0.0.1:5180`（见 `app\.env` 的 `PORT`） |
| Solr | `http://127.0.0.1:8983/solr`（见 `app\.env` 的 `SOLR_URL`） |
| 索引数据 | `solr\server\solr\wxmang_demo`（约 130 MB，7 万篇） |
| 用户 / 笔记 / 分类 / 历史 | `app\data\*.db` |
| 运行日志 | `app\logs\app.out.log`、`app\logs\app.err.log`、`solr\server\logs\` |

**备份**：直接复制整个目录即可；只想备份数据就复制 `app\data` 和 `solr\server\solr\wxmang_demo\data`。

## 五、常见操作

| 想做什么 | 怎么做 |
|---|---|
| 重启服务 | `stop.cmd` → `start.cmd` |
| 演示完恢复初始数据 | `reset-data.cmd`（会二次确认） |
| 忘记管理员密码 | 停止服务，删除 `app\data\users.db` 后启动，会按 `.env` 里的口令重建 admin |
| 换端口 | 改 `app\.env` 的 `PORT` 与 `SOLR_URL` 里的端口；`start.ps1` 会自动读取，无需改脚本 |
| 卸载 | 先 `uninstall-autostart.cmd`，再删除整个目录 |

## 六、排查

1. 先运行 `status.cmd`，确认 Solr 与应用是否都在监听。
2. 应用起不来：看 `app\logs\app.err.log`（常见原因：端口被占用）。
3. Solr 起不来：看 `solr\server\logs\solr.log` 与 `app\logs\solr.out.log`。
   包内已把 `SOLR_JAVA_HOME` 与 `JAVA_HOME` 都指向 `runtime\jre8`；若系统另有 Java 环境变量，请清理。
4. 页面能开但搜不到东西：`status.cmd` 里看「检索后端」是否为 `solr`。若是 `mock`，说明 Solr 未连通，
   此时应用会退回内置的 20 篇示例文档（仍可演示，但不是真实语料）。
5. 索引被误删：用 `app\scripts\reindex-core.mjs` 从备份重建。
