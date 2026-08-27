# 开发说明

本文合并原来的开发、配置、会员、模型等零散文档，只保留当前代码需要知道的内容。

## 目录

```text
server/        Express + TypeScript + MySQL
admin-web/     React + Ant Design + Vite
user-web/      React + Ant Design + Vite, PC user creator workspace
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

Vite 开发服务端口是 `5173`，`/api` 和 `/static` 代理到 `http://localhost:3000`。如果后端本地跑在 `3137`，启动前端时设置：

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:3137 npm run dev
```

用户网页端：

```bash
cd user-web
npm ci
npm run dev
```

`user-web` 默认开发端口是 `5174`，`/api` 和 `/static` 同样代理到 `VITE_API_PROXY_TARGET`，本地可用 `http://localhost:5174` 验证登录、创作表单、任务队列、作品库和手机宽度提示页。

这样后台上传返回的 `/static/...` 图片/视频可以在开发页面里正常预览。

常用检查：

```bash
cd server
npm run build
npm run check:encoding
npm run check:video-pricing
npm run check:xiaoma-video-params
npm run check:deploy
npm run check:payment -- --strict-real-collection
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
迁移运行器在失败时会输出迁移文件名、SQL 序号、MySQL `code/errno/sqlState` 和 SQL preview，方便定位安装更新日志里具体失败的语句。涉及临时表、字符串字面量和业务表字段比较时，要显式保持 `CHARACTER SET`/`COLLATE` 一致；`20260615_003_seed_hongniao_image_models.sql` 使用 `utf8mb4_unicode_ci` 与 `ai_models` 对齐，避免生产库默认 `utf8mb4_0900_ai_ci` 时出现 `Illegal mix of collations`。

## 变更记录

### 2026-07-05 智能提示词补全增强

- 小程序生图、生视频页的“智能补全”按钮继续调用 `/api/v1/tasks/optimize-prompt`，不新增接口。
- 前端会随请求传 `usage=deep_completion` 和 `context`，包含当前模式、比例、时长、清晰度、参考素材和入口档位信息。
- 后端默认系统提示词从短句润色改为深度补全：保留用户原意，补齐主体、场景、镜头、光影、风格和质量要求；视频场景额外补动作、镜头运动和节奏。
- 点击智能补全时前端会进入 loading 并阻止重复点击；完成或失败后恢复按钮，避免用户连续点出多笔并发请求。
- 后端对文本能力模型绑定和 `system_prompts` 组合内容做 60 秒内存缓存；后台创建/编辑系统提示词后会清理对应 `target_feature` 的缓存，保存「AI 文本能力」设置后会清理文本能力模型绑定缓存。
- 不缓存最终 `optimizedPrompt` 生成结果：同一提示词多次点击应允许模型产出不同版本，缓存仅用于配置和系统提示词。
- 后端会白名单化智能补全 `context`，过滤素材 URL、本地路径、fileId/fileNo 等标识，只保留模式、尺寸、时长、入口档位和参考素材数量。
- 后台「系统设置 → AI 文本能力」提供「编辑智能补全提示词」入口，跳转到「内容管理 → 系统提示词」并聚焦 `prompt_optimize`；新增时自动带入目标功能，减少误填。

### 2026-06-27 ooa8.com 用户网页端

- 新增独立 `user-web`：React + Vite + TypeScript + Ant Design，页面包含登录注册、工作台、生图、生视频、漫剧、灵感模板、作品库、任务详情、工具箱、签到和个人中心。
- 新增邮箱注册/登录接口：`POST /api/v1/auth/register`、`POST /api/v1/auth/login`，refresh token 支持 `clientType=web`。
- 新增迁移 `20260627_001_web_email_auth.sql`，为 `users.email` 增加唯一索引；新安装 schema 同步包含 `uk_email`。
- `server/src/index.ts` 增加 `WEB_APP_HOSTS=ooa8.com,www.ooa8.com` Host 分流，命中用户域名时返回 `user-web/dist`，其他 Host 继续返回 `admin-web/dist`。
- 发布脚本和检查脚本同步构建/打包 `user-web/dist`，部署文档需同步配置 DNS、SSL、Nginx、CORS/CSP 和验收命令。
- 网页端第一版不开放支付和激励广告；积分不足时提示签到、邀请、联系客服或使用小程序处理。

### 2026-06-06 小程序死代码清理

- 小程序任务创建后统一进入 `pages/result/index`，该页面负责轮询、状态展示和结果操作；已移除未导航的 `pages/generating/index` 和 `pages/task-detail/index` 注册。
- 删除未被业务页面引用的旧组件、API 包装函数和工具导出；后端接口未删除，后续如需订单列表、邀请码绑定或独立任务详情，需要重新设计前端入口再接入。

### 2026-06-14 工具页与工具模型绑定

- 新增迁移 `20260614_001_tools_page.sql`：创建 `tool_usage_logs`、`tool_ad_unlocks`，写入工具箱默认开关、次数、底部导航默认值，并新增 `tool_prompt_reverse`、`tool_cutout` 两个模型功能入口。
- 新增迁移 `20260614_002_tools_visible_keys.sql`：写入 `tools.visible_keys` 默认 8 个内置工具，顺序即小程序工具页展示顺序；移出工具只从该列表删除，不删除历史次数、日志、提示文案、工具积分收费配置或模型绑定。
- 新增迁移 `20260614_003_tools_points_billing.sql`：写入每个工具的 `tools.{toolKey}.points_enabled` 和 `tools.{toolKey}.points_cost` 默认配置，默认关闭且 0 积分。
- 新增小程序 `/pages/tools/index`，默认底部导航为 `首页 / 灵感 / 工具 / 记录 / 我的`；后台仍可保存超过 5 个导航项，小程序端只展示前 5 个启用项。
- 新增 `/api/v1/tools/config`、`/api/v1/tools/process`、`/api/v1/tools/ad-session`、`/api/v1/tools/ad-unlock`。会员按 `member_daily_quota` 免费使用，非会员按 `guest_daily_quota` 免费使用；免费次数和广告解锁不可用时，如工具积分收费开启，会扣 `points_cost` 积分，处理失败自动退回。
- 新增后台 `/api/v1/admin/tools/config` 和页面 `/wechat/tools`，入口为「微信配置 → 工具页配置」。该页统一维护工具页总开关、工具增删排序、工具启停、会员/非会员次数、广告解锁、工具积分收费、关闭提示和工具模型绑定。
- 后台「功能开关」不再维护工具箱分组，只显示迁移提示；后台「微信配置 → 底部导航」继续只维护导航启停和内置图标标识；后台「AI 模型管理 → 功能页配置」默认隐藏 `tool_prompt_reverse`、`tool_cutout`，这两个绑定入口迁移到「微信配置 → 工具页配置」。
- 反推提示词会尝试调用 `tool_prompt_reverse` 绑定的 OpenAI-compatible 视觉/多模态模型，失败时回退本地提示词。智能抠图当前仍是本地轻量算法，`tool_cutout` 先作为后续供应商抠图/图片编辑接入的绑定入口。
- 工具积分收费不走 AI 任务冻结链路，使用 `point_logs` 记录 `source=tool_usage/ref_type=tool_process` 扣费，失败退款记录 `source=tool_usage_refund/ref_type=tool_process_refund`。小程序可根据 `/tools/config` 的 `pointsEnabled/pointsCost` 展示扣费文案。

### 2026-06-04 第二轮上线前修复（#1-#10）

- **#1 内容审核审计日志**：`tasks.ts` 敏感词命中时写入 `audit_logs`（记录命中词+prompt 摘要）
- **#2 管理操作日志**：会员版本/套餐创建写入 `admin_operation_logs`
- **#3 会员计划事务**：`POST /membership/plans` 用 `getConnection()` + `beginTransaction()` + `commit()` 包裹
- **#4 公告bar新徽章**：点击公告时调用 `markAnnouncementRead()` API
- **#5 会员浮窗开关**：`showMemberFloat` 加 `membershipEnabled` 检查
- **#6 广告验证**：已有 15s 最小观看时间检查（之前已修）
- **#7 仪表盘缓存**：`GET /stats/dashboard` 添加 30 秒内存缓存
- **#8 模型类型默认值**：模型同步默认 `modelType` 从 `'image'` 改为 `'unknown'`，新增 image 匹配分支
- **#9 异步测试轮询**：`runAiGenerationTest` 对异步任务轮询最多 2 分钟
- **#10 保存测试状态错误日志**：`saveTestState` 空 catch 改打 console.error

### 2026-06-04 第四轮修复（#25-#34）

- **#25 上传失败提示**：图生图/编辑图上传失败时显示 toast "素材上传失败，请重试"，不再静默吞错
- **#28 结果页初始时间**：任务创建时填充 `createdAt` 为当前时间，不再显示"刚刚"
- **#31 死代码清理**：删除 `_createVideoTaskLegacy`（76行未被调用的旧版视频任务创建函数）
- **#34 未处理异常**：添加 `unhandledRejection` 和 `uncaughtException` 全局处理器，记录到 console.error

### 2026-06-05 超级签到广告独立

- 新增迁移 `20260605_001_ad_reward_scene.sql`：`ad_reward_logs.ad_scene` 区分 `reward` 和 `signin_super`，历史数据默认 `reward`。
- 新增 `POST /api/v1/checkin/super/session`：创建超级签到专用广告会话；完整观看后调用 `/checkin/super` 领取 `signin_super` 奖励。
- `/ads/status`、`/ads/session`、`/ads/reward` 只统计和发放广告积分，不再被超级签到消耗次数。

### 2026-06-05 会员门槛与登录资料修复

- 新增迁移 `20260605_002_member_gates_and_signup_bonus.sql`：写入 `membership.prompt_optimize_member_only`、旧版 `membership.image_template_use_member_only`、旧版 `membership.save_to_album_member_only` 和 `points.new_user_bonus_points` 默认配置。
- 新增迁移 `20260610_002_template_save_use_member_gate.sql`：写入当前模板保存/使用会员开关 `membership.template_save_use_member_only`，默认 `false`；生成结果保存/导出不读取该开关。
- 智能优化、图片模板使用、保存导出均增加服务端会员门槛；默认关闭，后台「功能开关」开启后生效。
- `membership.enabled` 现在会同时影响小程序入口、会员套餐接口、会员状态接口和会员下单；`content.filter_enabled` 会影响图片/视频任务敏感词拦截；`template.user_share_enabled` 会影响结果页分享入口和后端分享接口。
- `miniapp.home_entry.image/video/comic.enabled` 控制小程序三大创作入口维护态。任一入口关闭后首页入口仍展示，但点击只提示对应 `miniapp.home_entry.*.message` 且不跳转，不关闭生成接口或其它页面入口。
- `security.captcha_enabled` 当前没有验证码输入/校验链路，后台「功能开关」已标记为未接入并禁用切换，避免只保存配置但业务不读取。
- 新用户注册送积分改读 `points.new_user_bonus_points`，后台「积分管理 > 新用户奖励」可配置；只影响后续新用户。
- 新增 `POST /api/v1/users/me/phone`，小程序个人中心用微信 `getPhoneNumber` 授权绑定手机号，页面不再展示退出登录按钮。
- `POST /api/v1/users/me/phone` 属于主线用户接口：小程序用户点击微信手机号授权后，前端提交微信返回的 `code`，后端换取手机号并绑定；该流程不需要短信验证码，也不支持用户手输任意手机号直接绑定。
- 灵感广场查询读取 `display_config.inspiration` 标记的官方图片/视频模板；`template_type` 只表示真实模板类型（`image`/`video`），不要再写入 `inspiration`。
- 小程序灵感页分类改读 `/templates/categories`，列表项使用 `/templates/inspirations` 返回的 `templateType`、`targetFeature`、`categoryName/categoryKey`，不要在前端继续写死模板分类；后台灵感广场批量设置使用 `mergeDisplayConfig=true` 合并 `inspiration` 展示位。

### 2026-06-04 全量审计修复

- **支付到账校验**：小程序 `payWithWechat()` 在主动查单后必须确认 `payStatus/status=paid` 且 `grantStatus=granted`，否则提示"权益发放处理中/失败"，不再把付款成功误判为权益到账。
- **激励广告**：小程序取消模拟广告弹窗，必须使用微信 `createRewardedVideoAd` 且后台配置 `ad.reward.ad_unit_id` 后才能领奖；后端未配置广告位时拒绝创建会话和领奖。超级签到使用 `/checkin/super/session` 创建独立广告会话，不走 `/ads/reward`，不占用广告积分每日次数。
- **邀请登录**：邀请分享路径改为真实登录页并携带 `inviteCode`；登录页读取 `inviteCode/scene` 并透传到微信登录，生产环境隐藏开发登录按钮。
- **模板运营**：生图、生视频页面优先读取后台 `/templates` 数据，生产环境不再展示 mock 模板；开发环境接口为空或失败时才保留本地兜底。后台图片/视频模板上传使用浏览器自动生成 multipart boundary，模板接口会把本地相对媒体地址补成小程序可显示的 URL。
- **AI 漫剧**：移除前端硬编码"开发进度90%"阻断，提交复用视频任务链路；首页不再使用开发预览公告。
- **中文错误**：任务创建、查单、支付参数缺失等小程序可见错误改为中文提示。

### 2026-06-04 第三轮修复（#13-#21）

- **#13 支付操作日志**：`query-wechat` 和 `regrant` 操作写入 `admin_operation_logs`
- **#14 升级回滚警告**：DB 迁移后回滚时附加备份路径和恢复指引
- **#15 PM2 重启参数**：添加 `--max-restarts 30 --restart-delay 3000 --min-uptime 10000`
- **#16 备份验证增强**：`verifyBackup` 新增 SQL 文件头检查（含 CREATE TABLE/INSERT 等关键字）
- **#17 签到事务连接**：`hasTodayNormalSign` 支持传入 `PoolConnection`，事务内使用 `conn.execute`
- **#18 补签默认成本**：`makeup_cost_points` 默认值从 `'0'` 改为 `'10'`，与迁移一致
- **#19 广告会话锁**：`createAdRewardSession` 用事务 + `FOR UPDATE` 包裹每日限额检查和插入
- **#20 广告会话清理**：新增 `cleanupExpiredAdSessions` 定时任务，每天凌晨 3 点清理 24 小时以上的过期 pending 会话
- **#21 邀请奖励日志**：`grantInviteMemberPurchaseReward` 失败从 `console.warn` 改为 `console.error`（含 orderNo/userId）

### 2026-06-10 签到兼容老用户积分账户

- `lockPointAccountTx` 在用户缺少 `point_accounts` 记录时会先幂等补建 0 余额账户，再继续积分变动；避免老用户普通签到因“积分账户不存在”失败。
- 用户资料接口新增 `displayId`，小程序个人页展示 8 位非顺序对外ID，避免通过用户ID推断注册用户数量；内部 `id` 不变。

### 2026-06-11 签到表标准字段修复

- 新增迁移 `20260611_001_signin_records_updated_at.sql`：`signin_records` 必须包含 `updated_at`，与签到写入逻辑保持一致。
- 新安装 schema、安装/运行时/后台就绪检查同步校验 `signin_records.updated_at`。

### 2026-06-10 Release 打包日志降噪

- `scripts/build-release.sh` 的 `npm ci` 增加 `--no-audit --no-fund`，避免审计和赞助提示被误认为打包错误。
- 后台 Vite gzip 插件关闭 verbose 输出，避免 WSL/Git Bash 下打印绝对路径式压缩日志。

### 2026-06-10 小程序开发环境 API 地址

- 小程序 `devEnv.baseURL` 默认改为 `https://mini.thtapi.com/api/v1`，避免微信开发者工具 `dev` 构建误请求本机 `127.0.0.1:3000` 导致接口返回 HTML/空响应并报“接口未返回标准JSON”。
- 如需连本地后端，可在 `uni-app/.env.development` 显式设置 `VITE_API_BASE_URL=http://127.0.0.1:3000/api/v1`。

