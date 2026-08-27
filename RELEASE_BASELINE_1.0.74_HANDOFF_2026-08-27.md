# 1.0.74 发布基线交接

日期：2026-08-27
目标版本：`1.0.74`
升级来源：已部署的 `1.0.73`
当前分支：`codex/wechat-tools-config`

## 当前结论

发布契约、运行目录迁移、版本识别、用户端静态产物检查、候选源码冻结和发布包构建已完成。最终发布包已经生成并通过 `inspect-release.sh`：

- 文件：`ai-creator-server/ai-creator-release-1.0.74.tar.gz`
- 大小：`3120524 bytes`（约 3.0M）
- SHA256：`81cb810f1c9aa1070542596dc05932445aa05844339f3627cadda44549a5960c`
- `release.json.version`：`1.0.74`
- `release.json.packageType`：`server-admin-user-web`

线上生产更新尚未执行；本机 MySQL 隔离 staging 流程已完成验证，生产部署仍需按下方步骤人工执行和验收。

## 根因

当前候选工作区已经具备 `user-web` 的打包和静态 Host 分流，但运行与检查链路不完整：

1. 发布包虽然已经包含 `user-web`，初始快照和旧平铺部署迁移没有复制它。
2. 更新预检查和部署自检没有同时要求 `user-web` 源码、配置和 `dist`，容易出现包能上传但线上用户端缺失的情况。
3. 旧检查把 `server-admin-user-web` 当成非标准类型；历史 `server-admin` 包又没有明确兼容告警。
4. 更新版本无 `app_releases` 记录时直接回退到 `server/package.json`，而当前 package version 仍可能是 `1.0.0`，会误判线上版本。
5. 当前候选代码新增了任务报价和重试入口，但架构检查白名单未同步，导致正式发布构建在检查阶段失败。

## 已完成改动

### 发布契约

- `build-release.sh` 继续在 staging 源码树构建 `admin-web/dist` 和 `user-web/dist`，发布包使用 `server-admin-user-web`。
- `inspect-release.sh` 现在要求 `user-web` 的 package/config/src 和 `user-web/dist`，并只允许 `admin-web/dist`、`user-web/dist` 两类前端产物。
- `inspect-release.sh` 和服务端更新预检查都会接受旧 `server-admin`，但输出 warning；未知类型也只进入兼容告警，不会绕过结构检查。
- 更新安装不会在服务器构建 `user-web`，只校验包内预构建的 `user-web/dist`；后端和管理后台仍按现有流程构建。

### 运行目录和版本识别

- 初始快照复制 `server`、`admin-web`、`user-web`、`scripts`、`docs`，并根据快照内容写入 canonical package type。
- 旧平铺部署迁移会在目录存在时复制 `user-web`，不存在时保持旧版本兼容，不影响旧回滚目录。
- 更新版本识别顺序为：`app_releases` 已安装记录 → `current/release.json` → APP_ROOT 根 `release.json` 兼容回退 → `package.json`。
- `check-deploy.js/ts` 同时要求用户端源码文件、`user-web/dist/index.html` 和 `user-web/dist/assets`。
- 保持 `current` 原子切换、PM2 从 `current/server/dist/index.js` 启动、health check 后再完成安装记录；数据库不会自动回滚。

### 候选主线检查

- `check-architecture-unified.ts` 纳入当前候选用户端所需的 `POST /quote` 和 `POST /:id(\\d+)/retry`，没有删除或放宽旧支付入口约束。

### 迁移

相对已核实的 `1.0.73` 发布包，本工作区纳入以下两条兼容迁移：

`ai-creator-server/server/src/migrations/20260803_001_creation_workspace.sql`

`ai-creator-server/server/src/migrations/20260827_001_unify_app_brand_name.sql`

前者使用 `CREATE IF NOT EXISTS`、information_schema 条件判断、`INSERT IGNORE` 和 nullable 字段回填；后者只对已知旧品牌默认值执行条件 `UPDATE`，不覆盖用户自定义站点名。两者均没有 DROP、TRUNCATE，不删除或重命名旧字段，也不改变既有 API 字段语义。静态幂等检查和本机真实 MySQL staging 首次执行、重复执行、已有数据链路验证均已通过。

### 源码冻结

- 已按发布边界拆分提交：
  - `fab0c49`：跟踪 `user-web` 源码、配置和 lockfile。
  - `8571547`：冻结发布契约和运行目录修复。
  - `0dec0c0`：冻结 server 候选运行时代码。
  - `67bf250`：冻结 server 验证脚本与测试，并修复 proxy URL 选择顺序。
  - `c1b2d36`：冻结 admin-web 候选。
  - `244aaef`：冻结 uni-app 候选。
  - `1959b7b`：统一品牌默认值并增加兼容迁移。
- 这些提交均未纳入 `dist`、`node_modules`、日志、tsbuildinfo、真实环境文件、备份、截图或压缩包；根目录的历史 `PRODUCT.md`/`README.md` 工作区变更也未被覆盖。
- 发布压缩包是本地生成物，保持未纳入版本控制。

## 验证结果

已通过：

