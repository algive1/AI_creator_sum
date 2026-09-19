# 文档核对与治理记录（2026-08-29）

## 结论

项目文档已按当前规范、兼容入口、待决策事项和历史记录分层。未删除任何追溯材料：15 份已完成的修复、同步、价格、计划和发布记录已移动到 `docs/archive/`；四份重复部署入口保留原路径并指向唯一主文档。

## 逐项处理

### 保持为当前规范

- 仓库根目录：`README.md`、`PRODUCT.md`、`other/README.md` 已核对，职责清晰，无需改写。
- 小程序：`uni-app/docs/小程序自动编译说明.md` 已改为实际存在的 `watch:mp-weixin` 脚本和 `dist/build/mp-weixin` 输出目录。
- 服务端：`DEPLOYMENT.md`、`BEGINNER_GUIDE.md`、`API.md`、`MINI_PROGRAM_API.md`、`AI_DEVELOPMENT_GUIDE.md`、`DEVELOPMENT.md` 和 `TASK_TIMEOUT_RECOVERY.md` 保留为当前规范或运维手册。
- `WEB功能下线影响评估.md` 改为待确认决策，明确 `user-web` 已受 Git、发布包和安装更新流程支持，不能在未决状态下删除。

### 合并后保留兼容路径

- `DEPLOYMENT_GUIDE.md`
- `INSTALL_UPDATE_RUNTIME.md`
- `REDEPLOY_AFTER_DELETE.md`
- `LOCAL_PORT_TESTING.md`

以上内容已收敛到 `DEPLOYMENT.md`；兼容页只保留跳转、边界和必要的本地命令，避免旧版本号、机器路径和重复步骤继续漂移。

### 已归档的完成型记录

- `archive/incidents/`：上传、免费额度、模型价格和 API 能力修复/诊断记录。
- `archive/maintenance/`：管理后台性能、Agnes、本地目录、模型目录、小马参数和本次文档治理记录。
- `archive/decisions/`：上传策略、提示词绑定、视频定价计划及小马上游价格快照。
- `archive/releases/`：已被后续 release 替代的 `1.0.74` 发布基线交接；当前 `1.0.75` 发布记录保留在 `docs/releases/`。

归档内容只可用于追溯当时的代码、上游状态或决策，不能替代当前操作规范。

## 同步更新

- API 索引补充了用户 Web 的项目/资产库、任务报价与重试、认证退出、消息通知、会员版本权益、后台文件受控内容和系统指标接口。
- 小程序 API 合并了重复的合规确认段落，并明确其只覆盖小程序契约。
- 部署和新手指南移除了机器专属 WSL 路径；本地联调改为运行时显式提供本地密码。联调脚本不再提供或输出固定默认密码，相关静态校验也已同步。
- 工具页静态校验中两处已过时的实现字符串断言已改为匹配当前等价实现；未修改工具页业务逻辑。

## 验证

- Markdown 相对链接：36 个本次核对范围内的项目文档，0 个失效链接。
- API 路由核对：服务端解析到 266 个 `/api/v1` 路由，`API.md` 无遗漏路由。
- 陈旧文档扫描：未发现旧固定本地路径、失效小程序 `.bat` 入口、旧全新重装版本号或明文本地测试密码。
- `npx tsx scripts/check-local-test-workflow.ts`：通过。
- `npx tsx scripts/check-tools-page.ts`：通过。
- `server`：`npm run build` 通过；`npm run lint` 0 error、12 个既有 warning。
- `uni-app`：`npm run typecheck` 通过。

## 边界与后续风险

- 未连接生产数据库、支付、模型供应商或微信环境；线上套餐、密钥、价格和实际支付回调状态仍需在预发或生产受控环境联调确认。
- `CODEBASE_AUDIT_20260829.md` 是本次开始前已有的未提交审计记录，已保留且未改写；其中的会员权益与商业规则待决事项仍未实施。
- PC 用户网页端是否下线仍是产品决策，未确认前不能删除 `user-web`、构建流程、Host 分流或相关 API。
