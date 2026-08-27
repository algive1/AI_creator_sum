# API 索引

基础地址：

- 健康检查：`/health`
- 小程序与公开接口：`/api/v1`
- 管理后台：`/api/v1/admin`
- 安装向导：`/api/install`

统一响应：

```json
{ "code": 0, "message": "success", "data": {} }
```

`GET /health` 不使用统一响应格式，直接返回：

```json
{ "status": "ok", "releaseVersion": "1.0.1", "timestamp": "2026-05-31T00:00:00.000Z" }
```

后台更新流程会用 `releaseVersion` 判断 PM2 是否已切到目标版本。

鉴权：

- 小程序登录后使用 `Authorization: Bearer <token>`。
- 管理后台登录后使用 `Authorization: Bearer <admin_token>`。
- 微信支付回调、对象存储回调、公开配置接口不走用户 token。

限流：

- 全局接口：每 IP 每分钟 200 次。
- 登录类接口：每 IP 每分钟 10 次。
- AI 任务提交：`POST /api/v1/tasks/image`、`POST /api/v1/tasks/video` 默认每用户每分钟 10 次，可用 `AI_TASK_CREATE_RATE_LIMIT_PER_MINUTE` 调整。
- 后台真实 AI 测试：默认每管理员每分钟 3 次，可用 `ADMIN_AI_TEST_RATE_LIMIT_PER_MINUTE` 调整。

## 安全响应头

