# 开发说明

本文合并原来的开发、配置、会员、模型等零散文档，只保留当前代码需要知道的内容。

## 目录

```text
server/        Express + TypeScript + MySQL
admin-web/     React + Ant Design + Vite
scripts/       发布包脚本
docs/          当前维护文档
```

后端入口是 `server/src/index.ts`。管理后台入口是 `admin-web/src/App.tsx`，后台菜单和页面路由在 `admin-web/src/components/Layout.tsx`。

## 本地开发

后端：

```bash
cd server
cp .env.example .env
npm ci
npm run dev
```

前端：

```bash
cd admin-web
npm ci
npm run dev
```

Vite 开发服务端口是 `5173`，`/api` 代理到 `http://localhost:3000`。

常用检查：

```bash
cd server
npm run build
npm run check:encoding
npm run check:deploy
```

## 后端约定

- 小程序和公开接口挂在 `/api/v1`。
- 管理后台接口挂在 `/api/v1/admin`。
- 安装接口挂在 `/api/install`。
- 普通用户鉴权使用 `authMiddleware`。
- 后台鉴权使用 `adminAuthMiddleware`，当前产品只保留一个超级管理员，后台登录和后台接口只接受 `role_key=super_admin`。
- 安装状态由 `installMiddleware` 控制。
- 成功响应使用 `success(res, data)`。
- 错误响应使用 `error(res, code, message)`。

数据库查询优先使用项目封装的 `query`、`queryOne`、`getConnection`。分页查询不要直接拼接用户输入。

## 数据库和迁移

- 基础 schema 在 `server/src/db`。
- 增量迁移在 `server/src/migrations`。
- 迁移文件按 `{YYYYMMDD}_{序号}_{描述}.sql` 命名。
- 迁移要尽量幂等，优先用 `information_schema` 判断列、表、索引是否存在。
- 不要依赖 `ADD COLUMN IF NOT EXISTS`，MySQL 8.0 兼容性不好。

首次安装会执行 schema、seed、migrations，并写入 `schema_migrations`。

## 变更记录

### 2026-06-04 备份管理后台页面

- 新增 `routes/admin-backup.ts`：备份历史列表、手动触发、测试邮件、邮件配置
- 新增 `admin-web/src/pages/BackupManagement.tsx`：备份管理页面（历史+配置+手动操作）
- 后台菜单新增「备份管理」（`/backup`），位于「系统更新」下方

### 2026-06-04 备份邮件通知

- 新增 `services/backup-email.service.ts`：备份完成后自动 gzip 压缩并通过 SMTP 发送到指定邮箱
- 配置方式：
  - 环境变量：`BACKUP_EMAIL_SMTP_HOST/PORT/USER/PASS`（SMTP 凭证）
  - system_configs：`backup.email.enabled`（开关）、`backup.email.from`（发件人）、`backup.email.to`（收件人）
- 压缩后超 20MB 不发附件，改发纯文本通知
- 邮件发送失败不影响备份本身

### 2026-06-04 CodesOnline 供应商更新 + 档位绑定修复

- 新增迁移 `20260604_001_update_codesonline_provider.sql`：更新 Base URL + 将 gpt-image-2 绑定为 image_standard 主模型
- API Key 通过 `CODESONLINE_IMAGE_API_KEY` 环境变量同步，不写入迁移

### 2026-06-03 权益图标 / 音频模式 / 参考图上限 / 积分任务 / 水印合规

- 新增迁移 `20260604_001_member_benefit_icons.sql`：会员权益图标库种子
- 新增迁移 `20260604_002_tier_audio_modes.sql`：档位能力表 audio modes 字段
- 新增迁移 `20260604_003_max_reference_images.sql`：档位能力表 max_reference_images 字段
- 新增迁移 `20260603_001_seed_point_tasks.sql`：积分任务种子
- 新增迁移 `20260603_002_seed_legal_docs_watermark.sql`：水印合规法律文档种子

### 2026-06-04 定时任务看门狗 + 手动触发

- 新增 `services/cron-watchdog.service.ts`：定时任务心跳注册 + 看门狗
- 每个定时任务执行后自动更新心跳；看门狗每 5 分钟扫描，超过预期间隔 3x 未更新 → error log
- 新增 `POST /api/v1/admin/system/cron/:taskName` 手动触发端点（需 super_admin）
  - `membership-expiry`：会员过期处理
  - `monthly-points`：月度积分发放
  - `daily-backup`：每日数据库备份