### 2026-06-04 备份管理后台页面

- 新增 `routes/admin-backup.ts`：备份历史列表、手动触发、测试邮件、邮件配置
- 新增 `admin-web/src/pages/BackupManagement.tsx`：备份管理页面（历史+配置+手动操作）
- 后台菜单新增「备份管理」（`/backup`），位于「系统更新」下方

### 2026-06-04 备份邮件通知

- 新增 `services/backup-email.service.ts`：备份完成后自动 gzip 压缩并通过 SMTP 发送到指定邮箱
- 配置方式：
  - 后台「备份管理」保存 `backup.*` 和 `backup.email.*` 到 `system_configs`
  - `backup.email.smtp_pass` 按密钥配置加密保存，页面只展示脱敏状态
  - 旧 `BACKUP_EMAIL_*` 环境变量仅作为兼容兜底，不作为新部署配置入口
- 压缩后超 20MB 不发附件，改发纯文本通知
- 邮件发送失败不影响备份本身

### 2026-06-04 上线前修复（公告弹窗 / 默认参数 / Auth / 仪表盘 / 云存储 / 层级事务）

- **公告弹窗**：前端新增 `api/announcements.ts` + home 页 popup modal，后端 `/app/home` 返回的 `popupAnnouncement` 现在正确展示
- **公告频率**：`/announcements/popup` 与 `/app/home.popupAnnouncement` 统一使用后台 `show_frequency` 规则；公告条继续展示有效公告，不因已读/关闭隐藏
- **默认参数**：生图使用 `sizeOptions/defaultSizeKey` 表示合法的“比例 + 清晰度”组合；`1K/2K/4K` 是业务清晰度预设，不再作为 provider `quality` 透传
- **图片模型适配**：GPT Image 2 上游只提交 `size/n`，自动尺寸提交 `size:"auto"`，非自动尺寸按上游 22 个 `size` 枚举映射；小马 Nano Banana Pro/2 上游提交 `aspectRatio/imageSize`，Nano Banana 2 固定补 `thinkingLevel:"high"`，普通图片模型继续提交 `aspect_ratio/resolution`
- **Auth hydrate**：`App.vue onShow` 增加 `authStore.hydrate()`，深链接/推送进入时 token 正确加载
- **仪表盘**：`totalUsers` 和 `todayNewUsers` 加 `WHERE deleted_at IS NULL`，排除软删除用户
- **云存储删除开关**：管理面板文件删除增加 `storage.delete_cloud_object` 配置开关（默认 false）
- **层级事务**：`POST /model-tiers` 用事务包装层级 + 能力插入，防止悬挂状态

