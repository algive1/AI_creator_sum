# 文档索引

本目录只保留当前需要维护的少量文档。重复部署文档已经收敛到 `DEPLOYMENT.md`，旧入口只保留跳转说明。

## 阅读顺序

1. [DEPLOYMENT.md](DEPLOYMENT.md)
   唯一主部署指南：服务器首次部署、打包、后台更新、自检与常见问题。
2. [BEGINNER_GUIDE.md](BEGINNER_GUIDE.md)
   小白速查清单，只保留最短顺序和关键入口。
3. [INSTALL_UPDATE_RUNTIME.md](INSTALL_UPDATE_RUNTIME.md)
   安装向导和后台系统更新共用的 `APP_ROOT_DIR/shared/current/releases` 运行结构。
4. [API.md](API.md)
   小程序、安装向导、管理后台的当前接口索引。
5. [MINI_PROGRAM_API.md](MINI_PROGRAM_API.md)
   微信小程序端可直接对接的接口细节。
6. [AI_DEVELOPMENT_GUIDE.md](AI_DEVELOPMENT_GUIDE.md)
   微信小程序前端接入示例和页面开发建议。
7. [DEVELOPMENT.md](DEVELOPMENT.md)
   项目结构、开发约定、配置键、模型/会员/文件等核心逻辑说明。

`DEPLOYMENT_GUIDE.md` 是旧链接兼容页，不再维护部署细节。

## 当前事实

- 发布包只支持 `.tar.gz`，由 `scripts/build-release.sh` 生成。
- 发布包检查使用 `scripts/inspect-release.sh`。
- 打包阶段会重新安装依赖并执行 `admin-web`、`user-web` 的 lint/build，以及后端 lint/编码检查/build。
- 发布包包含从 staging 源码树生成的 `admin-web/dist` 和 `user-web/dist`；不包含 `server/dist`、`node_modules`、真实 `.env`、上传文件、日志、备份和本地压缩包。
- 发布包不包含 `uni-app`，小程序必须单独构建。
- 目标服务器在部署/更新时构建 `server` 和 `admin-web`，直接使用包内预构建并经预检查的 `user-web/dist`。
- 默认运行目录是 `/www/wwwroot/ai-creator`。
- 默认更新包目录是 `/www/wwwroot/ai-creator/update-packages`。
- 后台更新使用 `current` 软链接运行当前版本，安装锁统一在 `shared/.env.installed`。
## 专项运维

- [TASK_TIMEOUT_RECOVERY_20260619.md](TASK_TIMEOUT_RECOVERY_20260619.md)：图片/视频异步生成超时误判后的补查、补保存、积分纠正和 dry-run/apply 脚本说明。
