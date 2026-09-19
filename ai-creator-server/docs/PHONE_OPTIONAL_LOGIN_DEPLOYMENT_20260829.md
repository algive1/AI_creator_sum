# 手机号可选登录线上更新记录（2026-08-29）

## 发布结果

- 线上运行目录：`/www/wwwroot/ai-creator/current` → release `1.0.75`。
- 已更新 `current/server/src/services/user.service.ts` 与对应的 `current/server/dist/services/user.service.js`。
- PM2 应用 `ai-creator` 已重启并保持 `online`。
- `/health` 返回 `{"status":"ok","releaseVersion":"1.0.75"}`。
- 临时上传文件已清理。

## 发布内容

- 登录响应包含脱敏手机号和 `phoneBound`。
- 用户偏好默认包含 `phoneAuthorizationPrompted: false`，支持手机号拒绝/失败后仍登录且不再自动提示。
- 本次无数据库迁移。

## 回滚备份

- `current/server/src/services/user.service.ts.bak.20260829-0304`
- `current/server/dist/services/user.service.js.bak.20260829-0304`

本次生产 release 未安装 TypeScript 开发依赖，远端 `npm run build` 会因 `tsc: command not found` 失败；部署使用本地已通过 `npm run build` 的 JS 产物。后续正式发布新 release 时，应将同样的源文件和构建产物纳入发布包，避免继续在既有 release 上热修复。