### 2026-06-04 CodesOnline 供应商更新 + 档位绑定修复

- 新增迁移 `20260604_001_update_codesonline_provider.sql`：更新 Base URL + 将 gpt-image-2 绑定为 image_standard 主模型
- 新增迁移 `20260607_002_image_model_size_options.sql`：为 GPT Image 2 和 Nano Banana 写入业务尺寸组合、默认尺寸和多图能力配置；迁移保留原模型 `config.capabilities/endpoints/default_params`
- 新增迁移 `20260609_001_fix_gpt_image2_size_options.sql`：修正已部署环境中的 GPT Image 2 尺寸配置，`1K/2K/4K` 均支持 `1:1/2:3/3:2/3:4/4:3/9:16/16:9`，并把 `sizeKey` 映射为上游真实 `size` 值
- 新增迁移 `20260609_002_fix_xiaoma_nano_banana_size_options.sql`：仅修正小马 `gemini-3-pro-image-preview` 与 `gemini-3.1-flash-image-preview` 的尺寸配置；Pro 为 11 比例 × `1K/2K/4K`，Nano Banana 2 为 15 比例 × `0.5K/1K/2K/4K`，并固定 `thinkingLevel=high`
- 新增迁移 `20260609_003_fix_xiaoma_video_capabilities.sql`：修正小马视频模型比例、清晰度、时长、声音模式和参考图上传模式，保证小程序只展示真实可提交能力
- 新增迁移 `20260609_004_video_dynamic_pricing.sql`：为 `model_tiers` 增加 `pricing_mode/pricing_rules`，视频下单按时长、清晰度、声音等参数动态计算创作点
- 新增迁移 `20260609_005_bind_xiaoma_video_launch_tiers.sql`：上线首批小马视频档位，覆盖 Sora/Grok/即梦/可灵/Veo 3.1/Omni Flash/SD 2.0 首尾帧/SD 2.0 参考生，并为 SD 2.0 全能参考配置最多 9 张参考图
- 新增迁移 `20260614_005_refresh_xiaoma_media_model_configs.sql`：按 2026-06-14 小马 `API接口SKILL.md` 刷新 40 个视频模型和 7 个音频模型的 `param_names/default_params/supported_*`，把小马媒体模型 `query_task_url` 改为 `/v1/skills/task-status?task_id={task_id}`，并同步公开小马视频档位能力；SD 2.0 参考生只记录 `version` 为上游字段，不写入默认 `version`
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
- 新增 `POST /api/v1/admin/cron/:taskName` 手动触发端点（需 super_admin）
  - `membership-expiry`：会员过期处理
  - `monthly-points`：月度积分发放
  - `daily-backup`：每日数据库备份
  - `ad-cleanup`：过期广告会话清理
