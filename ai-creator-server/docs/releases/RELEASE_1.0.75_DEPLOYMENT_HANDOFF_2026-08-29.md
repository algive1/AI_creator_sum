# 1.0.75 生产发布交接

日期：2026-08-29（Asia/Shanghai）  
发布版本：`1.0.75`  
升级来源：生产 `1.0.74`

## 发布范围

- 以提交 `3a230d7` 构建服务端发布包；为避免将工作区未提交的文档带入生产，构建使用了独立的干净 Git worktree。
- 发布包包含 `server`、`admin-web`、`user-web` 和迁移；不包含 `uni-app`，本次未更新微信小程序构建产物。
- 发布包：`ai-creator-release-1.0.75.tar.gz`
- SHA-256：`d8d29a96cc7240faac039e31dde1e5af1a47da4d0bccf035a41f1f0dd965f287`
- 包类型：`server-admin-user-web`

## 本地打包与包校验

`bash scripts/build-release.sh 1.0.75` 成功完成。该脚本在 staging 源码中执行了管理端/用户端构建与 lint，以及服务端 lint、架构、支付、编码、迁移幂等、视频定价、小马参数和 TypeScript 构建检查。

随后独立执行 `scripts/inspect-release.sh`，确认：

- `release.json.version` 为 `1.0.75`；
- `server`、`admin-web` 和 `user-web` 的必需源码与静态构建产物完整；
- 未包含真实 `.env`、密钥、`node_modules`、运行时数据、Git/Codex 文件、备份或本地压缩包；
- `dist` 仅位于 `admin-web/dist` 和 `user-web/dist`。

## 生产更新结果

- 更新包已上传到 `/www/wwwroot/ai-creator/update-packages/`，服务器 SHA-256 与本地一致。
- 线上预检查全部通过：压缩包安全、版本递增、运行配置、磁盘、数据库迁移表、`mysqldump`、`curl` 和 PM2 均正常。
- 安装任务：`1.0.75_20260829014808`，最终状态：`success`。
- 已生成可恢复备份：
  - 数据库：`/www/wwwroot/ai-creator/backups/db/20260829014808_1.0.75.sql`
  - 旧代码：`/www/wwwroot/ai-creator/backups/code/20260829014809_1.0.74_1.0.75.tar.gz`
- `current` 已切换为 `/www/wwwroot/ai-creator/releases/1.0.75`。
- PM2 使用 `PM2_HOME=/www/wwwroot/ai-creator/.pm2`，`ai-creator` 状态为 `online`。
- `/health` 返回 `status=ok`、`releaseVersion=1.0.75`。
- 服务端、管理后台、用户网页端的 `dist/index.html` 均存在；本机 Host 路由与 `/login` 均返回 HTTP 200。

## 迁移核验

以下迁移均在 `schema_migrations` 中记录为 `success=1`：

- `20260828_001_model_catalog_hard_delete`
- `20260828_002_deactivate_empty_provider_tiers`
- `20260828_003_archive_and_delete_legacy_provider_models`

上线前识别到 4 条红鸟供应商的软删除历史模型和 4 个无可执行模型的活跃供应商档位。迁移后：

- 4 条历史模型已写入 `ai_model_catalog_archive` 并从活动目录清理；
- 红鸟、小马和 AGNES 供应商范围内不再存在软删除模型；
- 活跃但没有可执行模型的供应商档位数量为 0；
- 未涉及用户、订单或任务数据删除。

## 待处理风险：用户网页端 HTTPS 域名

此次版本切换正常，但发现既有生产域名配置与用户网页端默认 Host 不一致：

- 服务端未设置 `WEB_APP_HOSTS`，因此使用代码默认值 `ooa8.com,www.ooa8.com` 来分流用户网页端；
- 当前 Nginx 只配置 `mini.thtapi.com`，并使用仅包含该域名的 Let's Encrypt 证书；
- `https://mini.thtapi.com/` 和 `/login` 当前均返回 200，但会被服务端分流为管理后台；
- `https://ooa8.com/` 的 TLS 校验失败，原因是服务器返回的证书域名为 `mini.thtapi.com`。

如果 `ooa8.com` 是预期的用户创作工作台域名，需要单独配置 DNS、Nginx `server_name`、该域名的 SSL 证书，并在共享运行环境中明确设置 `WEB_APP_HOSTS=ooa8.com,www.ooa8.com` 后重启服务。此项未在本次发布中擅自修改，以免影响现有域名和证书。
