# Agnes AI API 与本地数据库更新记录

## 问题原因

- Agnes AI provider 使用 `provider_key=agnes_ai`、`provider_type=openai_compatible`，API key 通过 `AGNES_API_KEY` 环境变量同步。
- 本地 `server/.env` 与 `shared/.env` 缺少 Agnes key。
- 本机 MySQL 的 `root@localhost` 实际为空密码，但项目配置残留旧密码，导致 `db:migrate` 报 `Access denied`。
- 本地测试库 `ai_creator_login_test` 尚未初始化，直接执行增量 migration 会因缺少基础表而失败。

## 已完成修改

- 在未纳入 Git 的 `ai-creator-server/server/.env` 和 `ai-creator-server/shared/.env` 配置 `AGNES_API_KEY`。
- 将两份本地运行配置的 `DB_PASSWORD` 统一为空值，并将权限收紧为 `600`。
- 创建并初始化本地测试库 `ai_creator_login_test`。
- 复用项目现有安装流程执行基础 schema、全部 migrations、seed 和 provider key 加密同步。
- 未将 API key 写入源码、SQL migration、前端或 Git 跟踪文件。

## 验证结果

- `npm run build`：通过。
- `npm run check:provider-model-rollout`：通过。
- `npm run check:install`：通过。
- `npm run db:migrate`：通过。
- Agnes provider 脱敏核验：数据库 key 已加密保存，可使用当前 `ENCRYPTION_KEY` 正确解密；Base URL 为 `https://apihub.agnes-ai.com/v1`。
- `npm run lint`：0 errors，保留项目原有 12 条 warnings。
- `npm run check:ai-relay-compat`：仍有一项与本任务无关的上传大小契约断言失败，未修改上传业务代码。

## 后续注意

- 服务进程启动时会读取 `.env`，若已有进程运行，需要重启后才会加载新的环境变量。
- API key 已在聊天中出现，建议后续在 Agnes 控制台轮换该 key。
- `ai_creator_login_test` 是本地测试库；生产环境应使用独立数据库凭据，不能复用本地 root 空密码配置。