- 可用系统 crontab 做兜底：`curl -X POST .../cron/daily-backup -H "Authorization: Bearer <token>"`

### 2026-06-04 定时数据库备份

- 新增 `services/backup.service.ts`：按后台配置的小时自动执行 `mysqldump --single-transaction --routines --triggers`
- 备份路径默认 `{appRoot}/backups/db/auto/{YYYYMMDD}.sql`，可在后台改保存目录；保留天数也由后台配置
- 备份失败自动重试一次；验证文件大小 > 0

### 2026-06-06 备份后台配置化 / 小程序导航 / AI 文本能力说明

- 新增迁移 `20260606_001_backup_admin_configs.sql`：种子化 `backup.*` 与 `backup.email.*`。
- 新增迁移 `20260606_002_miniapp_tabbar_default.sql`：新安装默认下发 5 个底部导航项，后台保存后可覆盖。
- `GET /admin/backup/history` 返回 `backup` 和 `email` 配置状态，历史列表按当前备份目录读取。
- `PUT /admin/backup/email-config` 兼容旧路径名，但现在保存备份目录、保留天数、自动时间、SMTP 全量字段。
- `/public/app` 新增 `navigation.tabBar/navigation.bottom/navigation.tabs`，与 `tabBar` 同步，方便小程序自定义底部导航读取。
- 后台「功能开关」明确 AI 文本能力入口；「系统设置 → AI 文本能力」配置模型 ID/积分；「内容管理 → 系统提示词」配置智能优化、提示词生成、脚本生成和分镜生成的提示词。

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
- AI 输出保存会校验图片内容魔数，支持 data URL/裸 base64 直接落盘；URL 下载或转存临时失败会按 `TASK_OUTPUT_TRANSFER_ATTEMPTS` 重试，确认不是有效图片/视频时才失败退款。
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
- `miniapp_help.*`：小程序使用帮助，含启用状态、标题、兼容单条 HTML 富文本内容，以及 `miniapp_help.items_json` 多条帮助内容。每条帮助可配置标题、副标题、图片/视频 URL、固定展示比例和可复制文本块；小程序目录卡片只展示标题和副标题，点击后进入详情页。后台「微信配置 → 使用帮助」的「使用帮助内容」标签页以表格维护条目，点进条目弹窗编辑富文本。后台保存和公开下发都会净化 HTML。
- `miniapp_prompt_guides.*`：生成页提示词引导。`miniapp_prompt_guides.enabled` 控制总开关，`miniapp_prompt_guides.items_json` 按固定模式 key 配置主提示词占位文字和“不会写提示词？”轻量弹层文案。支持的 key 为 `ai_image.text2img`、`ai_image.img2img`、`ai_image.edit`、`ai_video.text2video`、`ai_video.img2video`、`ai_video.reference`、`ai_video.first_last_frame`、`ai_video.edit`、`comic.story`。后台「微信配置 → 使用帮助」的「功能页帮助按钮」标签页单独维护这些入口。迁移 `20260617_001_miniapp_prompt_guides.sql` 会写入默认配置行。
- `membership.*`：会员开关。
- `invite.*`：邀请奖励。
- `signin.*`：签到、补签、超级签到。
- `ad.reward.*`：激励广告奖励。生产环境必须配置 `ad.reward.enabled=true` 和真实微信激励视频广告位 `ad.reward.ad_unit_id`，否则小程序只展示不可用提示，不会发放广告积分。超级签到复用 `ad.reward.ad_unit_id` 作为微信广告位，但奖励和次数统计独立于广告积分。
- `miniapp.tab_bar`：小程序底部导航。
- `tools.*`：工具箱开关、`tools.visible_keys`、会员/非会员每日免费次数、广告解锁开关、工具积分收费和维护文案。小程序工具页会读取 `tools.enabled`、`tools.visible_keys` 和每个 `tools.{toolKey}.*`。工具页配置位置是后台「微信配置 → 工具页配置」。
- `ai_*`：AI 文本辅助功能兜底配置。