- `server npm run build`
- `server npm run lint`：0 errors，12 warnings（均为现有代码 warning）
- `admin-web npm run build`
- `admin-web npm run lint`：0 errors，22 warnings（现有候选前端 warning）
- `user-web npm run build`
- `user-web npm run lint`
- `server npm run check:migrations-idempotent`：104 files scanned
- `server npm run check:architecture-unified`
- `server` 的更新预检查测试：完整包、旧 `server-admin`、缺少 `user-web/dist`、危险 `.env`、`current/release.json` 回退均已覆盖并通过
- 发布脚本和静态 Host 相关测试：5 tests passed
- `bash scripts/build-release.sh 1.0.74`
- `bash scripts/inspect-release.sh ai-creator-release-1.0.74.tar.gz`
- 最终包结构、package type、禁止文件和 SHA256 已复核
- 本地 `check-deploy`：新增 user-web 源码与构建产物检查均为 OK；在临时 APP_ROOT 下通过，保留 6 条环境/数据库 warning
- `server` 的 TSX 测试：113 个 JavaScript 测试、4 个 TypeScript 测试全部通过
- `uni-app`：typecheck、全量 118 个 TSX 静态测试、微信小程序构建和体积检查全部通过；产物 1615.73KB / 上限 1806.64KB
- MySQL 隔离 staging 完整流程：
  `env DB_PASSWORD= CHECK_DB_PASSWORD= CHECK_DB_NAME=ai_creator_install_update_check_1074_brand CHECK_RELEASE_VERSION=1.0.73 CHECK_UPDATE_VERSION=1.0.74 npm run check:install-update-flow`
  已通过；验证首次初始化、迁移/种子数据、管理员密码校验、安装完成记录、更新包预检查，以及 `app_releases`/更新日志从 `1.0.73` 推进到 `1.0.74`
- MySQL staging 额外确认 `20260827_001_unify_app_brand_name` 成功记录为 `success=1`，旧品牌默认值已按条件更新，用户自定义站点名保持不变

未完成或受环境限制：

- 未联调真实小马、红鸟、对象存储、生产生成链路和真实支付；本轮不读取、不写入、不提交任何 API key。
- 未执行线上 PM2、health、旧任务续跑、新任务生成和文件下载验收。
- `admin-web` lint 保留 22 条 warning，server lint 保留 12 条 warning；均无 error。uni-app 构建保留 Sass legacy API、Vite circular chunk 提示，需后续依赖升级时处理。

## 1.0.73 → 1.0.74 上线步骤

1. 在生产执行只读确认：

   ```bash
   readlink -f /www/wwwroot/ai-creator/current
   curl -fsS http://127.0.0.1:3000/health
   test -f /www/wwwroot/ai-creator/current/release.json
   ```

   确认当前 `releaseVersion` 为 `1.0.73`，并确认 `current` 是符号链接且目标可回滚。

2. 将本地发布包上传到：

   `/www/wwwroot/ai-creator/update-packages/ai-creator-release-1.0.74.tar.gz`

   上传后用上面的 SHA256 校验。可在服务器使用当前 release 中的 `scripts/inspect-release.sh` 复核包结构。

3. 在管理后台系统更新页选择 `1.0.74`，先完成预检查，确认没有结构、数据库连接、磁盘、PM2、`mysqldump` 和 health 依赖错误；确认文本必须填写 `1.0.74`。

4. 执行安装。安装器会依次备份数据库和当前代码、解压到 `releases/1.0.74`、复用 `shared/.env`、构建 server/admin-web、校验包内 `user-web/dist`、执行两条兼容迁移、原子切换 `current`、重启 PM2 并校验 health。

5. 上线后验收：

   ```bash
   readlink -f /www/wwwroot/ai-creator/current
   test -f /www/wwwroot/ai-creator/current/server/dist/index.js
   test -f /www/wwwroot/ai-creator/current/user-web/dist/index.html
   curl -fsS http://127.0.0.1:3000/health
   curl -fsS -H 'Host: ooa8.com' http://127.0.0.1:3000/
   curl -fsS -H 'Host: your-admin-domain.com' http://127.0.0.1:3000/login
   ```

   `/health.releaseVersion` 应为 `1.0.74`；再人工确认管理后台、用户网页、已有任务续跑、低成本新任务生成和结果下载。

## 故障处理边界

- 构建、PM2 或 health check 失败：只回滚 `current` 和 PM2 到旧 release，保留新 release、安装日志和数据库备份供排查。
- 数据库迁移失败：不得自动恢复生产库；保留 `backups/db` 中的备份，记录失败迁移和 SQL 错误，由人工修复或按审批恢复。
- 任何回滚后都要重新确认 `/health.releaseVersion`、`current` 链接目标和管理/用户网页静态入口。

## 后续版本约束

- 每个新包都必须保留 `release.json` canonical package type、用户端源码和预构建 `user-web/dist`。
- 不要删除或重命名现有迁移字段；新增迁移必须先通过静态危险 SQL/幂等检查，再在与生产同版本的 MySQL staging 执行两次。
- 不要用 `package.json` 的开发版本替代运行目录 `release.json` 或 `app_releases`。
- 继续保持发布包不含真实 `.env`、密钥、日志、备份、压缩包、`node_modules` 和运行态目录。
- 本轮未实施首页性能、小游戏幂等和插件试点；这些事项应单独立项，避免与发布基线混合。
