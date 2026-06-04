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

## 安全响应头

所有接口响应均包含以下 HTTP 头：
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

## 行为变更 (2026-06-02)

| 端点 | 变更 | 影响 |
|------|------|------|
| `POST /api/v1/files/notify` | `storageKey` 必须匹配 `{category}/{YYYY-MM}/{id}.{ext}` 格式 | 非法格式返回 400 |
| `DELETE /api/v1/files/:fileNo` | 先标记删除再删存储对象 | 无 |
| `POST /api/v1/tasks/:id/cancel` | `processing` 状态返回 "任务正在处理中，无法取消" | 取消前先确认任务未在处理 |
| `POST /api/v1/ads/reward` | 会话创建满 15 秒后才可领取 | 不足 15 秒返回错误 |
| 本地文件静态服务 | 私有文件需 Bearer Token + 所有权匹配 | 直接 URL 访问私有文件返回 403 |

## 行为变更 (2026-06-03)

| 端点 | 变更 | 影响 |
|------|------|------|
| `GET /api/v1/files/credential` | 发放直传凭证时先创建用户私有占位文件，返回 `fileId/fileNo` | 回调和确认只能绑定已有占位文件 |
| `POST /api/v1/files/qiniu-callback` / `upyun-callback` | 需配置 `UPLOAD_CALLBACK_SECRET`，并通过 `?secret=` 或 `X-Upload-Callback-Secret` 传入 | 未授权回调返回 403 |
| `POST /api/v1/tasks/image` / `video` | 提交前校验 `prompt/optimizedPrompt/negativePrompt` 敏感词 | 命中返回 `code=1006`，不创建任务、不扣积分 |
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

- `GET /public/app`：站点配置、功能开关、客服、使用帮助 `help`、运营素材 `visualAssets`、底部导航、启用功能、各功能档位。
- `GET /public/model-tiers?feature=image_create`：单功能档位；带有效用户 token 时返回会员折扣后的 `pointsCost`，同时返回 `basePointsCost/memberDiscountPercent/memberDiscountApplied`。档位能力会返回 `capabilities.maxReferenceImages`，视频档位能力还会返回 `capabilities.audioModes/defaultAudioMode`。未配置可用供应商 Base URL/API Key 的档位不会返回给小程序。
- `GET /public/templates`：公开模板。
- `GET /app/home`：首页数据。

### 用户认证

- `POST /auth/wechat-login`
- `POST /auth/refresh-token`
- `GET /users/me`
- `PUT /users/me`
- `GET /users/me/full`
  - `membership` includes `isMember/membershipLevel/versionKey/versionName/planId/planName/durationType/durationDays/startedAt/expireAt/remainingDays/rights` for mini-program profile/member-info display.

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
图片任务的 `params.qualityPreset/qualityLabel` 仅用于留存和结果展示，不影响提交给供应商的 `quality`。
视频任务可传 `audioMode`、`preserveAudio`、`inputAssets`。后端会把 `audioMode`/`preserveAudio` 透传到 provider 参数；`inputAssets` 只保留 `type/typeLabel/path/uploadKey/fileId/mediaType`，用于结果页展示首尾帧或源视频素材。
图生图和图生视频参考图数量由档位能力 `capabilities.maxReferenceImages` 控制，未配置时默认最多 4 张。首尾帧固定首图/尾图 2 张；图片编辑固定 1 张待编辑图；视频编辑固定 1 个源视频。

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

### 积分、签到、广告、邀请

- `GET /points/balance`
- `GET /points/transactions`：兼容 `type/source`，支持 `direction=income/expense`、`category=recharge/task/signin/ad/invite/membership`，返回流水关联字段 `refType/refId`
- `GET /point-tasks`：小程序积分任务列表，返回 `todayAvailable/list`；按钮只导航到对应业务页面
- `GET /checkin/status`
- `POST /checkin`
- `POST /checkin/normal`
- `POST /checkin/super`
- `POST /checkin/makeup`
- `GET /ads/status`
- `POST /ads/session`
- `POST /ads/reward`
- `GET /invite/my-code`
- `POST /invite/bind`
- `GET /invite/summary`
- `GET /invite/records`

### 模板与灵感

- `GET /templates/categories`
- `GET /templates`
- `GET /templates/recommended`
- `GET /templates/search`
- `GET /templates/inspirations`
- `GET /templates/:id`
- `POST /templates/:id/use`
- `POST /templates/share`
- `POST /templates/:id/cancel-public`
- `GET /templates/my-templates`

### 会员、商城、订单、支付

- `GET /membership/plans`：返回套餐、所属 `versionKey/versionName`、积分规则和 `featureDiscounts`；小程序会员页版本 Tab 由该接口的套餐列表派生。
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
- `DELETE /files/:fileNo`
- `POST /files/batch-delete`
- `POST /files/:id/export`
- `GET /files/:id/export-status`

直传流程：先调 `/files/credential` 获取 `storageKey/fileId/fileNo` 和云存储凭证；上传成功后调 `/files/notify`。七牛/又拍云服务端回调必须带 `UPLOAD_CALLBACK_SECRET`，且只确认已由凭证接口创建的占位文件。

### 公告、法律、合规

- `GET /announcements/popup`
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
- `GET /admin/stats/dashboard`

### 用户、任务、审核、文件

- `GET /admin/users`
- `GET /admin/users/:id`
- `PUT /admin/users/:id/status`
- `PUT /admin/users/:id/points`
- `PUT /admin/users/:id/membership`
- `GET /admin/tasks`
- `GET /admin/tasks/:id`
- `GET /admin/audits`
- `POST /admin/audits/:taskId/action`
- `GET /admin/files`
- `GET /admin/files/stats`
- `POST /admin/files/upload`
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

### 模型与档位

- `GET /admin/models/providers`
- `POST /admin/models/providers`
- `PUT /admin/models/providers/:id`
- `DELETE /admin/models/providers/:id`
- `POST /admin/models/providers/:id/health-check`
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
- `GET /admin/model-tiers/:id/bindings`
- `PUT /admin/model-tiers/:id/bindings`
- `PUT /admin/model-tiers/:id/capabilities`

`PUT /admin/model-tiers/:id/capabilities` supports `maxReferenceImages` for 图生图/图生视频参考图上限, and video audio fields: `supportedAudioModes` and `defaultAudioMode`. Deployments must run migrations before using these fields.
- `GET /admin/real-models`
- `POST /admin/real-models`
- `POST /admin/real-models/preset`
- `PUT /admin/real-models/:id`
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
2. 上传图标：先调 `/admin/files/upload` 上传 jpg/png/webp，再用返回的 `url/fileId` 调 `/admin/membership/benefit-icons` 登记到图标库。
3. 添加图标链接：直接调 `/admin/membership/benefit-icons` 写入 `name/iconUrl/source=link`。
4. 保存会员权益时，`PUT /admin/membership/plans/:id/rights` 可为每条权益传 `iconUrl/iconFileId`。

生产环境建议配置 `site.api_domain` 或 `APP_PUBLIC_URL`，这样服务端会把 `/assets/...`、`/static/...` 这类相对图标地址补成公网 URL。所有远程图标域名需要加入微信小程序 `downloadFile` 合法域名。

### 内容、模板、合规

- `GET /admin/templates`
- `POST /admin/templates`
- `PUT /admin/templates/:id`
- `DELETE /admin/templates/:id`
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
- `GET /admin/content/template-reviews`
- `POST /admin/content/templates/:id/approve`
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