重要微信支付回调地址：

```text
https://your-domain.com/api/v1/payments/wechat/notify
```

小程序 JSAPI 支付必须使用当前小程序 AppID；后台「微信配置 → 微信小程序」和「微信支付」的 AppID 应保持一致。服务端请求微信支付 v3 时，`Authorization` 参数按微信规范用英文逗号分隔，不能用空格分隔，否则微信会返回 `SIGN_ERROR`。

本地存储默认公开路径：

```text
/static
```

生产环境如使用 CDN 或反向代理，必须把 `storage.local.base_url` 设置为公网 HTTPS 完整地址。安装时本地上传目录默认写入 `APP_ROOT_DIR/uploads`。若旧库里仍是默认 `/www/wwwroot/ai-creator/uploads`，可设置 `LOCAL_UPLOAD_DIR=/实际可写/uploads` 后执行 `npm run db:migrate` 同步；若数据库里公开地址仍是默认 `/static`，可设置 `LOCAL_BASE_URL=https://你的后端域名/static` 后同步。已有自定义存储值不会被覆盖。

后台和小程序上传会在写入存储前重新加载 `storage.*` 配置；修改后台存储配置后无需改代码，但要确保 `storage.local.upload_dir` 指向服务进程可写目录，`storage.local.base_url` 指向可访问的 `/static` 地址。本地开发时应通过安装参数或 `db:migrate` 把 `LOCAL_UPLOAD_DIR`/`LOCAL_BASE_URL` 同步到数据库，避免 WSL 或本机服务写入 `/www/wwwroot/...`。后台 `/admin/files/upload` 和小程序 `/files/upload` 统一使用磁盘临时文件接收后流式转存，COS/OSS/本地/EOS/七牛/又拍云服务端中转均避免大视频整块进入 Node 内存；后台页面所有 `FormData` 上传都不要手写 `Content-Type: multipart/form-data`，必须让浏览器自动生成 boundary。长期保存到模板/配置时优先使用 `data.deliveryUrl/data.publicUrl/data.cdnUrl/data.storageUrl/data.url`，使小程序只配置 CDN 下载域名时也能保存到相册；`data.publicProxyUrl` 只作为公开代理兜底。`/api/v1/files/:fileNo/content` 和后台内容预览代理支持 `Range` 分段请求，便于视频播放和拖动；文件内容代理读取超时可通过 `FILE_CONTENT_PROXY_TIMEOUT_MS` 调整，默认 120000。`/templates*` 和 `/public/templates` 下发前会把可匹配到 `files` 表的历史代理地址或裸对象存储地址优先纠偏为 CDN 地址；缺少 `cdn_url` 的老记录仍可能回退代理，需要补齐 CDN 地址或重新上传。后台即时预览优先使用最新 `data.accessUrl/data.previewUrl` 签名地址。

公网文件代理 URL 生成优先使用 `APP_PUBLIC_URL/PUBLIC_API_DOMAIN/SITE_API_DOMAIN`，其次使用反向代理的 `X-Forwarded-Proto/X-Forwarded-Host`；若生产域名请求未带转发协议且不是本地地址，默认生成 HTTPS，避免宝塔/Nginx 反代下把小程序媒体地址降级为 HTTP。

本地通过 `http://127.0.0.1` 或 `http://localhost` 访问后端时，服务端不会下发 HSTS 和 `upgrade-insecure-requests`，避免浏览器把 `/static/...` 自动升级成 HTTPS 导致预览破图。公网生产域名仍按生产环境安全头强制 HTTPS。