- 可用系统 crontab 做兜底：`curl -X POST .../cron/daily-backup -H "Authorization: Bearer <token>"`

### 2026-06-04 定时数据库备份

- 新增 `services/backup.service.ts`：每天凌晨 3 点自动执行 `mysqldump --single-transaction --routines --triggers`
- 备份路径：`{appRoot}/backups/db/auto/{YYYYMMDD}.sql`，保留最近 7 天自动清理
- 备份失败自动重试一次；验证文件大小 > 0

### 2026-06-02 安全与业务逻辑修复

**新增迁移**：`20260602_002_fix_invite_code_index.sql`
- 将 `user_invites.uk_invite_code` 从 UNIQUE INDEX 改为普通 INDEX。修复邀请码只能被一个人使用的 bug。

**API 行为变更**：
- `POST /api/v1/files/notify`：新增 `storageKey` 格式校验，拒绝非法格式
- `DELETE /api/v1/files/:fileNo`、`POST /api/v1/files/batch-delete`：先软删 DB 再硬删存储，防止悬挂记录
- `POST /api/v1/tasks/:id/cancel`：processing 状态的任务拒绝取消
- 本地存储静态文件服务：私有文件需登录+所有权检查

**配置与基础设施**：
- DB 连接池添加保活 (`enableKeepAlive`)、连接超时 (`connectTimeout`)、排队上限 (`queueLimit: 50`)
- 添加安全响应头：`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy`
- 添加 Graceful Shutdown：SIGTERM/SIGINT → 10s 排空 → 关池 → 退出
- 广告领取添加最小观看时间 15s
- 文件导出 Sharp 处理添加 30s 超时
- storageKey/fileNo 生成改用 `crypto.randomBytes`

**支付系统**：
- 微信支付沙箱 URL 修复
- 支付通知：先记录支付信息，权益发放成功后再标记 `status=paid`
- 启动时恢复 `pay_status=paid` 但 `grant_status=pending` 的订单
- 首购双倍积分竞态修复：`hasGrantedPointOrderBefore` 加 `FOR UPDATE`

**任务系统**：
- `selectTierModel` 从两次调用合并为一次，消除 TOC/TOU
- `markTaskQueued` 移入积分冻结事务内，消除积分冻结但任务不处理的窗口
- cancel 时 processing 状态拒绝取消，防止收入泄漏
- 文字功能启动恢复：查找 5 分钟以上的孤立扣费并自动退款

**代码质量**：
- `_settlePoints`、`_refundPoints`、`taskTestHooks` 死代码清理
- `parseJson` 从 10+ 文件统一到 `utils/content-helpers.ts`
- `isToday()` 修复 UTC 时区问题
- `discountLabel` 从 3 个页面提取到 `utils/member.ts`

## 配置

运行时配置主要在 `system_configs`，key 使用点号格式，例如 `membership.enabled`。安装前 `.env` 是 bootstrap 输入；安装后多数业务配置应从 `system_configs` 读取。

主要配置组：

- `site.*`：站点名、时区、后台标题。
- `wechat.*`：小程序登录。
- `wechat_pay.*`：微信支付。
- `storage.*`：本地和云存储。
- `customer_service.*`：小程序客服入口。
- `miniapp_help.*`：小程序使用帮助，含启用状态、标题和 HTML 富文本内容。
- `membership.*`：会员开关。
- `invite.*`：邀请奖励。
- `signin.*`：签到、补签、超级签到。
- `ad_reward.*`：激励广告奖励。
- `miniapp.tab_bar`：小程序底部导航。
- `ai_*`：AI 文本辅助功能兜底配置。

重要微信支付回调地址：

```text
https://your-domain.com/api/v1/payments/wechat/notify
```

本地存储默认公开路径：

```text
/static
```

生产环境如使用 CDN 或反向代理，必须把 `storage.local.base_url` 设置为公网 HTTPS 完整地址。若安装后数据库里仍是默认 `/static`，可设置 `LOCAL_BASE_URL=https://你的后端域名/static` 后执行 `npm run db:migrate`，迁移脚本会把该配置同步进 `system_configs`。

生产环境会在 SPA fallback 前拦截常见探测路径，如 `/@fs`、`/proxy?url=...`、`/?url=...`、`/?dest=...`，避免扫描请求拿到后台 HTML。

## 模型和档位

