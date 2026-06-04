# 文档索引

本目录只保留当前需要维护的少量文档。旧的部署、接口、配置、会员等重复文档已经合并到下面这些文件中。

## 阅读顺序

1. [DEPLOYMENT.md](DEPLOYMENT.md)
   服务器首次部署、打包、后台更新、自检与常见问题。
2. [API.md](API.md)
   小程序、安装向导、管理后台的当前接口索引。
3. [MINI_PROGRAM_API.md](MINI_PROGRAM_API.md)
   微信小程序端可直接对接的接口细节。
4. [AI_DEVELOPMENT_GUIDE.md](AI_DEVELOPMENT_GUIDE.md)
   微信小程序前端接入示例和页面开发建议。
5. [DEVELOPMENT.md](DEVELOPMENT.md)
   项目结构、开发约定、配置键、模型/会员/文件等核心逻辑说明。

## 当前事实

- 发布包只支持 `.tar.gz`，由 `scripts/build-release.sh` 生成。
- 发布包检查使用 `scripts/inspect-release.sh`。
- 打包阶段会重新安装依赖并执行后台 lint/build、后端 lint/编码检查/build。
- 发布包不包含 `dist`、`node_modules`、真实 `.env`、上传文件、日志、备份和本地压缩包。
- 目标服务器在部署/更新时构建 `server` 和 `admin-web`。
- 默认运行目录是 `/www/wwwroot/ai-creator`。
- 默认更新包目录是 `/www/wwwroot/ai-creator/update-packages`。
- 后台更新使用 `current` 软链接运行当前版本，安装锁统一在 `shared/.env.installed`。