生产环境会在 SPA fallback 前拦截常见探测路径，如 `/@fs`、`/proxy?url=...`、`/?url=...`、`/?dest=...`，避免扫描请求拿到后台 HTML。

## 模型和档位

核心表：

- `model_features`：功能，例如 `image_create`、`video_create`。
- `model_tiers`：小程序可选档位，含默认积分价格和动态定价字段 `pricing_mode/pricing_rules`。
- `ai_model_providers`：模型供应商。
- `ai_models`：真实模型。
- `tier_model_bindings`：档位到真实模型的绑定。

小程序创建任务时应传 `tierKey` 或 `tierId`。后端根据档位和绑定选择真实模型，不允许小程序直接指定 `modelId`。工具页的模型能力也走同一套功能页配置：`tool_prompt_reverse` 用于反推提示词，`tool_cutout` 用于智能抠图后续模型化接入；后台绑定入口只在「微信配置 → 工具页配置」显示。

小程序只展示可提交任务的档位。一个入口必须同时满足：`model_features` 与 `model_tiers` 启用、至少一个绑定模型启用、供应商启用且 Base URL/API Key 已配置、绑定模型能力匹配当前 feature。后台「功能页配置」的绑定状态检查按同一口径展示“可展示/需检查”；如果小程序档位为空，应先检查这些条件，而不是在前端写兜底档位。

运行时价格以 `model_tiers.points_cost` 作为默认/兜底价；如档位配置了 `pricing_mode/pricing_rules`，图片任务会按 `resolutionPreset/quality/resolution` 命中分辨率价格，视频任务会按提交参数动态计算基础创作点，再应用会员功能折扣。模型降级以 `tier_model_bindings` 的主模型/备用模型顺序为准。旧表 `ai_model_price_rules`、`ai_model_fallback_rules` 和历史字段 `quality_multipliers` 仅为兼容数据，不参与小程序任务扣费或降级选择。

后台「功能页配置」新增或编辑入口时，主模型下拉会读取 `ai_models.config` 的 `supported_durations/supported_qualities/supported_resolutions/resolution_presets/supported_audio_modes` 以及 `default_params`，把时长、清晰度/分辨率和声音渲染为定价矩阵选项；如果矩阵行仍为空，会按模型参数自动生成待定价行，但不会覆盖运营已经手动填写的价格。

会员功能折扣按套餐和功能配置在 `member_plan_feature_discounts`：`discount_percent=100` 表示无折扣，`95` 表示按原积分 95% 扣费。`GET /public/model-tiers` 在带有效用户 token 时会返回会员折扣后的 `pointsCost`，同时返回 `basePointsCost/memberDiscountPercent/memberDiscountApplied/pricing`。图片任务创建时后端会先按所选 `resolutionPreset` 命中 `pricing_rules` 单张价格，再按 `pointsCost × imageCount` 重新计算并冻结、扣减和失败退款；未配置动态规则的档位继续按固定价扣费。视频任务会按 `duration/quality/resolution/audioMode` 等参数命中 `pricing_rules`，前端展示只作为预计，真实扣费以后端任务创建时重算结果为准。

工具页不走 AI 任务表，使用 `tool_usage_logs` 记录每日次数。工具积分收费开启时，免费次数和广告解锁之外的使用会扣积分并写入积分流水，处理异常自动退款。需要模型的工具读取功能页默认档位和 `tier_model_bindings`：`tool_prompt_reverse` 会直接调用绑定模型的 OpenAI-compatible `chat/completions` 图片输入；若没有可用绑定、供应商 Key 缺失或调用失败，会回退本地提示词。`tool_cutout` 的绑定入口已存在，但运行时仍使用本地背景移除，接入真实供应商抠图能力时应在工具服务中补对应 provider adapter，不要直接在小程序指定真实模型。

工具执行页横幅广告读取 `tools.banner_ad_unit_id`，后台配置入口在「微信配置 → 工具页配置」。该字段只控制小程序工具执行页底部 `<ad>` 横幅展示，未配置时前端应完全隐藏广告容器；非会员看广告解锁仍继续使用 `ad.reward.ad_unit_id` 激励视频广告位，两者不要混用。

工具积分收费：每个工具可单独设置 `pointsEnabled` 与 `pointsCost`。默认关闭，开启后仅在免费次数耗尽且没有可用广告解锁时扣费；扣费成功后 `usageSource=points`，处理失败会自动退还。运营配置入口在「微信配置 → 工具页配置」。

图片编辑支持主图 `uploadKeys`，并可额外传 `maskFileId/maskUrl`、`backgroundFileId/backgroundUrl`。视频任务会按 `videoMode` 自动匹配默认功能：文生视频、图生视频、首尾帧视频和视频编辑；视频编辑支持 `videoFileId`、`videoUrl` 或上传返回对象。