所有接口响应均包含以下 HTTP 头：
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Content-Security-Policy`：默认限制后台/API 资源来源，可用 `CONTENT_SECURITY_POLICY` 覆盖。
- `Strict-Transport-Security`：生产环境或 `ENABLE_HSTS=true` 时启用；本地 HTTP 调试可设置 `ENABLE_HSTS=false`。

## Smart Prompt Completion Speed (2026-07-05)

- `POST /api/v1/tasks/optimize-prompt` 不缓存最终 `optimizedPrompt` 结果。同一用户对同一提示词多次点击智能补全，应继续请求文本模型，以便生成不同候选版本。
- 后端只缓存文本能力模型绑定和 `system_prompts` 组合内容，TTL 为 60 秒；后台新增或编辑系统提示词后会清理对应 `target_feature` 的提示词缓存，保存「AI 文本能力」设置后会清理文本能力模型绑定缓存。
- 请求体 `context` 会在后端白名单化：保留创作模式、比例、时长、清晰度、入口档位和参考素材数量；过滤素材 URL、本地路径、fileId、fileNo 等标识，减少 token 和敏感信息进入文本模型。
- 小程序生图/生视频的智能补全按钮在请求中显示 loading，并阻止重复点击；失败或成功后恢复按钮。
- 后台「系统设置 → AI 文本能力」新增「编辑智能补全提示词」入口，跳转到「内容管理 → 系统提示词」并聚焦 `targetFeature=prompt_optimize`。

## Free Image Quota (2026-07-06)

- 新增迁移 `20260706_001_free_image_quota.sql`，创建 `user_free_image_quotas` 汇总账本和 `free_image_quota_logs` 流水表。额度按图片张数计算，不按任务数计算。
- 新增补充迁移 `20260707_001_free_image_quota_allowed_tier_keys.sql`，用于已执行过旧版同名免费额度迁移的环境补齐 `free_image_quota.allowed_tier_keys` 配置行。
- 后台「微信配置 → 底部导航」新增非会员免费生图配置，写入 `free_image_quota.enabled/daily_limit/total_limit/allowed_tier_keys/show_in_daily_tasks/exhausted_message`。迁移默认不开启功能，`allowed_tier_keys` 默认 `image_standard,image_pro`，即标准和专业生图可免费，`image_top` 这类高成本入口继续走积分。推荐先配置每日 1 张、总 3 张后小流量打开。
- `GET /api/v1/public/app` 新增轻量配置 `freeImageQuota={ enabled, showInDailyTasks, dailyLimit, totalLimit, allowedTierKeys, exhaustedMessage }` 及同名扁平 key；不返回登录用户剩余额度。
- 新增 `GET /api/v1/free-image-quota/me`，需用户 token，返回当前用户额度状态：`enabled/eligible/canUseFreeQuota/dailyRemaining/dailyLimit/totalRemaining/totalLimit/remaining/allowedTierKeys/showInDailyTasks/exhaustedMessage/membershipEnabled/purchaseEnabled`。
- `POST /api/v1/tasks/image` 支持后端自动选择计费来源。非会员、当前 `tierKey` 在 `allowedTierKeys` 白名单内，且免费额度足够覆盖本次 `imageCount` 时返回 `billingSource:"free_quota"`，不冻结/消耗积分；会员、非白名单档位或显式传 `billingSource:"points"` 时继续走积分体系。
- 额度不足不做“部分免费 + 部分积分”混合支付，返回 `code=4606`，`data` 包含 `requestedImages/dailyRemaining/totalRemaining/estimatedPointsCost/pointsCost/canUsePoints/pointsBalance/membershipEnabled/purchaseEnabled`。小程序应提示减少张数或用户确认后带 `billingSource:"points"` 重试。
- 成功任务按实际成功图片数消耗额度；队列满、失败、取消释放预占；部分成功只消耗成功张数，释放未成功张数。启动和小时巡检会小批量恢复已失败/取消/任务不存在的长期预占。

## Web User Auth (2026-06-27)

PC 用户网页端 `ooa8.com` 使用普通用户 token，接口前缀仍为 `/api/v1`，不要使用后台 `admin_token`。

- `POST /api/v1/auth/register`
  - Body: `{ "email": "name@example.com", "password": "至少8位", "nickname": "可选", "inviteCode": "可选" }`
  - 成功后创建 `account_type='email'` 用户、`password_hash`、邀请码资料、积分账户、新人积分日志和用户资产。
  - 重复邮箱返回 `PARAM_ERROR`；弱密码返回 `PARAM_ERROR`。
- `POST /api/v1/auth/login`
  - Body: `{ "email": "name@example.com", "password": "..." }`
  - 成功后返回 `token`、`refreshToken`、`user`、`points`、`membership`，其中 access token 的 `clientType='web'`。
- `POST /api/v1/auth/refresh-token`
  - Body: `{ "refreshToken": "...", "clientType": "web" }`
  - 新版 refresh token 会携带 `clientType`；旧 token 未携带时可通过 body 的 `clientType=web` 刷新为网页端 access token。

网页端第一版账号独立于微信小程序账号，不自动继承小程序积分和作品。网页端不开放支付、不创建网页支付订单；积分不足时前端提示签到、邀请、联系客服或使用小程序处理。

网页创作复用现有接口：

- 生图：`GET /api/v1/public/model-tiers?feature=image_create&clientType=web`，`POST /api/v1/tasks/image`
- 生视频/漫剧：`GET /api/v1/public/model-tiers?feature=video_create&clientType=web`，`POST /api/v1/tasks/video`
- 模型选择：`GET /api/v1/public/model-tiers` 的每个条目会返回绑定主模型的 `modelName`、`apiModelName`、`upstreamModelCode`、`providerType`，并返回网页端运营字段 `webVisible`、`webDisplayName`、`webSortOrder`。PC 网页端应请求 `clientType=web`，后端会隐藏 `webVisible=false` 的入口，并按 `webSortOrder` 排序；显示名称使用 `webDisplayName || modelName`，创建任务仍提交兼容字段 `tierKey`。
- 上传：`GET /api/v1/files/upload-config`、`GET /api/v1/files/credential`、`POST /api/v1/files/upload`、`POST /api/v1/files/notify`
- 任务：`GET /api/v1/tasks`、`GET /api/v1/tasks/:id`、`POST /api/v1/tasks/:id/cancel`
- 模板：`GET /api/v1/templates`、`POST /api/v1/templates/:id/use`、收藏接口
- 签到：`GET /api/v1/checkin/status`、`POST /api/v1/checkin/normal`

## Mini Program Review Mode Purchase Gate (2026-06-15)

- New config keys: `miniapp.review_mode_enabled` and `miniapp.purchase_enabled`.
- `GET /api/v1/public/app` returns `reviewModeEnabled`, `purchaseEnabled`, `purchaseMessage`, and `features.purchase`.
- When review mode is enabled, public app config forces `purchaseEnabled=false`, `paymentEnabled=false`, and `membershipEnabled=false` for the mini program.
- While purchase is disabled, `GET /shop/point-packages`, `GET /shop/member-plans`, `/membership/*`, `POST /orders`, and `POST /payments/wechat/jsapi` return `Page status abnormal, function not found. Please try again.`.
- Existing non-commerce flows are unchanged: AI creation, inspiration, tools, history, points detail, ads rewards, check-in, invite, and existing order queries remain available.

## Upload Performance Direct Upload (2026-06-17)

- `GET /api/v1/files/upload-config` now returns `uploadMode` from the active storage provider: `local` uses `server_relay`, non-local storage uses `direct_client`. It also returns `directUploadProviders` and `fallbackUploadUrl`.
- Current direct-client implementation is enabled for `qiniu_kodo` and `tencent_cos`. Other object storage providers keep the server relay fallback until their browser/mini-program signing flows are implemented one by one.
- `POST /api/v1/files/notify` accepts `durationMs` and writes it to `file_upload_logs.duration_ms`, so production can compare `direct_client` and `server_relay` latency.
- Admin media uploads now have direct-upload endpoints: `GET /api/v1/admin/files/upload-config`, `GET /api/v1/admin/files/credential`, and `POST /api/v1/admin/files/notify`. `POST /api/v1/admin/files/upload` remains the fallback relay endpoint.
- Admin image templates, video templates, file library, mini-program visual assets, and member benefit icons use the unified direct-upload helper instead of calling `/files/upload` directly.
- Storage config preload now uses a short cache and only resets the storage adapter when config actually changes. `SettingsService.setGroup` saves one settings group in a single transaction, reducing backend settings button latency.
- Production must use object storage plus CDN for fast uploads. If `STORAGE_PROVIDER=local`, uploads still work but intentionally stay on the slower relay path.

## Provider Rollout (2026-06-17)

- `PUT /api/v1/admin/model-tiers/:id/bindings` now syncs `tier_capabilities` from the newly bound primary model `ai_models.config`. `POST /api/v1/admin/model-tiers/repair-capabilities` and `npm run repair:tier-capabilities` can repair existing tiers. Admin manual upload fields saved after binding still override model defaults.
- Admin feature config now saves pricing matrix fields directly into `pricing_rules`. The manual JSON textarea, "generate JSON" action, entry key, display color, front icon and front badge fields are removed from the main form.
- DeepSeek is seeded as `provider_key=deepseek`, `provider_type=openai_compatible`, Base URL `https://api.deepseek.com`; model `deepseek-v4-flash` is bound to `ai.prompt_optimize.model_id` for `POST /api/v1/tasks/optimize-prompt`. Configure `DEEPSEEK_API_KEY` or paste the key in admin; SQL seeds do not contain plaintext keys.
- Hongniao uses `provider_key=hongniao`, `provider_type=hongniao`, `X-API-Key`, and the default Base URL `https://open.hongniaoai.com/v1`. Migration `20260707_002_hongniao_open_domain_and_sync_metadata.sql` only upgrades old `https://hongniaoai.com` provider URLs; model rows are refreshed by the admin sync action from `GET /v1/models` (the current docs page shows 21 available models). Sync stores common capability fields plus `config.remote_parameters`, updates upstream cost metadata, and preserves existing sale price/display/status. If a synced Hongniao model disappears upstream, preview shows it in `removals`; apply marks it inactive with `config.upstream_removed_at`, removes tier bindings/fallback rules, and keeps historical task/model rows. Video create/query use `POST /v1/videos` and `GET /api/v1/videos/{id}`; image create/query use `POST /v1/images` and `GET /api/v1/images/{id}`. Configure `HONGNIAO_API_KEY`; real generation tests may consume upstream balance.

## Template Save/Use Member Gate (2026-06-10)

- New config key: `membership.template_save_use_member_only`, default `false`.
- `GET /api/v1/public/app` returns `membership.template_save_use_member_only` and `memberOnly.templateSaveUse`.
- `GET /api/v1/templates`, `GET /api/v1/templates/inspirations`, `GET /api/v1/templates/:id`, and `GET /api/v1/public/templates` return `canView`, `canUse`, `canSave`, and `lockReason`.
- `GET /api/v1/templates`, `GET /api/v1/templates/inspirations`, `GET /api/v1/templates/inspirations/top`, `GET /api/v1/templates/:id`, and `GET /api/v1/templates/my-favorites` return `usageCount` for template usage, `favoriteCount` for template favorites, and `isFavorited` for the current login user. Anonymous requests return `isFavorited=false`.
- Template favorites are stored in `template_favorites`. `POST /api/v1/templates/:id/favorite` and `DELETE /api/v1/templates/:id/favorite` are idempotent and return `{ templateId, isFavorited, favoriteCount, totalFavorites }`. `totalFavorites` mirrors `user_assets.total_favorites` for the current user.
- When `membership.enabled=true` and `membership.template_save_use_member_only=true`, anonymous and non-member users can still browse and preview templates, but get `canUse=false` and `canSave=false`; `POST /api/v1/templates/:id/use` returns `MEMBERSHIP_REQUIRED`.
- Normal generated-result save/export uses `POST /api/v1/compliance/confirm` with `scene=export_save` only for compliance confirmation. It is not controlled by `membership.template_save_use_member_only`, `membership.image_template_use_member_only`, or `membership.save_to_album_member_only`.
- `membership.image_template_use_member_only` and `membership.save_to_album_member_only` are retained as legacy database keys and should not be used as the current template save/use gate.

## CORS

生产环境浏览器跨域请求由 `CORS_ALLOWED_ORIGINS` 控制，多个来源用英文逗号分隔，例如：

```env
CORS_ALLOWED_ORIGINS=https://api.example.com,https://admin.example.com
```

同源后台/API 请求和没有 `Origin` 请求头的非浏览器请求不受影响。开发环境未配置白名单时，仍允许本地跨域调试。

## HTML 富文本净化

`miniapp_help.content_html`、`miniapp_help.items_json[].contentHtml` 和 `miniapp_prompt_guides.items_json.*.contentHtml` 在后台保存时会净化，`GET /api/v1/public/app` 下发时也会再次净化历史内容。`miniapp_help.items_json` 支持多条帮助内容，每条可包含 `title/subtitle/contentHtml/mediaType/mediaUrl/mediaRatio/copyText/copyLabel`；`title/subtitle` 用于小程序帮助目录卡片，详情页再展示富文本、媒体和可复制文本。`miniapp_prompt_guides.items_json` 按固定生成模式 key 配置 `placeholder/title/subtitle/contentHtml/copyText/copyLabel/helpId/enabled`，用于生成页主提示词占位文字和“不会写提示词？”轻量弹层。`mediaType` 仅支持 `image` 或 `video`，`mediaRatio` 使用 `宽:高`，`mediaUrl` 仅允许 `http(s)` 或 `/` 开头的安全地址。
仅保留常见排版标签，如 `p/h1-h6/ul/ol/li/strong/em/a/img/table/code/pre`；`script`、事件属性、内联样式、未知标签、`javascript:`、`data:` 和协议相对 URL 会被移除。

## 行为变更 (2026-06-14)

| 端点/配置 | 变更 | 影响 |
|------|------|------|
| `GET /api/v1/public/app` | 新增 `toolsConfig`，并将 `features.tools` 映射到 `tools.enabled`；`tabBar` 默认兜底改为 `首页/灵感/工具/记录/我的`，历史页旧文案“资产”归一为“记录” | 小程序可展示工具页入口；后台可配置超过 5 个底部导航项，但小程序端只渲染排序靠前的 5 个启用项 |
| `GET /api/v1/tools/config` | 新增工具箱配置接口，按 `tools.visible_keys` 排序返回启用工具、每日免费次数、当日使用量、激励广告位、横幅广告位、积分收费和模型绑定状态 | 小程序工具页按后台配置展示 `反推提示词/九宫格切图/图片压缩/图片加水印/双图对比/智能抠图/尺寸调整/截图加手机壳`；工具移出后不会返回；`bannerAdUnitId` 为空时小程序不展示横幅广告 |
| `POST /api/v1/tools/process` | 新增工具处理接口，输入 `toolKey/fileIds/params`，输出生成文件或反推提示词 | 会员按 `tools.*.member_daily_quota` 免费使用；非会员按 `guest_daily_quota` 免费使用；次数耗尽后若 `pointsEnabled=true` 且 `pointsCost>0` 则扣积分，处理失败自动退回；否则工具开启广告解锁时返回 `data.needAd=true` |
| `POST /api/v1/tools/ad-session` / `POST /api/v1/tools/ad-unlock` | 新增工具广告解锁会话和领取接口，复用 `ad.reward.ad_unit_id` 微信激励视频广告位 | 非会员看完广告后可解锁一次工具使用；未配置广告位时后端拒绝创建会话 |
| `PUT /api/v1/admin/tools/config` / `GET /api/v1/admin/tools/config` | 新增后台工具页配置接口，保存 `enabled/bannerAdUnitId/visibleKeys/tools[].enabled/memberDailyQuota/guestDailyQuota/adUnlockEnabled/pointsEnabled/pointsCost/message` | 后台统一在「微信配置 → 工具页配置」维护工具箱；移出工具只从 `tools.visible_keys` 删除，不清空历史次数、日志、提示和模型绑定；`bannerAdUnitId` 对应 `tools.banner_ad_unit_id`，只用于工具执行页横幅广告 |
| `model_features` / `model_tiers` | 新增 `tool_prompt_reverse`、`tool_cutout` 两个功能页配置入口 | 工具模型绑定迁移到「微信配置 → 工具页配置」。`AI 模型管理 → 功能页配置` 默认隐藏工具功能；当前反推提示词会尝试调用绑定的 OpenAI-compatible 视觉/多模态模型，失败时回退本地提示词；智能抠图先保留绑定入口，运行时仍使用本地轻量算法 |
| `tools.*` | 新增工具箱配置组和开关，例如 `tools.enabled`、`tools.visible_keys`、`tools.prompt_reverse.enabled`、`tools.prompt_reverse.member_daily_quota`、`tools.prompt_reverse.ad_unlock_enabled`、`tools.prompt_reverse.points_enabled`、`tools.prompt_reverse.points_cost` | 工具页配置位置为后台「微信配置 → 工具页配置」；功能开关页不再维护工具箱 |

## 行为变更 (2026-06-02)

| 端点 | 变更 | 影响 |
|------|------|------|
| `POST /api/v1/files/notify` | `storageKey` 必须匹配 `{category}/{YYYY-MM}/{id}.{ext}` 格式 | 非法格式返回 400 |
| `DELETE /api/v1/files/:fileNo` | 先标记删除再删存储对象 | 无 |
| `POST /api/v1/tasks/:id/cancel` | `processing` 状态返回 "任务正在处理中，无法取消" | 取消前先确认任务未在处理 |
| `POST /api/v1/ads/reward` | 会话创建满 15 秒后才可领取 | 不足 15 秒返回错误 |
| `POST /api/v1/checkin/super/session` | 创建超级签到专用广告会话，不发广告积分 | 完整观看后再调用 `/checkin/super` |
| 本地文件静态服务 | 私有文件需 Bearer Token + 所有权匹配 | 直接 URL 访问私有文件返回 403 |

## 行为变更 (2026-06-03)

| 端点 | 变更 | 影响 |
|------|------|------|
| `GET /api/v1/files/credential` | 发放直传凭证时先创建用户私有占位文件，返回 `fileId/fileNo` | 回调和确认只能绑定已有占位文件 |
| `POST /api/v1/files/qiniu-callback` / `upyun-callback` | 需配置 `UPLOAD_CALLBACK_SECRET`，并通过 `?secret=` 或 `X-Upload-Callback-Secret` 传入 | 未授权回调返回 403 |
| `POST /api/v1/tasks/image` / `video` | 提交前校验 `prompt/optimizedPrompt/negativePrompt` 敏感词 | 命中返回 `code=1006`，不创建任务、不扣积分 |
| `POST /api/v1/tasks/image` / `video` | AI 生成提交增加用户级限流，默认每用户 10 次/分钟，可用 `AI_TASK_CREATE_RATE_LIMIT_PER_MINUTE` 调整 | 超限返回 429，避免短时间批量消耗上游成本 |
| `GET /api/v1/files/credential` / `upload` / `notify` / `:fileNo/url` | `visibility=private` 文件返回后端受控 `/api/v1/files/:fileNo/content` 地址，访问时需 Bearer Token + 所有权匹配 | public 文件和 AI 生成用 public 素材仍返回公网 URL |
| `POST /api/v1/tasks/image` / `video` | 内存队列默认最多缓存 500 个等待任务，可用 `TASK_QUEUE_MAX_LENGTH` 调整 | 队列满返回 429，已冻结积分会立即失败退款 |
| `GET /api/v1/point-tasks` | 新增小程序积分任务列表接口，并提供默认任务种子 | 任务中心按钮只跳转对应页面，不额外发放积分 |
| `POST /api/v1/tasks/image` | 图片任务支持 `platformWatermarkEnabled`，缺省为 `true` | 开启时结果图片左下角写入 `AI艺术生成工坊`；关闭时记录 `platform_watermark_removed=1` |
| `POST /api/v1/compliance/confirm` | 新增 `scene=platform_watermark_off` | 首次关闭平台显式水印时保存账号级合规确认 |

## 行为变更 (2026-06-04)

| 端点 | 变更 | 影响 |
|------|------|------|
| `GET /api/v1/membership/plans/:id` / `GET /api/v1/membership/rights` / `GET /api/v1/shop/member-plans` | 会员权益返回 `iconUrl/iconFileId` | 小程序会员权益不再写死 8 条图标，优先展示后台图标，失败时本地兜底 |
| `GET /api/v1/admin/membership/benefit-icons` | 新增后台权益图标库列表 | 会员管理页可选择已有种子/上传/链接图标 |
| `POST /api/v1/admin/membership/benefit-icons` | 新增后台权益图标库登记接口 | 上传文件仍复用 `/api/v1/admin/files/upload`，登记后可在权益配置中选择 |
| `/assets/member-benefit-icons/*.svg` | 新增内置种子 SVG 图标地址 | 后台与小程序可直接预览/展示默认 28 个权益图标 |
| `GET /api/v1/admin/backup/history` | 新增备份历史列表接口 | 返回备份文件清单、备份目录/保留天数/自动时间、SMTP 脱敏状态 |
| `POST /api/v1/admin/backup/trigger` | 新增手动触发备份接口 | 立即执行一次数据库备份 |
| `POST /api/v1/admin/backup/test-email` | 新增备份邮件测试接口 | 用最近备份文件发送测试邮件 |
| `PUT /api/v1/admin/backup/email-config` | 新增备份配置接口 | 后台保存 `backupEnabled/backupDir/retentionDays/autoHour/timeoutSeconds` 和 SMTP host/port/secure/user/pass/from/to；`smtpPass` 加密存库，留空不覆盖 |
| `POST /api/v1/admin/cron/:taskName` | 新增定时任务手动触发接口 | membership-expiry / monthly-points / daily-backup / ad-cleanup |
| `DELETE /api/v1/admin/templates/batch` | 后台可管理模板（官方模板 + 已审核用户模板）批量软删除接口 | 图片/视频/灵感模板列表可多选删除，记录会下架并写入 `deleted_at` |
| `PUT /api/v1/admin/templates/batch/display-config` | 后台可管理模板（官方模板 + 已审核用户模板）批量展示位置设置接口；传 `mergeDisplayConfig=true` 时只合并传入展示位 | 图片/视频模板列表可批量覆盖 `display_config`；灵感广场列表合并 `inspiration` 展示位，避免抹掉图片/视频原展示位 |
| `GET /api/v1/templates` | 返回新增 `displayConfig`，`targetFeature` 做旧值归一化；传 `targetFeature` 时会同时匹配后台展示位置并按置顶排序；`coverUrl/previewUrl` 会把本地相对媒体地址补为可访问 URL | 小程序创作页顶部模板可按后台展示位置稳定显示，后台上传的模板封面/视频能直接渲染 |
| `GET /api/v1/public/templates` | 传 `feature` 时会匹配后台 `displayConfig` 展示位置并兼容旧功能值，置顶按 `pinned/pinOrder` 倒序，非置顶按 `createdAt DESC, id DESC`；未传 `feature` 时使用 `isRecommended` 兼容旧置顶，其余同样最新优先；`coverUrl/previewUrl` 同步补全本地相对媒体地址，并把可匹配 `files` 表的历史裸对象存储地址转换为 CDN/对象存储公开地址，缺少 CDN 地址时才兜底公开文件代理 | 旧公开模板接口与新版模板接口的展示位置、置顶顺序、非置顶最新优先和媒体展示保持一致；小程序优先拿到可配置到 `downloadFile` 的 CDN 域名 |

## 行为变更 (2026-06-06)

| 端点/配置 | 变更 | 影响 |
|------|------|------|
| `GET /api/v1/public/app` | 新增 `homeEntrySwitches.image/video/comic`，每项包含 `enabled/message`；后台「功能开关 → 首页入口维护」保存 `miniapp.home_entry.*.enabled/message`，默认全部开启 | 小程序首页生图、生视频、生漫剧入口可临时维护。对应入口关闭后，首页点击只提示自定义文案，不跳转；不关闭生成接口或其它页面入口 |
| `GET /api/v1/public/app` | `tabBar` 同步提供到 `navigation.tabBar/navigation.bottom/navigation.tabs`；新增 `profileWorkbenchEnabled` / `miniapp.profile_workbench_enabled`、`profilePointsTasksEnabled` / `miniapp.profile_points_tasks_enabled`、`profileMemberEntryEnabled` / `miniapp.profile_member_entry_enabled` 控制我的页入口显示；`mediaDownload.storageOrigins/origins` 下发对象存储/CDN 下载域名，`fileProxyOrigins` 保留为空数组兼容旧字段 | 小程序底部导航可读取后台配置，审核场景可隐藏我的页创作台、今日积分任务和会员卡片入口；启动时强制刷新公开配置，避免后台首个导航改为灵感页后先闪默认首页入口；模板保存只放行 CDN/对象存储域名，仍拦截外部种子素材 |
| `backup.*` / `backup.email.*` | 备份目录、自动时间、保留天数和 SMTP 改为后台数据库配置优先；旧 `BACKUP_EMAIL_*` 仅作为兼容兜底 | 新部署不要再要求小白编辑 `.env` 配置备份邮件 |
| `POST /api/v1/admin/files/upload` / `POST /api/v1/files/upload` / `storage.local.*` | 上传使用磁盘临时文件接收并通过 `uploadLarge` 流式写入存储，COS/OSS/本地/EOS/七牛/又拍云服务端中转均不再把大视频整块放入 Node 内存；小程序 `/files/upload` 会按当前用户、MD5、分类、可见性、MIME 和大小复用未删除的重复资源，响应 `reused=true`；上传前会重新加载 `storage.*` 配置；后台 `FormData` 上传不手写 multipart `Content-Type`；响应新增 `deliveryUrl`，`url/publicUrl/deliveryUrl/copyUrl/storageUrl/cdnUrl` 优先返回长期可展示地址，`publicProxyUrl` 单独保留后端公开文件代理 `/api/v1/files/:fileNo/content` 作为兜底；文件内容代理支持 `Range` 分段请求；公开模板接口下发前会把已入库的文件代理或裸对象存储地址优先纠偏为 CDN 地址；安装默认写入 `APP_ROOT_DIR/uploads`，迁移可用 `LOCAL_UPLOAD_DIR/LOCAL_BASE_URL` 同步旧默认值 | 后台封面、视频资源、权益图标、小程序素材上传能正确识别成功响应；视频上传不再把 200MB 文件整块放入 Node 内存，代理播放/拖动更流畅；重复上传同一素材不再新增重复资源记录；小程序 `downloadFile` 只配置 CDN 域名时，后台上传素材保存到模板后也能保存到相册；历史记录缺少 `cdn_url` 时仍会兜底代理，需要补齐 CDN 地址或重新上传 |
| `GET /api/v1/templates/inspirations` / `GET /api/v1/templates/categories` | 灵感列表返回带 `display_config.inspiration` 的官方图片/视频模板，并返回真实 `templateType=image|video`、后台分类名/标识；迁移新增默认分类“剧本模板” | 灵感广场只是展示位，不再作为独立模板类型；小程序可按真实图片/视频能力使用模板 |
| `GET /api/v1/templates/inspirations/top` | 灵感页顶部横滑模板接口，返回配置了 `display_config.inspiration_top` 的图片/视频模板；`template.user_public_enabled=true` 时包含已审核用户模板；后台图片/视频模板支持单独勾选“灵感页顶部横滑”，并可手动编辑 `usageCount` | 小程序搜索框下方推荐卡片与灵感广场分开展示；官方模板初始使用次数通过迁移设为 20-300，后台可继续手动调整 |
| `POST /api/v1/templates/:id/favorite` / `DELETE /api/v1/templates/:id/favorite` / `GET /api/v1/templates/my-favorites` / `GET /api/v1/notifications` | 新增模板收藏闭环；收藏关系写入 `template_favorites`，同步维护 `templates.favorite_count` 和 `user_assets.total_favorites`；收藏/取消收藏重复调用保持幂等；用户模板审核通过后写入 `template_review_notifications` 并在消息列表返回 `template_review_approved` | 灵感页可展示当前用户收藏状态，个人中心“收藏”统计和“我的收藏”列表可实时同步；用户提交模板审核通过后能收到站内消息 |

## 行为变更 (2026-06-07)

| 端点/配置 | 变更 | 影响 |
|------|------|------|
| `GET /api/v1/public/model-tiers?feature=image_create` | 图片档位能力新增 `capabilities.sizeOptions/defaultSizeKey/resolutionPresets`，`qualities` 仅保留为清晰度兼容别名，并返回可用于分辨率估价的 `pricing` | 小程序应先选 `ratio`，再按同一 `ratio` 下的 `sizeOptions` 过滤清晰度；图片可用 `pricing.rules` 按 `resolutionPreset/quality/resolution` 估算当前分辨率单张价格；GPT Image 2 按上游 22 个 `size` 值下发，4K 支持 `1:1/2:3/3:2/3:4/4:3/9:16/16:9` |
| `POST /api/v1/tasks/image` | 图片任务新增 `resolutionPreset/sizeKey`，旧 `quality=standard/hd/1K/2K/4K/auto` 会归一化为清晰度；provider 原生 `quality=high/medium/low` 不再当作分辨率 | `1K/2K/4K` 不会再透传到上游 `quality`；GPT Image 2 只提交合法 `size/n`，`auto` 提交 `size:"auto"`，如 `16:9_4K` 提交 `size:"3840x2160"`；Nano Banana 提交 `aspectRatio/imageSize` |
| `POST /api/v1/tasks/image` | 小马 `gemini-3-pro-image-preview` 和 `gemini-3.1-flash-image-preview` 分开下发能力 | Nano Banana Pro 返回 11 个比例 × `1K/2K/4K`；Nano Banana 2 返回 15 个比例 × `0.5K/1K/2K/4K`，后端固定提交 `thinkingLevel:"high"`，小程序不展示该参数 |
| `POST /api/v1/tasks/image` | 图片价格按“所选分辨率单张积分 × imageCount”冻结，完成时按实际成功张数扣减，未生成张数自动退回差额 | 一次生成多张会按张数计费；模型至少返回 1 张时任务按部分成功完成并展示实际结果，0 张才失败退款 |
| `GET /api/v1/public/model-tiers?feature=video_create` | 视频档位能力会合并绑定主模型显式配置的 `supported_ratios/supported_qualities/supported_durations/supported_audio_modes/param_names`，并返回 `inputMode/referenceUploadMode/minReferenceImages/requiredReference/inputMediaTypes/maxVideoUrls/maxAudioUrls/advancedParams` | 小程序只展示接口返回的清晰度、尺寸、时长、声音、参考图片/视频/音频入口和可渲染高级参数；单一能力项也展示但锁定，不会再追加默认比例或高级参数造成不可提交选项 |
| `GET /api/v1/public/model-tiers?feature=video_create` / `POST /api/v1/tasks/video` | 视频档位新增 `pricing` 动态定价对象；后端按 `model_tiers.pricing_mode/pricing_rules` 和提交参数重算扣费，并写入 `price_snapshot.pricing` | 小程序可按时长、清晰度、声音等选项展示预计创作点；`token_preauth` 只按后台预扣点数冻结，不按 token 自动结算；真实冻结/退款以后端计算的 `pointsCost` 为准 |
| `POST /api/v1/tasks/video` | `inputAssets` 支持作为视频任务素材来源：图片进入参考图池，视频进入 `videoUrl/videoUrls`，音频进入 `audioUrl/audioUrls`；外链素材必须是公网 `http/https` URL | 参考生视频可按档位能力上传图片、视频和音频；旧版只传 `uploadKeys` 的图片流程继续兼容 |
| `POST /api/v1/admin/real-models/:id/test` | 图片真实模型测试支持 `sizeKey/resolutionPreset/sizeOption/imageCount`，与小程序图片提交参数保持一致 | 后台测试 GPT Image 2、Nano Banana 等图片模型时能覆盖真实尺寸映射，不再只测旧 `nativeSize/quality` |
| `POST /api/v1/admin/real-models/:id/test` | Hongniao AI 供应商 `provider_type=hongniao` 请求使用 `X-API-Key`；默认域名为 `https://open.hongniaoai.com/v1`。后台同步模型实时读取 `/v1/models`，写入常用能力字段、上游成本和 `config.remote_parameters`，远端删除模型会在确认后软停用并解除绑定 | 视频创建走 `POST /v1/videos`、查询走 `GET /api/v1/videos/{id}`；图片创建走 `/v1/images`、查询走 `/api/v1/images/{id}`；配置 `HONGNIAO_API_KEY` 或在后台粘贴 Key 后可测试，真实测试可能消耗上游额度 |
| `GET /api/v1/tasks/:id` / `GET /api/v1/admin/tasks/:id` | 读取处理中且已到轮询时间的异步图片/视频任务时，会后台触发一次供应商状态补轮询 | 定时轮询短暂失效时，小程序/后台下一轮刷新可拿到已完成结果，接口响应结构不变 |

## 行为修复 (2026-06-16)

| 端点/功能 | 修复 | 影响 |
|------|------|------|
| `POST /api/v1/admin/templates` / `POST /api/v1/templates/share` | 补齐模板写入 SQL 的列和值数量校验测试，避免 `templates` 表插入列和值不一致 | 后台创建官方模板、用户提交公开模板可正常落库；接口字段不变 |
| `POST /api/v1/files/:id/export` | 补齐导出文件写入 `files` 表的 `VALUES` 子句，并增加 SQL 结构回归测试 | 去元数据/导出后的文件记录可正常落库；接口字段不变 |
| `GET /api/v1/templates` / `GET /api/v1/templates/inspirations` / `GET /api/v1/templates/inspirations/top` / `GET /api/v1/public/templates` | `template.user_public_enabled=true` 时，后台审核通过的用户分享模板会进入小程序模板列表、灵感列表、灵感顶部列表和旧公开模板接口；模板路由移除 300 秒公共缓存，小程序模板列表请求也不再使用本地 60 秒缓存 | 用户提交分享模板后仍需后台审核；审核通过后前端再次请求即可拿到最新模板。`template.user_public_enabled=false` 时继续隐藏用户分享模板 |
| `GET /api/v1/templates/home-inspirations` / `GET /api/v1/templates/inspirations` | 新增 `display_config.home_inspiration` 作为“小程序首页灵感推荐”展示位，`display_config.inspiration` 继续作为“导航灵感页瀑布流”展示位；首页接口无首页专属模板时自动兜底返回灵感页模板并返回 `fallback=true` | 后台可分别运营首页推荐和灵感页模板，两个位置的置顶顺序互不影响；旧模板只配置 `inspiration` 时首页不会空白 |

## 行为变更 (2026-06-05)

| 端点/配置 | 变更 | 影响 |
|------|------|------|
| `GET /api/v1/files/upload-config` / `GET /api/v1/files/credential` / `POST /api/v1/files/upload` | 上传入口使用图片/视频/音频上限中的较大值接收请求，再按 MIME 分别校验：图片走 `UPLOAD_MAX_FILE_SIZE`，视频走 `UPLOAD_MAX_VIDEO_SIZE`，音频走 `UPLOAD_MAX_AUDIO_SIZE`；支持 `video/webm` 和常见音频 MIME | 视频可上传到 200MB，音频默认 50MB，图片仍按 10MB 限制；直传和服务端中转校验一致 |
| `fileCategory=ref_video` | 后端文件分类新增参考视频，和前端 `uploadAsset(path, 'ref_video', 'public')` 对齐 | 参考视频不再落到 `general`，并与 AI 输出视频 `ai_video` 分开管理 |
| `GET /api/v1/public/app` | 新增 `memberOnly.promptOptimize/imageTemplateUse/saveToAlbum` 以及同名 `membership.*` 开关 | 小程序可感知全局会员门槛 |
| `POST /api/v1/tasks/optimize-prompt` | 当 `membership.prompt_optimize_member_only=true` 时，非会员直接返回 `4603` | 阻断发生在扣积分前 |
| `POST /api/v1/tasks/optimize-prompt` | 支持可选 `usage=deep_completion` 和 `context`。小程序会传入当前生图/生视频模式、比例、时长、清晰度、参考素材和入口档位信息 | 后端用这些上下文把短提示词补全为完整提示词；鉴权、会员限制和积分扣费不变 |
| `membership.enabled` | 小程序首页/个人页/会员中心隐藏会员入口；`GET /membership/*`、`GET /shop/member-plans` 和会员下单都会读取该开关 | 关闭后直接调用后端会员接口会返回中文错误，不再继续查询或下单 |
| `content.filter_enabled` | `POST /api/v1/tasks/image` 和 `POST /api/v1/tasks/video` 提交前读取敏感词过滤开关 | 关闭后不执行敏感词拦截；开启时命中敏感词返回中文错误 |
| `template.user_share_enabled` | 小程序结果页隐藏分享按钮，`POST /api/v1/templates/share` 继续后端拦截 | 关闭后用户不能把作品分享为公开模板 |
| `security.captcha_enabled` | 当前登录验证码链路未实现，后台开关页标记为「未接入」并禁用切换 | 避免只保存配置但登录接口不读取造成误判 |
| `POST /api/v1/templates/:id/use` | 受 `membership.template_save_use_member_only` 控制 | 非会员可预览模板，但开关开启时不能使用模板；列表/detail 返回 `canUse/canSave/lockReason` |
| `POST /api/v1/compliance/confirm` | `scene=export_save` 仅做合规确认 | 生成结果保存/导出不受模板会员开关和旧保存会员开关限制 |
| `POST /api/v1/users/me/phone` | 新增小程序手机号授权绑定接口 | 入参 `{ code }`，后端调用微信 `getuserphonenumber` 并返回最新完整资料 |
| `POST /api/v1/users/me/phone` | 主线手机号绑定接口 | 依赖微信小程序手机号授权 `code`，不需要短信验证码；不要开放手输手机号无验证绑定 |
| `points.new_user_bonus_points` | 新用户首次登录赠送积分从硬编码改为后台配置 | 默认 50，只影响后续新用户 |

## 安装接口

挂载在 `/api/install`：

- `GET /status`
- `GET /check-env`
- `POST /test-db`
- `POST /save-db`
- `POST /save-system-config`
- `POST /create-admin`
- `POST /init`
- `POST /finish`
- `POST /finalize`
- `POST /run`
- `POST /tasks`
- `POST /retry-pm2`
- `GET /tasks/:id`
- `POST /build`

系统已安装后，除状态读取和任务读取外，安装写接口会关闭。

## 小程序与公开接口

### 公共配置

- `GET /public/app`：站点配置、功能开关、客服、使用帮助 `help`（`enabled/title/contentHtml/items[]`，`items[]` 含标题、副标题、详情内容、媒体和复制块）、运营素材 `visualAssets`、模板素材保存来源 `mediaDownload`、底部导航、我的页创作台/今日积分任务/会员卡片入口开关、工具箱配置 `toolsConfig`、启用功能、各功能档位。
- `GET /public/model-tiers?feature=image_create`：单功能档位；带有效用户 token 时返回会员折扣后的 `pointsCost`，同时返回 `basePointsCost/memberDiscountPercent/memberDiscountApplied/pricing`。图片档位能力会返回 `capabilities.sizeOptions/defaultSizeKey/resolutionPresets/maxImages/maxReferenceImages`；其中 `sizeOptions` 是合法的 `ratio + resolutionPreset` 组合，`qualities` 仅作为清晰度兼容别名。图片动态定价使用 `model_tiers.pricing_mode/pricing_rules`，条件可写 `resolutionPreset`、`quality` 或 `resolution`，例如 `1K/2K/4K/6K`，小程序用同一 `pricing` 估算当前分辨率价格，创建任务时后端按所选分辨率重新计算实际冻结/扣减积分。GPT Image 2 的 `auto` 只对应 `resolutionPreset=auto`，非自动尺寸按上游 `size` 枚举下发：`1K/2K/4K` 均支持 `1:1/2:3/3:2/3:4/4:3/9:16/16:9`，4K 对应 `2880x2880/2304x3456/3456x2304/2400x3200/3200x2400/2160x3840/3840x2160`。小马 Nano Banana Pro（`gemini-3-pro-image-preview`）展示 11 个比例与 `1K/2K/4K`；小马 Nano Banana 2（`gemini-3.1-flash-image-preview`）展示 15 个比例与 `0.5K/1K/2K/4K`，后端固定提交 `thinkingLevel:"high"`，小程序不展示该参数。Seedream 5.0 这类模型应按其模型配置展示 `aspect_ratio` 与 `size=2K/3K`。
- `GET /public/model-tiers?feature=video_create|image_to_video|first_last_frame_video|video_edit`：视频档位能力会合并绑定主模型显式配置的比例、清晰度、时长、声音、素材限制和可渲染高级参数，返回 `capabilities.ratios/qualities/durations/audioModes/defaultAudioMode/inputMode/referenceUploadMode/minReferenceImages/maxReferenceImages/requiredReference/advancedParams`，并返回 `pricing` 动态定价对象。`advancedParams` 目前只会下发小程序可展示的 `seed/fps/audioUrl`；未包含时小程序不展示高级参数入口，也不会提交已填草稿值。小程序只展示接口返回的选项，不自行追加默认比例、声音模式或高级参数；单一能力项也要显示为锁定态。`referenceUploadMode=first_frame` 表示单首图图生视频，`reference_images` 表示多参考图参考生视频，`first_last` 表示首尾帧，`source_video` 表示视频编辑。未配置可用供应商 Base URL/API Key、模型/供应商未启用或绑定模型能力不匹配的档位不会返回给小程序；空列表表示后台没有可提交任务的可用档位。视频真实扣费以任务创建时后端按 `pricing` 规则重算的 `pointsCost` 为准，前端估价不参与扣费。
  - 小马首批视频档位由迁移 `20260609_005_bind_xiaoma_video_launch_tiers.sql` 写入，覆盖 Sora/Grok/即梦/可灵/Veo 3.1/Omni Flash/SD 2.0 首尾帧/SD 2.0 参考生。配置小马 Key 后，参考验收数量为 `video_create=10`、`image_to_video=8`、`first_last_frame_video=6`、`video_edit=2`；实际返回数量仍会受后台启停、绑定和供应商 Key 状态影响。
  - 迁移 `20260614_005_refresh_xiaoma_media_model_configs.sql` 会按 2026-06-14 小马文档刷新后台视频/音频模型字段和轮询端点。SD 2.0 `version` 只作为上游支持字段记录，不作为公开档位默认参数；`21:9` 必须原样返回，不能归约成 `7:3`。
- `GET /public/templates`：公开模板；`feature` 按后台 `displayConfig` 展示位置筛选，兼容旧功能值，置顶按 `pinned/pinOrder` 倒序，非置顶按 `createdAt DESC, id DESC` 最新优先。
- `GET /app/home`：首页数据。`recommendedTemplates` 推荐/置顶优先，其余按 `createdAt DESC, id DESC`；`hotTemplates` 按使用和收藏热度排序，同分时最新优先。`popupAnnouncement` 按后台启用、有效期、投放目标和 `show_frequency` 频率规则返回；登录用户会记录 `last_popup_at/popup_count`，用于控制 `once/once_per_day/every_open/list_only`。`homeAnnouncements` 返回可展示的首页公告卡片数据，包含 `popup/home/profile/system/activity/maintenance` 类型，但排除 `show_frequency=list_only`，且不因用户已读、关闭或当天已弹出而隐藏公告条。

### 用户认证

- `POST /auth/wechat-login`
- `POST /auth/refresh-token`
- `GET /users/me`
- `PUT /users/me`
- `GET /users/me/full`
  - `membership` includes `isMember/membershipLevel/versionKey/versionName/planId/planName/durationType/durationDays/startedAt/expireAt/remainingDays/rights` for mini-program profile/member-info display.
  - `assets` includes `totalCreations/imageCount/videoCount/totalFavorites/couponsCount` for mini-program profile stats.

### AI 创作任务

- `GET /tasks`
- `GET /tasks/:id`
- `POST /tasks/:id/cancel`
- `POST /tasks/optimize-prompt`
- `POST /tasks/script`
- `POST /tasks/prompt`
- `POST /tasks/storyboard`
- `POST /tasks/image`
- `POST /tasks/video`

任务选择模型时应传 `tierKey` 或 `tierId`。小程序不应直接指定真实 `modelId`。

图片任务可传 `platformWatermarkEnabled`。不传时后端按 `true` 处理，并在生成图片左下角添加 `AI艺术生成工坊` 平台水印。传 `false` 时不添加可见平台水印，但文件记录会标记 `platform_watermark_removed=1`；`subType=edit` 且 `editTool=去水印` 时后端也会按关闭平台水印处理。视频任务不支持该参数。
图片任务应使用公开档位的 `capabilities.sizeOptions` 提交 `sizeKey` 和 `resolutionPreset`。`resolutionPreset` 是业务侧清晰度预设，会参与 `pricing_rules` 分辨率定价；`imageCount` 会按张数乘以命中的单张积分。旧版 `quality=standard/hd/1K/2K/4K/auto` 仅作为兼容输入，后端会转为 `resolutionPreset`；provider 原生 `quality`（如 `high/medium/low`）不会被当作清晰度预设。`params.qualityPreset/qualityLabel` 仅用于历史留存和结果展示，不影响提交给供应商的 `quality`。传入固定 `ratio/sizeKey` 时，页面参数优先于提示词里的像素尺寸或比例描述；只有 `ratio` 为空或 `auto` 时，提示词中的尺寸才参与推断。通用小马图片模型会从该参数链路下发 `aspect_ratio` 和 `resolution`，GPT Image 2、Nano Banana 等专用映射保持各自字段。
视频任务可传 `audioMode`、`preserveAudio`、`referenceMode`、`inputAssets`，也可选传高级参数 `seed/fps/audioUrl/audio_url/audioFileId/audio_file_id`。后端会把 `audioMode`/`preserveAudio` 映射到 provider 参数；`referenceMode` 用于区分小程序的单首图和多参考素材 UI，后端路由仍使用 `image_to_video`；`inputAssets` 白名单保留 `type/typeLabel/path/url/sourceType/uploadKey/fileId/fileNo/mediaType`，图片会进入参考图池，视频会进入 `videoUrl/videoUrls`，音频会进入 `audioUrl/audioUrls`。小程序必须以档位能力 `capabilities.inputMediaTypes/maxVideoUrls/maxAudioUrls/advancedParams` 作为素材入口和高级参数展示、提交白名单；高级参数只在用户填写、后台模板配置或模型显式支持时透传，不保证所有供应商模型都生效；仍存在供应商专属必填字段时，必须在后台 `request_template/default_params` 中补齐默认值后再绑定到小程序档位。
图生图和图生视频参考图数量由档位能力 `capabilities.maxReferenceImages` 控制，`capabilities.minReferenceImages` 控制最少张数，后端创建任务时会按 `min/maxReferenceImages` 二次校验。`referenceUploadMode=first_frame` 时小程序固定单首图；`reference_images` 时展示多参考图并按 `min/maxReferenceImages` 校验；首尾帧固定首图/尾图 2 张；图片编辑固定 1 张待编辑图；视频编辑固定 1 个源视频。
图生图、图片编辑、图生视频传给第三方模型的参考素材必须最终解析为公网可访问的 `http/https` URL；不支持 `base64/data:`、`localhost`、内网地址或本地文件路径。小程序应优先以 `visibility=public` 上传文件后传 `fileNo`；后端提交给第三方模型前会把对应素材兜底转为 `public`。生产环境必须确保 `LOCAL_BASE_URL` 或对象存储 CDN 域名为公网 HTTPS。`visibility=private` 的文件会返回受控内容地址，不适合直接作为第三方模型输入。

本人任务的生成输出会在任务完成后返回给小程序展示，即使 `auditStatus=pending` 也会返回 `outputs/thumbnail/coverUrl`；只有 `auditStatus=rejected` 或 `blocked` 时隐藏输出。生成结果文件以 `task_output` 记录到 `files` 表，`ai_output/ai_video` 可见性为 `public`，便于微信小程序 `<image>/<video>` 直接加载。图片输出的 `thumbnail` 复用最终产物地址；视频输出只有上游返回缩略图时使用缩略图，否则使用视频地址兜底。

当前主要 `featureKey`：

- `image_create`
- `image_to_image`
- `image_edit`
- `video_create`
- `image_to_video`
- `first_last_frame_video`
- `video_edit`
- `prompt_optimize`

图片/视频任务提交时还会通过 `subType` 或 `videoMode` 表示具体模式，例如 `img2img`、`edit`、`image_to_video`、`first_last_frame_video`、`video_edit`。

第三方供应商只通过后台模型配置和档位绑定接入，不新增小程序 API。APIMart 等供应商需要在后台填写 Base URL/API Key 后，将业务档位绑定到真实模型；小程序仍只传 `tierKey`。
分享接口里的 `coverUrl` 和 `prompt` 只作为前端展示辅助输入，后端可信来源仍是数据库任务和输出记录。

会员功能折扣在任务创建时生效：后台按套餐和 `featureKey` 配置折扣百分比，100 表示无折扣，95 表示按原积分 95% 扣费。后端实际冻结和扣减的积分以折扣后的 `pointsCost` 为准。

### 工具箱

- `GET /tools/config`：返回 `{ enabled, tools, usage, adUnitId, bannerAdUnitId }`。`tools[].key` 当前包括 `prompt_reverse/grid_cut/image_compress/watermark/compare/cutout/resize/phone_frame`；列表按 `tools.visible_keys` 排序，仅返回仍在工具箱内且已启用的工具；工具项带 `pointsEnabled/pointsCost`，需要模型的工具会带 `featureKey/modelBound`。`adUnitId` 是看广告解锁使用的激励视频广告位，`bannerAdUnitId` 是工具执行页底部横幅广告位，未配置时前端不展示横幅。
- `POST /tools/process`：请求 `{ toolKey, fileIds, params }`。图片类工具的 `fileIds` 使用 `/files/upload` 返回的文件 ID，输出为 `{ toolKey, outputs, prompt?, usageSource, pointsCost }`。`prompt_reverse` 返回 `prompt`；其它工具返回私有图片文件 `outputs[].url`，访问需用户 token。
- `phone_frame` 当前不需要传任何额外参数；上传截图会被合成到 iPhone 17 Pro Max 正面屏幕框内。
- `POST /tools/ad-session`：请求 `{ toolKey }`，返回 `{ sessionId, adUnitId, expiresAt }`。创建前会校验工具启用、广告解锁启用和微信激励视频广告位。
- `POST /tools/ad-unlock`：请求 `{ toolKey, sessionId, completed }`，完整观看后返回 `{ unlocked:true }`，下一次 `POST /tools/process` 会消耗该解锁。

工具次数按天统计在 `tool_usage_logs`，广告解锁状态在 `tool_ad_unlocks`。会员用户使用 `member_daily_quota`，非会员使用 `guest_daily_quota`；免费次数或广告解锁不可用时，如果工具开启 `pointsEnabled` 且 `pointsCost>0`，`POST /tools/process` 会扣积分并记录 `tool_usage` 积分流水，处理失败会记录 `tool_usage_refund` 退款流水；否则非会员免费次数用完且 `ad_unlock_enabled=true` 时返回 `code=1004` 且 `data.needAd=true`，小程序应先播放广告再重试。

后台工具页接口：

- `GET /admin/tools/config`：返回 `{ enabled, bannerAdUnitId, visibleKeys, tools, hiddenTools }`，工具项包含 `enabled/memberDailyQuota/guestDailyQuota/adUnlockEnabled/pointsEnabled/pointsCost/message/modelBound/featureKey`。
- `PUT /admin/tools/config`：保存同结构配置。删除工具只从 `tools.visible_keys` 移除；重新添加时追加回 visibleKeys 并可启用，不删除历史日志、积分流水、提示文案或模型绑定。

反推提示词绑定 `tool_prompt_reverse` 档位后，会按绑定模型和供应商 Base URL/API Key 调用 OpenAI-compatible `chat/completions`，消息中带 `image_url` data URL。若绑定模型不可用、供应商不兼容或调用失败，会回退到本地提示词模板。智能抠图已提供 `tool_cutout` 功能页配置入口，用于后续绑定供应商抠图/图片编辑模型；当前运行时仍是本地简单背景移除算法。

### 积分、签到、广告、邀请

- `GET /points/balance`
- `GET /points/transactions`：兼容 `type/source`，支持 `direction=income/expense`、`category=recharge/task/signin/ad/invite/membership`，返回流水关联字段 `refType/refId`
- `GET /point-tasks`：小程序积分任务列表，返回 `todayAvailable/list`；按钮只导航到对应业务页面
- `GET /checkin/status`
- `POST /checkin`
- `POST /checkin/normal`
- `POST /checkin/super/session`：创建超级签到专用广告会话，返回 `sessionId/adUnitId/expiresAt/minWatchSeconds`
- `POST /checkin/super`
- `POST /checkin/makeup`
- `GET /ads/status`
- `POST /ads/session`
- `POST /ads/reward`

`GET /checkin/status` 的 `todayReward/normal.todayReward`：未签到时表示今日可领取积分；已签到时表示今日实际已领取积分，来自 `signin_records.reward_points`。

`/ads/*` 只处理“看广告得积分”，每日次数按后台 `ad.reward.max_daily_count` 统计；超级签到广告会话使用 `ad_scene=signin_super`，不占用广告积分次数。
- `GET /invite/my-code`
- `POST /invite/bind`
- `GET /invite/summary`
- `GET /invite/records`

### 模板与灵感

- `GET /templates/categories`
- `GET /templates`
- `GET /templates/recommended`
- `GET /templates/search`
- `GET /templates/home-inspirations`
- `GET /templates/inspirations`
- `GET /templates/:id`
- `POST /templates/:id/use`
- `POST /templates/:id/favorite`
- `DELETE /templates/:id/favorite`
- `GET /templates/my-favorites`
- `POST /templates/share`
- `POST /templates/:id/cancel-public`
- `GET /templates/my-templates`

### 会员、商城、订单、支付

- `GET /membership/plans`：返回套餐、所属 `versionKey/versionName`、积分规则和 `featureDiscounts`；小程序会员页版本 Tab 由该接口的套餐列表派生。积分规则中的 `pointsExpireType=none`、`pointsExpireEnabled=false` 表示积分过期策略尚未上线。
- `GET /membership/plans/:id`：返回套餐详情、权益、积分规则和 `featureDiscounts`。权益项包含 `rightKey/rightName/rightValue/rightCategory/iconUrl/iconFileId`。
- `GET /membership/me`
- `GET /membership/rights`：返回当前用户权益，权益项包含 `iconUrl/iconFileId`。
- `GET /shop/point-packages`
- `GET /shop/member-plans`：公开会员套餐列表，`rights` 中同样包含 `iconUrl/iconFileId`，供未登录会员页展示。
- `POST /orders`
- `GET /orders`
- `GET /orders/:orderNo`
- `POST /orders/:orderNo/cancel`
- `POST /payments/wechat/jsapi`
- `POST /payments/wechat/query`
- `POST /payments/wechat/notify`

`/payments/wechat/notify` 是微信支付服务端回调地址，不给小程序前端直接调用。

### 文件

- `GET /files/upload-config`
- `GET /files/credential`
- `POST /files/upload`
- `POST /files/notify`
- `POST /files/qiniu-callback`
- `POST /files/upyun-callback`
- `GET /files/:fileNo`
- `GET /files/:fileNo/url`
- `GET /files/:fileNo/content`
- `DELETE /files/:fileNo`
- `POST /files/batch-delete`
- `POST /files/:id/export`
- `GET /files/:id/export-status`

直传流程：先调 `/files/credential` 获取 `storageKey/fileId/fileNo` 和云存储凭证；上传成功后调 `/files/notify`。七牛/又拍云服务端回调必须带 `UPLOAD_CALLBACK_SECRET`，且只确认已由凭证接口创建的占位文件。私有文件的 `url/cdnUrl` 会返回 `/files/:fileNo/content`，调用时必须携带当前用户 Bearer Token；公开文件继续返回对象存储或 CDN 地址。

### 公告、法律、合规

- `GET /announcements/popup`：获取当前用户可弹出的第一条弹窗公告，按 `show_frequency` 控制：`once` 每个用户一次，`once_per_day` 每天一次，`every_open` 每次打开可弹，`list_only` 不弹窗。
- `GET /announcements`
- `GET /announcements/:id`
- `POST /announcements/:id/read`
- `POST /announcements/:id/close`
- `GET /legal/documents`
- `GET /legal/required-status`
- `POST /legal/accept`：`{ documents: [{ docType, version }], scene? }`
- `POST /compliance/confirm`：`scene` 支持 `export_save/share/public_template/platform_watermark_off`
- `GET /compliance/confirmations`

## 管理后台接口

### 登录与概览

- `POST /admin/auth/login`
- `POST /admin/auth/refresh`
- `GET /admin/stats/dashboard`

### 用户、任务、审核、文件

- `GET /admin/users`
- `GET /admin/users/:id`
- `PUT /admin/users/:id/status`
- `PUT /admin/users/:id/points`
- `PUT /admin/users/:id/membership`

`GET /admin/users` 和 `GET /admin/users/:id` 的后台响应包含 `phone` 明文字段，供用户管理列表和详情查看绑定手机号。该字段仅在后台鉴权接口中展示，不改变小程序用户侧手机号脱敏和 `phoneBound` 状态口径。
- `GET /admin/tasks`
- `GET /admin/tasks/:id`
- `GET /admin/audits`
- `POST /admin/audits/:taskId/action`
- `GET /admin/files`：后台文件列表。返回 `url/displayUrl/previewUrl/copyUrl/deliveryUrl/accessUrl/cdnUrl/storageUrl/publicProxyUrl`；`deliveryUrl/copyUrl` 用于复制或保存到小程序配置，`previewUrl/accessUrl` 用于后台即时预览（COS 私有桶为下载签名 URL）作为兜底；用户生成内容（`refType=task_output`）额外返回 `generated=true`、`generatedPrompt`、`taskId`
- `GET /admin/files/stats`
- `POST /admin/files/upload`：后台上传图片/视频，multipart 字段 `file`，可选 `category/fileCategory/refType/refId`；支持 jpg/png/webp、mp4/mov/webm/avi，返回统一 `{ code, message, data: { url, deliveryUrl, publicUrl, publicProxyUrl, previewUrl, copyUrl, accessUrl, rawUrl, storageUrl, cdnUrl, fileId, fileNo, mimeType } }`。服务端使用临时文件 + 流式转存，避免大视频整块进入内存。`deliveryUrl/url/publicUrl/copyUrl/storageUrl/cdnUrl` 优先是长期可展示地址；`publicProxyUrl` 是后端公开代理兜底地址，且支持 `Range` 分段响应。后台即时预览优先使用最新 `accessUrl/previewUrl` 签名地址；长期保存到模板/配置时优先使用 `deliveryUrl/publicUrl/cdnUrl/storageUrl/url`，避免小程序拿到短期签名地址。`GET /templates*` 与 `GET /public/templates` 下发前会把可匹配到 `files` 表的历史代理地址或裸对象存储地址优先转换为 CDN 地址
- `DELETE /admin/files/:id`
- `POST /admin/files/batch-delete`
- `PUT /admin/files/:id/visibility`

### 系统配置

- `GET /admin/settings/groups`
- `GET /admin/settings/status`
- `GET /admin/settings/logs`
- `GET /admin/settings/:group`
- `POST /admin/settings/:group`
- `POST /admin/settings/:group/secure`
- `POST /admin/settings/secrets/copy`：复制允许的安全配置项；当前仅支持 `{ "key": "wechat.app_secret" }`，返回 `{ value }`，页面不默认明文展示。

### 模型与档位

- `GET /admin/models/providers`：不传分页参数时兼容返回数组；传 `paginate=1&page=1&pageSize=20` 时返回 `{ list, pagination }`，支持 `keyword/providerType/status` 筛选。
- `POST /admin/models/providers`
- `PUT /admin/models/providers/:id`
- `DELETE /admin/models/providers/:id`：软删除供应商，同时软删除该供应商下未删除的真实模型，并清除这些模型的档位绑定和兜底规则；返回 `{ deleted, modelDeleted, bindingDeleted, fallbackDeleted }`。
- `POST /admin/models/providers/:id/api-key/copy`：复制供应商 API Key，返回 `{ value }`；页面仍只展示脱敏值。
- `POST /admin/models/providers/:id/health-check`
- `POST /admin/models/providers/:id/sync`：从供应商接口同步可识别模型和能力参数。请求体 `{ "mode": "preview" }` 只拉取远端模型并返回 `{ additions, updates, removals, skipped, failures }` 供后台弹窗确认，不写数据库；`{ "mode": "apply" }` 会重新拉取并应用变动，返回新增/更新/软停用数量以及 `bindingDeleted/fallbackDeleted`。新增模型会自动入库；已有模型只覆盖 `model_type/query_task_url/api_cost_cents/config` 中的上游成本、查询端点、常用能力字段和只读原始参数，售卖价格 `points_cost`、启停状态、显示名、档位绑定、兜底规则和供应商 API Key 不会被覆盖。Hongniao 同步使用 `GET /v1/models`，将 `tasks[].parameters` 保存到 `config.remote_parameters`，并把比例、清晰度、时长、图片数量、音频/视频输入、size/resolution、计费单位等常用字段写入 `config`；远端删除的模型进入 `removals`，确认 apply 后仅标记 `status=inactive` 和 `config.upstream_removed_at`，同时解除前台档位绑定和 fallback 规则，历史任务/模型记录保留。自动识别不确定的模型会写入 `modelType=unknown`，需要管理员确认能力后再绑定档位。
- `GET /admin/models/providers/:id/balance`：查询供应商余额；当前仅部分供应商可用，不支持时返回 `available=false`。
- `GET /admin/models`
- `PUT /admin/models/:id`
- `DELETE /admin/models/:id`
- `GET /admin/models/:id/capabilities`
- `POST /admin/models/:id/capabilities`
- `GET /admin/models/:id/prices`
- `POST /admin/models/:id/prices`
- `GET /admin/models/:id/fallbacks`
- `POST /admin/models/:id/fallbacks`
- `GET /admin/models/cost-summary`
- `GET /admin/model-features`
- `GET /admin/model-tiers`
- `POST /admin/model-tiers`
- `PUT /admin/model-tiers/:id`
- `DELETE /admin/model-tiers/:id`
- `GET /admin/model-tiers/:id/bindings`
- `PUT /admin/model-tiers/:id/bindings`
- `PUT /admin/model-tiers/:id/capabilities`

`GET/POST/PUT /admin/model-tiers` 支持网页端模型展示字段：`webVisible` 控制是否出现在 PC 网页端模型下拉，`webDisplayName` 控制网页端自定义显示名，`webSortOrder` 控制网页端排序。这三个字段只影响 `clientType=web` 的公开档位列表，不改变小程序 `tierName/sortOrder/status` 行为。

`PUT /admin/model-tiers/:id/capabilities` supports `maxReferenceImages` for 图生图/图生视频参考图上限, and video audio fields: `supportedAudioModes` and `defaultAudioMode`. Deployments must run migrations before using these fields.
- `GET /admin/real-models`：不传分页参数时兼容返回数组；传 `paginate=1&page=1&pageSize=10` 时返回 `{ list, pagination }`，支持 `keyword/providerId/modelType/status` 筛选。
- `POST /admin/real-models`
- `POST /admin/real-models/preset`
- `PUT /admin/real-models/:id`：更新真实模型基础信息和 `config`。Hongniao 模型只允许后台保存常用能力字段、默认参数和通用展示/生成配置，`config.remote_parameters/billing/remote_status/upstream_removed_at` 等同步元数据只能由同步流程写入，详情页只读展示。
- `DELETE /admin/real-models/:id`：软删除单个真实模型，并清除该模型的档位绑定和兜底规则；返回 `{ deleted, bindingDeleted, fallbackDeleted }`。
- `POST /admin/real-models/:id/test`

### 会员、积分、邀请、订单

- `GET /admin/membership/benefit-icons`
- `POST /admin/membership/benefit-icons`
- `GET /admin/membership/plans`
- `GET /admin/membership/plans/:id`
- `POST /admin/membership/plans`
- `PUT /admin/membership/plans/:id`
- `PUT /admin/membership/plans/:id/rights`
- `PUT /admin/membership/plans/:id/points`
- `GET /admin/membership/versions`
- `POST /admin/membership/versions`
- `PUT /admin/membership/versions/:id`
- `PUT /admin/membership/plans/:id/feature-discounts`
- `GET /admin/point-tasks`
- `POST /admin/point-tasks`
- `PUT /admin/point-tasks/:id`
- `PUT /admin/point-tasks/:id/status`
- `DELETE /admin/point-tasks/:id`
- `GET /admin/point-packages`
- `POST /admin/point-packages`
- `PUT /admin/point-packages/:id`
- `PUT /admin/point-packages/:id/status`
- `DELETE /admin/point-packages/:id`
- `GET /admin/invite/relations`
- `GET /admin/invite/reward-logs`
- `GET /admin/payments/orders`
- `GET /admin/payments/orders/:orderNo`
- `POST /admin/payments/orders/:orderNo/query-wechat`
- `POST /admin/payments/orders/:orderNo/regrant`

后台权益图标运营流程：

1. 直接选择图标库已有图标。迁移会预置 8 个现有权益图标和 20 个扩展小图标。
2. 上传图标：先调 `/admin/files/upload` 上传 jpg/png/webp，再用返回的 `data.url/data.fileId` 调 `/admin/membership/benefit-icons` 登记到图标库。
3. 添加图标链接：直接调 `/admin/membership/benefit-icons` 写入 `name/iconUrl/source=link`。
4. 保存会员权益时，`PUT /admin/membership/plans/:id/rights` 可为每条权益传 `iconUrl/iconFileId`。

生产环境建议配置 `site.api_domain`、`APP_PUBLIC_URL` 或公网 HTTPS `LOCAL_BASE_URL`，这样服务端会把 `/assets/...`、`/static/...` 这类相对图标和任务媒体地址补成公网 URL。后台文件管理上传素材保存到模板后，公开接口优先下发对象存储/CDN 地址；微信小程序 `downloadFile` 合法域名以对象存储/CDN 域名为准，只有主动改回文件代理兜底时才需要把后端 API 域名加入 `downloadFile`。

### 内容、模板、合规

- `GET /admin/templates`：支持 `type=image|video|inspiration&page=1&pageSize=20&keyword=...`；返回后台可管理模板（官方模板 + 已审核用户模板），按 `created_at DESC, id DESC` 最新优先；`type=inspiration` 表示筛选 `display_config.inspiration` 展示位，不表示 `template_type=inspiration`；`keyword` 会在模板名称、提示词、描述和分类名中搜索，仍按后端分页返回。
- `POST /admin/templates`
- `PUT /admin/templates/:id`
- `DELETE /admin/templates/:id`
- `DELETE /admin/templates/batch`：`{ "ids": [1, 2, 3] }`，软删除后台可管理模板（官方模板 + 已审核用户模板），最多 100 个。
- `PUT /admin/templates/batch/display-config`：`{ "ids": [1, 2, 3], "displayConfig": { "inspiration": { "pinned": true, "pinOrder": 1 } }, "mergeDisplayConfig": true }`；默认批量覆盖后台可管理模板展示位置，传 `mergeDisplayConfig=true` 时合并展示位，最多 100 个。
- `GET /admin/content/legal-documents`
- `POST /admin/content/legal-documents`
- `PUT /admin/content/legal-documents/:id`
- `GET /admin/content/announcements`
- `POST /admin/content/announcements`
- `PUT /admin/content/announcements/:id`
- `DELETE /admin/content/announcements/:id`
- `GET /admin/content/system-prompts`
- `POST /admin/content/system-prompts`
- `PUT /admin/content/system-prompts/:id`
- `GET /admin/content/compliance-confirmations`
- `GET /admin/content/template-reviews`：用户提交模板审核列表，按 `created_at DESC, id DESC` 最新优先。
- `POST /admin/content/templates/:id/approve`：用户提交模板审核通过后会写入 `template_review_notifications`，用户可在消息列表收到 `template_review_approved`。
- `POST /admin/content/templates/:id/reject`
- `POST /admin/content/templates/:id/offline`
- `GET /admin/content/sensitive-words`
- `POST /admin/content/sensitive-words`
- `DELETE /admin/content/sensitive-words/:id`
- `GET /admin/content/template-categories`
- `POST /admin/content/template-categories`
- `PUT /admin/content/template-categories/:id`
- `DELETE /admin/content/template-categories/:id`

### 上线检查与系统更新

- `GET /admin/config-check/overview`
- `GET /admin/config-check/wechat-miniapp`
- `GET /admin/config-check/wechat-pay`
- `GET /admin/config-check/storage`
- `GET /admin/config-check/ai-models`
- `GET /admin/config-check/business-rules`
- `POST /admin/config-check/storage/test-connection`
- `POST /admin/config-check/storage/test-upload`
- `POST /admin/config-check/storage/test-delete`
- `POST /admin/config-check/ai-models/test-connection`
- `POST /admin/config-check/ai-models/test-image`
- `POST /admin/config-check/ai-models/test-video`
- `POST /admin/config-check/manual-verify`
- `POST /admin/config-check/manual-unverify`
- `GET /admin/system/version`
- `GET /admin/system/check`
- `GET /admin/system/update-packages`
- `POST /admin/system/update-packages/upload`
- `POST /admin/system/update-packages/precheck`
- `POST /admin/system/update-packages/install`
- `GET /admin/system/update-packages/install-status`
- `GET /admin/system/update-packages/install-logs`
- `POST /admin/system/update-packages/restore-database`

后台真实 AI 测试会调用供应商接口并可能消耗额度，请求体必须包含确认字段：

```json
{ "modelId": 1, "confirmRealCost": true }
```

模型管理页的 `POST /admin/real-models/:id/test` 同样需要 `confirmRealCost: true`。
