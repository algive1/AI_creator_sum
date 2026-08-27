# 旧部署指南已废弃

本文件保留用于兼容旧链接，不再维护完整部署内容。

请改读：

- [DEPLOYMENT.md](DEPLOYMENT.md)：唯一主部署指南
- [BEGINNER_GUIDE.md](BEGINNER_GUIDE.md)：小白速查清单
- [INSTALL_UPDATE_RUNTIME.md](INSTALL_UPDATE_RUNTIME.md)：安装/更新运行目录结构

废弃原因：

- 旧版文档里存在版本号示例不一致。
- 旧版文档曾把安装向导步骤顺序写错。
- 旧版文档曾把后台更新写成 `pm2 reload` 零停机，但当前实现是删除旧 PM2 记录后从 `current/server/dist/index.js` 重新启动，并校验 `/health.releaseVersion`。

当前关键事实：

- 服务端发布包由 `scripts/build-release.sh` 生成。
- 发布包生成在 `ai-creator-server/ai-creator-release-<版本号>.tar.gz`。
- 发布包包含 `admin-web/dist` 和 `user-web/dist`，不包含 `server/dist`、`node_modules`、真实 `.env`、上传文件、日志、备份和小程序。
- 首次安装完成后运行入口是 `/www/wwwroot/ai-creator/current/server/dist/index.js`。
- 安装锁统一写入 `/www/wwwroot/ai-creator/shared/.env.installed`。