视频任务参数链路会保留 `audioMode`、`preserveAudio`、`referenceMode`、可选高级参数 `seed/fps/audioUrl/audioFileId` 和清洗后的 `inputAssets`。档位能力表 `tier_capabilities` 包含 `supported_audio_modes/default_audio_mode`、`max_reference_images`、`max_video_urls` 和 `max_audio_urls`；公开接口返回 `capabilities.audioModes/defaultAudioMode/maxReferenceImages/inputMode/referenceUploadMode/minReferenceImages/requiredReference/inputMediaTypes/maxVideoUrls/maxAudioUrls/advancedParams`。`advancedParams` 来自模型显式 `advanced_params/supported_advanced_params` 或 `param_names/input_keys`，只保留小程序可渲染的 `seed/fps/audioUrl`；为空时前端不展示高级参数入口，也不提交草稿里残留的高级参数。`referenceUploadMode=first_frame` 表示单首图图生视频，`reference_images` 表示多参考素材参考生视频，`first_last` 表示首尾帧，`source_video` 表示视频编辑；小程序的「图生视频」和「参考生视频」都提交后端 `image_to_video`，通过 `referenceMode` 区分 UI 和 provider 参数映射。单一能力项也要返回给前端并显示为锁定态，例如固定 `8s`、固定 `1080p`、固定 `audio/silent`。`minReferenceImages/maxReferenceImages/maxVideoUrls/maxAudioUrls` 控制图生视频素材池，后端创建任务时会按最少和最多数量二次校验；首尾帧固定首图/尾图 2 张，图片编辑和视频编辑走各自单素材逻辑。`inputAssets` 不再只是结果页展示数据：图片素材会进入参考图池，视频素材会进入 `videoUrl/videoUrls`，音频素材会进入 `audioUrl/audioUrls`，外链素材必须是公网 `http/https` URL。
首批小马视频上线档位由 `20260609_005_bind_xiaoma_video_launch_tiers.sql` 写入。配置小马 Base URL/API Key 后，公开档位应能看到 `video_create`、`image_to_video`、`first_last_frame_video`、`video_edit` 四类入口；SD 2.0 参考生使用 `token_preauth` 预扣，不在本系统按 token 数量自动补扣或退款。
小马媒体模型按最新 `API接口SKILL.md` 拉取的能力文档调用：创建仍为 `POST /v1/media/generate`，默认轮询端点为 `GET /v1/skills/task-status?task_id={task_id}`，以 `state/is_final` 判断终态；历史配置里写了 `queryTaskUrl` 时适配器仍会按该模板拼接，避免破坏后台手动配置。
后台「供应商与模型」同步小马模型时会拉取 `type=image/video/audio` 三类媒体模型，并保留小马返回的媒体类型，避免 TTS/音乐模型被按名称猜成 `text`。当前小程序公开入口仍只覆盖图片和视频；音频模型已刷新后台字段，但真正开放音频创作入口前还需要补产品入口、任务类型路由和音频专用参数/音色选择流程。

图片任务支持平台显式水印：`platformWatermarkEnabled` 缺省为 `true`，服务端会在最终图片左下角写入 `AI艺术生成工坊`。用户确认关闭后前端按账号偏好传 `false`，服务端不添加可见平台水印，并在 `files.platform_watermark_removed` 标记。图片编辑选择 `去水印` 时服务端强制不叠加平台水印。视频任务不支持平台水印开关，视频产物不做平台水印处理。

任务输出写入 `ai_task_outputs` 时会同步写 `thumbnail_key`。图片输出复用最终产物 key 作为缩略图；视频仅在上游返回 `thumbnailUrl/thumbnail` 时写入真实缩略图，否则前端和模板发布使用视频输出 URL 兜底。

法律协议种子包含三份必签协议：`user_agreement`、`privacy_policy`、`ai_content_rules`。涉及平台水印、关闭水印确认、生成内容合规和创作点/积分交易性质的更新应通过新版本 `legal_documents` 迁移发布，避免修改已经执行过的历史迁移。

WellAPI 使用 `provider_type=wellapi`，Base URL 默认为 `https://wellapi.ai`。迁移会 seed 低价视频模型和 `qwen-image-2.0` 文生图模型，并为默认业务档位写入模型绑定。文本辅助功能会在 `system_configs` 为空时默认绑定 `xiaoma/gpt-5.2-chat-latest`，不覆盖后台已有配置。种子和迁移都不会把真实 API Key 写进 SQL；上线前可在后台「AI 模型管理 → 供应商与模型」填写，也可通过环境变量 `OPENAI_API_KEY/XIAOMA_API_KEY/DEEPSEEK_API_KEY/BAGEGE_API_KEY/WELLAPI_API_KEY/CODESONLINE_IMAGE_API_KEY/APIMART_API_KEY/HONGNIAO_API_KEY` 在安装或 `db:migrate` 后加密同步到 `ai_model_providers`；迁移脚本只同步非占位值，不会把 `PLEASE_REPLACE`、`your_*` 这类模板值写入数据库。未配置 Key 时，小程序档位列表会跳过对应供应商绑定；如果某个档位没有任何可用绑定，创建任务会被后端明确拦截。

DeepSeek 使用 `provider_type=openai_compatible`，Base URL 默认为 `https://api.deepseek.com`。迁移 `20260617_002_seed_deepseek_prompt_optimize.sql` seed `deepseek-v4-flash` 文本模型，能力包含 `text_chat/text_generation/prompt_optimize`，并绑定 `ai.prompt_optimize.model_id`。智能优化走 `/chat/completions`，模型默认参数可在 `ai_models.config.default_params` 中调整；上线前通过 `DEEPSEEK_API_KEY` 或后台供应商页面保存密钥。

Hongniao AI 使用 `provider_type=hongniao`，Base URL 默认为 `https://open.hongniaoai.com/v1`，请求鉴权头为 `X-API-Key`。迁移 `20260707_002_hongniao_open_domain_and_sync_metadata.sql` 只把旧 `https://hongniaoai.com` 配置升级到新域名，不覆盖后台自定义的非旧域名配置，也不写入明文 API Key。后台「供应商与模型 → 同步模型」会实时请求 `GET /v1/models`（当前文档页显示 21 个可用模型），解析 `data.models/tasks[].parameters`，写入上游成本、计费单位、常用能力字段和 `config.remote_parameters` 原始参数快照；已有模型会保留后台配置的售卖价格、显示名和启停状态。若红鸟远端删除模型，预览会列入 `removals` 并展示受影响的档位绑定和 fallback 规则；确认 apply 后只软停用模型、写入 `config.upstream_removed_at`，并解除前台绑定/fallback，历史任务和模型记录不硬删。后台模型编辑页只可视化编辑常用能力字段，完整原始参数在详情页只读查看。视频创建走 `POST /v1/videos`，查询走 `GET /api/v1/videos/{id}`；图片创建走 `POST /v1/images`，查询走 `GET /api/v1/images/{id}`。上线前可在后台供应商配置粘贴 API Key，或通过 `HONGNIAO_API_KEY` / `HONGNIAOAI_API_KEY` 在安装或 `db:migrate` 后加密同步；普通验收优先使用 `npm run check:hongniao-video` 做非生成验证，「真实模型测试」会调用真实上游并可能消耗额度。

