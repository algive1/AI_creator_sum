# 文档索引

最后核对：2026-08-29。本文档按“当前规范、待决策事项、历史记录”分层；只有“当前规范”可作为实施依据。

## 当前规范

1. [DEPLOYMENT.md](DEPLOYMENT.md)：唯一的部署、更新、全新重装、小程序发布与本地联调主指南。
2. [BEGINNER_GUIDE.md](BEGINNER_GUIDE.md)：首次部署的最短操作顺序。
3. [API.md](API.md)：跨端公开、用户 Web、管理后台和安装接口索引。
4. [MINI_PROGRAM_API.md](MINI_PROGRAM_API.md)：小程序请求契约与返回字段。
5. [AI_DEVELOPMENT_GUIDE.md](AI_DEVELOPMENT_GUIDE.md)：小程序页面接入、模型能力和上传使用方式。
6. [DEVELOPMENT.md](DEVELOPMENT.md)：项目结构、配置键及核心运行逻辑。
7. [TASK_TIMEOUT_RECOVERY.md](TASK_TIMEOUT_RECOVERY.md)：超时任务补查与积分纠正的当前运维手册。

## 兼容入口

以下文件保留原路径，避免发布包、脚本或外部书签失效；详细步骤已合并到 `DEPLOYMENT.md`：

- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- [INSTALL_UPDATE_RUNTIME.md](INSTALL_UPDATE_RUNTIME.md)
- [REDEPLOY_AFTER_DELETE.md](REDEPLOY_AFTER_DELETE.md)
- [LOCAL_PORT_TESTING.md](LOCAL_PORT_TESTING.md)

## 待决策与审计

- [WEB功能下线影响评估.md](WEB功能下线影响评估.md)：PC 用户网页端是否下线的待确认决策；在作出决定前，`user-web` 仍是正式交付组件。
- [CODEBASE_AUDIT_20260829.md](CODEBASE_AUDIT_20260829.md)：当前代码与产品风险审计，记录待整改项，不替代接口或部署规范。

## 当前发布记录

- [RELEASE_1.0.75_DEPLOYMENT_HANDOFF_2026-08-29.md](releases/RELEASE_1.0.75_DEPLOYMENT_HANDOFF_2026-08-29.md)：当前生产 `1.0.75` 的发布交接和已知风险。用户网页端域名的 DNS、Nginx 与 TLS 配置仍需单独完成；不能因服务端默认 Host 分流就认为该站点已可通过 HTTPS 访问。

## 历史记录

已完成的修复、同步、价格快照、实施计划和非当前发布交接均已移至 [archive/README.md](archive/README.md)。本次治理记录见 [DOCUMENTATION_RECONCILIATION_20260829.md](archive/maintenance/DOCUMENTATION_RECONCILIATION_20260829.md)。历史内容保留追溯价值，但其中的上游价格、线上状态、版本号和命令不得直接作为当前操作依据。

## 维护规则

- 接口或调用契约变更：同步更新 `API.md`、`MINI_PROGRAM_API.md`，并同步管理后台的 API 参考页。
- 发布、安装或本地联调流程变更：更新 `DEPLOYMENT.md`；兼容入口只保留跳转说明。
- 代码结构、配置键或核心运行规则变更：更新 `DEVELOPMENT.md`。
- 完成型记录使用日期命名并移入 `archive/`，不要再堆放在当前规范目录。