核心表：

- `model_features`：功能，例如 `image_create`、`video_create`。
- `model_tiers`：小程序可选档位，含积分价格和 `quality_multipliers`。
- `ai_model_providers`：模型供应商。
- `ai_models`：真实模型。
- `tier_model_bindings`：档位到真实模型的绑定。

小程序创建任务时应传 `tierKey` 或 `tierId`。后端根据档位和绑定选择真实模型，不允许小程序直接指定 `modelId`。

会员功能折扣按套餐和功能配置在 `member_plan_feature_discounts`：`discount_percent=100` 表示无折扣，`95` 表示按原积分 95% 扣费。`GET /public/model-tiers` 在带有效用户 token 时会返回会员折扣后的 `pointsCost`，同时返回 `basePointsCost/memberDiscountPercent/memberDiscountApplied`。任务创建时后端会重新计算并以折扣后的积分冻结、扣减和失败退款，前端展示只作为提示。

图片编辑支持主图 `uploadKeys`，并可额外传 `maskFileId/maskUrl`、`backgroundFileId/backgroundUrl`。视频任务会按 `videoMode` 自动匹配默认功能：文生视频、图生视频、首尾帧视频和视频编辑；视频编辑支持 `videoFileId`、`videoUrl` 或上传返回对象。

视频任务参数链路会保留 `audioMode`、`preserveAudio` 和清洗后的 `inputAssets`。档位能力表 `tier_capabilities` 包含 `supported_audio_modes/default_audio_mode` 和 `max_reference_images`；公开接口返回 `capabilities.audioModes/defaultAudioMode/maxReferenceImages`。`maxReferenceImages` 只控制图生图/图生视频的普通参考图池，未配置默认 4 张；首尾帧固定首图/尾图 2 张，图片编辑和视频编辑走各自单素材逻辑。`inputAssets` 只用于结果页展示首尾帧/源视频素材，不作为供应商请求的素材来源。

图片任务支持平台显式水印：`platformWatermarkEnabled` 缺省为 `true`，服务端会在最终图片左下角写入 `AI艺术生成工坊`。用户确认关闭后前端按账号偏好传 `false`，服务端不添加可见平台水印，并在 `files.platform_watermark_removed` 标记。图片编辑选择 `去水印` 时服务端强制不叠加平台水印。视频任务不支持平台水印开关，视频产物不做平台水印处理。

法律协议种子包含三份必签协议：`user_agreement`、`privacy_policy`、`ai_content_rules`。涉及平台水印、关闭水印确认、生成内容合规和创作点/积分交易性质的更新应通过新版本 `legal_documents` 迁移发布，避免修改已经执行过的历史迁移。

WellAPI 使用 `provider_type=wellapi`，Base URL 默认为 `https://wellapi.ai`。迁移会 seed 低价视频模型和 `qwen-image-2.0` 文生图模型，并为默认业务档位写入模型绑定。文本辅助功能会在 `system_configs` 为空时默认绑定 `xiaoma/gpt-5.2-chat-latest`，不覆盖后台已有配置。种子和迁移都不会把真实 API Key 写进 SQL；上线前可在后台「AI 模型管理 → 供应商与模型」填写，也可通过环境变量 `OPENAI_API_KEY/XIAOMA_API_KEY/BAGEGE_API_KEY/WELLAPI_API_KEY/CODESONLINE_IMAGE_API_KEY/APIMART_API_KEY` 在安装或 `db:migrate` 后加密同步到 `ai_model_providers`；迁移脚本只同步非占位值，不会把 `PLEASE_REPLACE`、`your_*` 这类模板值写入数据库。未配置 Key 时，小程序档位列表会跳过对应供应商绑定；如果某个档位没有任何可用绑定，创建任务会被后端明确拦截。

启动后会非阻塞检查是否存在至少一个 active provider 同时配置了 Base URL 和 API Key；没有时会打印 warning，后台配置检查也会显示错误。真实 Key 不写入仓库、`.env.example` 或 SQL seed。

APIMart 使用 `provider_type=apimart`，Base URL 默认为 `https://api.apimart.ai/v1`。迁移 `20260531_007_seed_apimart_models.sql` 会 seed GPT Image、Nano Banana 图片模型和生成类视频模型，并新增 `apimart_*` 专属档位和绑定；不会写入 API Key，也不会把现有默认档位切换到 APIMart。后台填写 APIMart 的 Base URL 和 API Key 后，选择 APIMart 专属档位即可调用。Midjourney/MJ 当前不入库，因为 APIMart 公开文档没有对应模型条目；avatar 资产和 remix 接口也不接入标准创建任务流程。