启动后会非阻塞检查是否存在至少一个 active provider 同时配置了 Base URL 和 API Key；没有时会打印 warning，后台配置检查也会显示错误。真实 Key 不写入仓库、`.env.example` 或 SQL seed。

APIMart 使用 `provider_type=apimart`，Base URL 默认为 `https://api.apimart.ai/v1`。迁移 `20260531_007_seed_apimart_models.sql` 会 seed GPT Image、Nano Banana 图片模型和生成类视频模型，并新增 `apimart_*` 专属档位和绑定；不会写入 API Key，也不会把现有默认档位切换到 APIMart。后台填写 APIMart 的 Base URL 和 API Key 后，选择 APIMart 专属档位即可调用。Midjourney/MJ 当前不入库，因为 APIMart 公开文档没有对应模型条目；avatar 资产和 remix 接口也不接入标准创建任务流程。

会员套餐积分规则中，`immediate_points` 和 `gift_points` 在支付权益发放时立即到账；`grant_mode=monthly/mixed` 且 `monthly_points>0` 时，系统按 30 天周期自动发放月度积分，并以 `point_logs(source, ref_type, ref_id)` 防重复补发。

会员积分过期策略当前未上线：接口统一返回 `pointsExpireType=none`、`pointsExpireEnabled=false`，后台保存积分规则时也会写入 `points_expire_type='none'`。会员到期只处理会员权益降级，不会自动扣回已到账积分。

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

后台「供应商与模型」列表使用 `GET /admin/models/providers?paginate=1` 和 `GET /admin/real-models?paginate=1` 做真实分页和筛选；旧调用不传 `paginate/page/pageSize` 时继续返回数组。供应商 API Key 和微信 AppSecret 只通过复制接口短暂返回明文，页面默认展示脱敏值，编辑时留空不覆盖原密钥。功能页入口删除使用 `DELETE /admin/model-tiers/:id`，会同时删除入口能力和模型绑定关系；停用入口仍使用 `PUT /admin/model-tiers/:id` 更新 `status`。
后台用户管理的 `GET /admin/users` 和 `GET /admin/users/:id` 返回 `phone` 明文字段，列表和详情页直接展示用户绑定手机号；该展示只作用于登录后的后台管理接口，小程序用户侧仍按 `phoneBound`/脱敏口径处理。
- 对象存储：COS、OSS、七牛、又拍云、移动云、本地存储。
- 腾讯云 COS 服务端上传和删除使用官方 `cos-nodejs-sdk-v5`，不要在业务代码里手写 XML API 签名；Bucket 必须包含 APPID 后缀，Region 必须与存储桶地域一致。
- 上线配置检查、功能开关、系统更新、备份管理、系统设置、操作日志。

新增后台页面时，需要同时改 `Layout.tsx` 的菜单和 `<Routes>`，页面组件应使用 `React.lazy` 动态导入，不要在 `Layout.tsx` 顶部静态 import 业务页面，避免把所有后台页面打进首屏 JS 包。

迁移 `20260531_008_seed_scraped_template_content.sql` 会写入 DoodleAI 提示词广场 30 条灵感种子和献丑活动 1 的 20 条视频模板种子；`20260612_002_inspiration_templates_to_media_types.sql` 会把历史 DoodleAI `template_type=inspiration` 纠正为真实 `image`/`video` 类型，并保留 `display_config.inspiration`。DoodleAI 的视频内容把视频地址写入 `templates.preview_url` 和 `params_json.videoUrl`；献丑公开接口没有独立生成提示词字段，入库提示词优先使用公开描述，描述为空时使用标题并在 `params_json.promptSource` 标记来源。

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
APP_ROOT_DIR/uploads
```

Express 会把本地上传目录挂到 `LOCAL_BASE_URL`。开发环境可用 `/static`，生产环境应配置为公网 HTTPS 完整地址，例如 `https://你的后端域名/static`，否则微信小程序和第三方模型无法稳定访问文件；上线检查会拦截 `/static` 和示例域名。宝塔生产部署通常设置 `APP_ROOT_DIR=/www/wwwroot/ai-creator`，因此上传目录会落到 `/www/wwwroot/ai-creator/uploads`。

## 发布包脚本

当前只维护两个根目录脚本：

- `scripts/build-release.sh`：构建验证并生成 `.tar.gz` 发布包。
- `scripts/build-release.sh` 会执行后端架构主线检查、`check:payment`、`check:migrations-idempotent`、`check:video-pricing` 和 `check:xiaoma-video-params`；需要确认真实微信收款配置时，用 `REQUIRE_WECHAT_PAY_READY=1 bash scripts/build-release.sh <version>`。
- `scripts/inspect-release.sh`：检查发布包结构和危险文件。

不要再新增重复的部署、诊断、更新脚本；优先把运行期检查放到 `server/scripts/check-*.ts` 或后台更新服务中。

## 文档维护

- API 有变化时更新 [API.md](API.md)，同时同步后台的 `admin-web/src/pages/ApiReference.tsx`。
- 部署、打包、更新流程变化时更新 [DEPLOYMENT.md](DEPLOYMENT.md)。
- 代码结构、配置键、开发约定变化时更新本文档。
- 不再新增按模块拆散的长文档，除非内容无法自然合并进这三个维护文档。