会员套餐积分规则中，`immediate_points` 和 `gift_points` 在支付权益发放时立即到账；`grant_mode=monthly/mixed` 且 `monthly_points>0` 时，系统按 30 天周期自动发放月度积分，并以 `point_logs(source, ref_type, ref_id)` 防重复补发。

会员版本、套餐、权益、积分规则和功能折扣都在后台「会员套餐」维护。永久会员可以使用 `duration_type=forever`，小程序永久会员卡片的“每图低至 X 折”优先读取 `image_create` 的功能折扣；后台未配置折扣时生产环境不展示该承诺。

积分套餐支持首充营销。后台「积分管理」中每个套餐可选择无活动、首充双倍或首充送固定积分，活动互斥不叠加。首充按用户维度判断：只有历史没有任何 `order_type=points` 且 `grant_status=granted` 的积分订单时，支付成功发放的积分订单才享受首充权益；未支付、取消、过期订单不占用首充。订单创建时会写入基础积分和活动快照，支付成功发放时在事务内锁定积分账户后判断首充并写入最终到账积分，避免并发支付重复享受首充。

## 后台页面

当前后台主要页面：

- 仪表盘、用户管理、任务管理、支付订单、文件管理、审核管理。
- AI 模型管理：功能页配置、供应商与模型、模型测试、模型总览。
- 会员套餐、积分管理、邀请运营。
- 模板分类、图片模板、视频模板、灵感广场、模板审核。
- 内容合规。
- 微信配置：小程序、微信支付、客服、使用帮助、底部导航、接口参考。
- 对象存储：COS、OSS、七牛、又拍云、移动云、本地存储。
- 上线配置检查、功能开关、系统更新、备份管理、系统设置、操作日志。

新增后台页面时，需要同时改 `Layout.tsx` 的菜单和 `<Routes>`。

迁移 `20260531_008_seed_scraped_template_content.sql` 会写入 DoodleAI 提示词广场 30 条灵感种子和献丑活动 1 的 20 条视频模板种子。DoodleAI 的视频内容把视频地址写入 `templates.preview_url` 和 `params_json.videoUrl`；献丑公开接口没有独立生成提示词字段，入库提示词优先使用公开描述，描述为空时使用标题并在 `params_json.promptSource` 标记来源。

## 会员和订单

会员购买使用统一订单系统：

1. 小程序读取 `GET /api/v1/membership/plans`。
2. 创建订单 `POST /api/v1/orders`，`orderType=membership`。
3. 发起微信支付 `POST /api/v1/payments/wechat/jsapi`。
4. 微信回调 `POST /api/v1/payments/wechat/notify`。
5. 后端根据支付结果发放会员权益。
6. 后台支付订单页可对 `pending` 或 `failed` 的发放状态执行补发。

启动后，已安装系统会定时处理过期会员。

## 文件和存储

系统支持本地存储和云存储。`storage-config-loader` 会把 `system_configs.storage.*` 预加载到 `process.env`，供同步存储适配器使用。

本地上传目录默认：

```text
/www/wwwroot/ai-creator/uploads
```

Express 会把本地上传目录挂到 `LOCAL_BASE_URL`。开发环境可用 `/static`，生产环境应配置为公网 HTTPS 完整地址，例如 `https://你的后端域名/static`，否则微信小程序和第三方模型无法稳定访问文件；上线检查会拦截 `/static` 和示例域名。

## 发布包脚本

当前只维护两个根目录脚本：

- `scripts/build-release.sh`：构建验证并生成 `.tar.gz` 发布包。
- `scripts/inspect-release.sh`：检查发布包结构和危险文件。

不要再新增重复的部署、诊断、更新脚本；优先把运行期检查放到 `server/scripts/check-*.ts` 或后台更新服务中。

## 文档维护

- API 有变化时更新 [API.md](API.md)，同时同步后台的 `admin-web/src/pages/ApiReference.tsx`。
- 部署、打包、更新流程变化时更新 [DEPLOYMENT.md](DEPLOYMENT.md)。
- 代码结构、配置键、开发约定变化时更新本文档。
- 不再新增按模块拆散的长文档，除非内容无法自然合并进这三个维护文档。
