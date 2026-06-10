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

## Template Save/Use Member Gate (2026-06-10)

- New config key: `membership.template_save_use_member_only`, default `false`.
- `GET /api/v1/public/app` returns `membership.template_save_use_member_only` and `memberOnly.templateSaveUse`.
- `GET /api/v1/templates`, `GET /api/v1/templates/inspirations`, `GET /api/v1/templates/:id`, and `GET /api/v1/public/templates` return `canView`, `canUse`, `canSave`, and `lockReason`.
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

`miniapp_help.content_html` 在后台保存时会净化，`GET /api/v1/public/app` 下发时也会再次净化历史内容。
仅保留常见排版标签，如 `p/h1-h6/ul/ol/li/strong/em/a/img/table/code/pre`；`script`、事件属性、内联样式、未知标签、`javascript:`、`data:` 和协议相对 URL 会被移除。

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
| `DELETE /api/v1/admin/templates/batch` | 新增后台官方模板批量软删除接口 | 图片/视频/灵感模板列表可多选删除，记录会下架并写入 `deleted_at` |
| `PUT /api/v1/admin/templates/batch/display-config` | 新增后台官方模板批量展示位置设置接口 | 图片/视频/灵感模板列表可批量覆盖 `display_config`，影响小程序对应页面的模板露出位置 |
| `GET /api/v1/templates` | 返回新增 `displayConfig`，`targetFeature` 做旧值归一化；传 `targetFeature` 时会同时匹配后台展示位置并按置顶排序；`coverUrl/previewUrl` 会把本地相对媒体地址补为可访问 URL | 小程序创作页顶部模板可按后台展示位置稳定显示，后台上传的模板封面/视频能直接渲染 |
| `GET /api/v1/public/templates` | 传 `feature` 时会匹配后台 `displayConfig` 展示位置并兼容旧功能值，置顶按 `pinned/pinOrder` 倒序；`coverUrl/previewUrl` 同步补全本地相对媒体地址 | 旧公开模板接口与新版模板接口的展示位置、置顶顺序和媒体展示保持一致 |

## 行为变更 (2026-06-06)

| 端点/配置 | 变更 | 影响 |
|------|------|------|
| `GET /api/v1/public/app` | `tabBar` 同步提供到 `navigation.tabBar/navigation.bottom/navigation.tabs` | 小程序底部导航可读取后台配置，旧字段继续兼容 |
| `backup.*` / `backup.email.*` | 备份目录、自动时间、保留天数和 SMTP 改为后台数据库配置优先；旧 `BACKUP_EMAIL_*` 仅作为兼容兜底 | 新部署不要再要求小白编辑 `.env` 配置备份邮件 |
| `POST /api/v1/admin/files/upload` / `storage.local.*` | 后台本地上传使用统一响应 `{ code, message, data }`，上传前会重新加载 `storage.*` 配置；后台 `FormData` 上传不手写 multipart `Content-Type`；安装默认写入 `APP_ROOT_DIR/uploads`，迁移可用 `LOCAL_UPLOAD_DIR/LOCAL_BASE_URL` 同步旧默认值 | 后台封面、视频资源、权益图标、小程序素材上传能正确识别成功响应，并避免本地服务写入不可写的 `/www/wwwroot/...` |
| `GET /api/v1/templates/inspirations` / `GET /api/v1/templates/categories` | 灵感列表返回后台分类名/标识，小程序灵感页分类改为接口拉取；迁移新增默认分类“剧本模板” | 后台新增/启停模板分类后，小程序灵感页可正确展示分类 |

## 行为变更 (2026-06-07)

| 端点/配置 | 变更 | 影响 |
|------|------|------|
| `GET /api/v1/public/model-tiers?feature=image_create` | 图片档位能力新增 `capabilities.sizeOptions/defaultSizeKey/resolutionPresets`，`qualities` 仅保留为清晰度兼容别名 | 小程序应先选 `ratio`，再按同一 `ratio` 下的 `sizeOptions` 过滤清晰度；GPT Image 2 按上游 22 个 `size` 值下发，4K 支持 `1:1/2:3/3:2/3:4/4:3/9:16/16:9` |
| `POST /api/v1/tasks/image` | 图片任务新增 `resolutionPreset/sizeKey`，旧 `quality=standard/hd/1K/2K/4K/auto` 会归一化为清晰度；provider 原生 `quality=high/medium/low` 不再当作分辨率 | `1K/2K/4K` 不会再透传到上游 `quality`；GPT Image 2 只提交合法 `size/n`，`auto` 提交 `size:"auto"`，如 `16:9_4K` 提交 `size:"3840x2160"`；Nano Banana 提交 `aspectRatio/imageSize` |
| `POST /api/v1/tasks/image` | 小马 `gemini-3-pro-image-preview` 和 `gemini-3.1-flash-image-preview` 分开下发能力 | Nano Banana Pro 返回 11 个比例 × `1K/2K/4K`；Nano Banana 2 返回 15 个比例 × `0.5K/1K/2K/4K`，后端固定提交 `thinkingLevel:"high"`，小程序不展示该参数 |
| `POST /api/v1/tasks/image` | 图片价格按“单张档位积分 × imageCount”冻结/扣减/退款，`1K/2K/4K` 不改变价格 | 一次生成多张会按张数计费；模型返回图片数少于请求张数会失败并退款 |
| `GET /api/v1/public/model-tiers?feature=video_create` | 视频档位能力会合并绑定主模型显式配置的 `supported_ratios/supported_qualities/supported_durations/supported_audio_modes`，并返回 `inputMode/referenceUploadMode/minReferenceImages/requiredReference` | 小程序只展示接口返回的清晰度、尺寸、时长、声音；单一能力项也展示但锁定，不会再追加默认比例造成不可提交选项 |
| `GET /api/v1/public/model-tiers?feature=video_create` / `POST /api/v1/tasks/video` | 视频档位新增 `pricing` 动态定价对象；后端按 `model_tiers.pricing_mode/pricing_rules` 和提交参数重算扣费，并写入 `price_snapshot.pricing` | 小程序可按时长、清晰度、声音等选项展示预计创作点；`token_preauth` 只按后台预扣点数冻结，不按 token 自动结算；真实冻结/退款以后端计算的 `pointsCost` 为准 |
| `POST /api/v1/admin/real-models/:id/test` | 图片真实模型测试支持 `sizeKey/resolutionPreset/sizeOption/imageCount`，与小程序图片提交参数保持一致 | 后台测试 GPT Image 2、Nano Banana 等图片模型时能覆盖真实尺寸映射，不再只测旧 `nativeSize/quality` |
| `GET /api/v1/tasks/:id` / `GET /api/v1/admin/tasks/:id` | 读取处理中且已到轮询时间的异步图片/视频任务时，会后台触发一次供应商状态补轮询 | 定时轮询短暂失效时，小程序/后台下一轮刷新可拿到已完成结果，接口响应结构不变 |

## 行为变更 (2026-06-05)

| 端点/配置 | 变更 | 影响 |
|------|------|------|
| `GET /api/v1/files/upload-config` / `GET /api/v1/files/credential` / `POST /api/v1/files/upload` | 上传入口使用图片/视频上限中的较大值接收请求，再按 MIME 分别校验：图片走 `UPLOAD_MAX_FILE_SIZE`，视频走 `UPLOAD_MAX_VIDEO_SIZE`；支持 `video/webm` | 视频可上传到 200MB；图片仍按 10MB 限制；直传和服务端中转校验一致 |
| `fileCategory=ref_video` | 后端文件分类新增参考视频，和前端 `uploadAsset(path, 'ref_video', 'public')` 对齐 | 参考视频不再落到 `general`，并与 AI 输出视频 `ai_video` 分开管理 |
| `GET /api/v1/public/app` | 新增 `memberOnly.promptOptimize/imageTemplateUse/saveToAlbum` 以及同名 `membership.*` 开关 | 小程序可感知全局会员门槛 |
| `POST /api/v1/tasks/optimize-prompt` | 当 `membership.prompt_optimize_member_only=true` 时，非会员直接返回 `4603` | 阻断发生在扣积分前 |
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

- `GET /public/app`：站点配置、功能开关、客服、使用帮助 `help`、运营素材 `visualAssets`、底部导航、启用功能、各功能档位。
- `GET /public/model-tiers?feature=image_create`：单功能档位；带有效用户 token 时返回会员折扣后的 `pointsCost`，同时返回 `basePointsCost/memberDiscountPercent/memberDiscountApplied`。图片档位能力会返回 `capabilities.sizeOptions/defaultSizeKey/resolutionPresets/maxImages/maxReferenceImages`；其中 `sizeOptions` 是合法的 `ratio + resolutionPreset` 组合，`qualities` 仅作为清晰度兼容别名。GPT Image 2 的 `auto` 只对应 `resolutionPreset=auto`，非自动尺寸按上游 `size` 枚举下发：`1K/2K/4K` 均支持 `1:1/2:3/3:2/3:4/4:3/9:16/16:9`，4K 对应 `2880x2880/2304x3456/3456x2304/2400x3200/3200x2400/2160x3840/3840x2160`。小马 Nano Banana Pro（`gemini-3-pro-image-preview`）展示 11 个比例与 `1K/2K/4K`；小马 Nano Banana 2（`gemini-3.1-flash-image-preview`）展示 15 个比例与 `0.5K/1K/2K/4K`，后端固定提交 `thinkingLevel:"high"`，小程序不展示该参数。Seedream 5.0 这类模型应按其模型配置展示 `aspect_ratio` 与 `size=2K/3K`。
- `GET /public/model-tiers?feature=video_create|image_to_video|first_last_frame_video|video_edit`：视频档位能力会合并绑定主模型显式配置的比例、清晰度、时长、声音和素材限制，返回 `capabilities.ratios/qualities/durations/audioModes/defaultAudioMode/inputMode/referenceUploadMode/minReferenceImages/maxReferenceImages/requiredReference`，并返回 `pricing` 动态定价对象。小程序只展示接口返回的选项，不自行追加默认比例或声音模式；单一能力项也要显示为锁定态。`referenceUploadMode=first_frame` 表示单首图图生视频，`reference_images` 表示多参考图参考生视频，`first_last` 表示首尾帧，`source_video` 表示视频编辑。未配置可用供应商 Base URL/API Key、模型/供应商未启用或绑定模型能力不匹配的档位不会返回给小程序；空列表表示后台没有可提交任务的可用档位。视频真实扣费以任务创建时后端按 `pricing` 规则重算的 `pointsCost` 为准，前端估价不参与扣费。
  - 小马首批视频档位由迁移 `20260609_005_bind_xiaoma_video_launch_tiers.sql` 写入，覆盖 Sora/Grok/即梦/可灵/Veo 3.1/Omni Flash/SD 2.0 首尾帧/SD 2.0 参考生。配置小马 Key 后，参考验收数量为 `video_create=10`、`image_to_video=8`、`first_last_frame_video=6`、`video_edit=2`；实际返回数量仍会受后台启停、绑定和供应商 Key 状态影响。
- `GET /public/templates`：公开模板；`feature` 按后台 `displayConfig` 展示位置筛选，兼容旧功能值，置顶按 `pinned/pinOrder` 倒序。
- `GET /app/home`：首页数据。`popupAnnouncement` 按后台启用、有效期、投放目标和 `show_frequency` 频率规则返回；登录用户会记录 `last_popup_at/popup_count`，用于控制 `once/once_per_day/every_open/list_only`。`homeAnnouncements` 返回可展示的首页公告卡片数据，包含 `popup/home/profile/system/activity/maintenance` 类型，但排除 `show_frequency=list_only`，且不因用户已读、关闭或当天已弹出而隐藏公告条。

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
图片任务应使用公开档位的 `capabilities.sizeOptions` 提交 `sizeKey` 和 `resolutionPreset`。`resolutionPreset` 是业务侧清晰度预设，不改变单张价格；`imageCount` 会按张数乘以档位单张积分。旧版 `quality=standard/hd/1K/2K/4K/auto` 仅作为兼容输入，后端会转为 `resolutionPreset`；provider 原生 `quality`（如 `high/medium/low`）不会被当作清晰度预设。`params.qualityPreset/qualityLabel` 仅用于历史留存和结果展示，不影响提交给供应商的 `quality`。
视频任务可传 `audioMode`、`preserveAudio`、`referenceMode`、`inputAssets`，也可选传高级参数 `seed/fps/audioUrl/audio_url/audioFileId/audio_file_id`。后端会把 `audioMode`/`preserveAudio` 透传到 provider 参数；`referenceMode` 用于区分小程序的单首图和多参考图 UI，后端路由仍使用 `image_to_video`；`inputAssets` 只保留 `type/typeLabel/path/uploadKey/fileId/mediaType`，用于结果页展示首尾帧或源视频素材。高级参数只在用户填写或后台模板配置时透传，不保证所有供应商模型都生效；仍存在供应商专属必填字段时，必须在后台 `request_template/default_params` 中补齐默认值后再绑定到小程序档位。
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
- `GET /templates/inspirations`
- `GET /templates/:id`
- `POST /templates/:id/use`
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
- `GET /admin/tasks`
- `GET /admin/tasks/:id`
- `GET /admin/audits`
- `POST /admin/audits/:taskId/action`
- `GET /admin/files`：后台文件列表。返回 `url/displayUrl/previewUrl/copyUrl/accessUrl/cdnUrl`；`previewUrl/copyUrl` 优先返回稳定公开地址，`accessUrl` 保留实时可访问地址（COS 私有桶为下载签名 URL）作为兜底；用户生成内容（`refType=task_output`）额外返回 `generated=true`、`generatedPrompt`、`taskId`
- `GET /admin/files/stats`
- `POST /admin/files/upload`：后台上传图片/视频，multipart 字段 `file`，可选 `category/fileCategory/refType/refId`；支持 jpg/png/webp、mp4/mov/webm/avi，返回统一 `{ code, message, data: { url, previewUrl, copyUrl, accessUrl, cdnUrl, fileId, fileNo, mimeType } }`。`url/cdnUrl/publicUrl/rawUrl` 保持稳定原始地址；后台即时预览优先使用最新 `accessUrl/previewUrl` 签名地址，避免 COS 裸公网地址 403 导致破图；复制链接默认优先稳定公开地址，私有读场景可使用 `accessUrl`
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
- `POST /admin/models/providers/:id/sync`：从供应商接口同步可识别模型；自动识别不确定的模型会写入 `modelType=unknown`，需要管理员确认能力后再绑定档位。
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

`PUT /admin/model-tiers/:id/capabilities` supports `maxReferenceImages` for 图生图/图生视频参考图上限, and video audio fields: `supportedAudioModes` and `defaultAudioMode`. Deployments must run migrations before using these fields.
- `GET /admin/real-models`：不传分页参数时兼容返回数组；传 `paginate=1&page=1&pageSize=10` 时返回 `{ list, pagination }`，支持 `keyword/providerId/modelType/status` 筛选。
- `POST /admin/real-models`
- `POST /admin/real-models/preset`
- `PUT /admin/real-models/:id`
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

生产环境建议配置 `site.api_domain`、`APP_PUBLIC_URL` 或公网 HTTPS `LOCAL_BASE_URL`，这样服务端会把 `/assets/...`、`/static/...` 这类相对图标和任务媒体地址补成公网 URL。所有远程媒体域名需要加入微信小程序 `downloadFile` 合法域名。

### 内容、模板、合规

- `GET /admin/templates`
- `POST /admin/templates`
- `PUT /admin/templates/:id`
- `DELETE /admin/templates/:id`
- `DELETE /admin/templates/batch`：`{ "ids": [1, 2, 3] }`，仅软删除后台官方模板，最多 100 个。
- `PUT /admin/templates/batch/display-config`：`{ "ids": [1, 2, 3], "displayConfig": { "inspiration": { "pinned": true, "pinOrder": 1 } } }`，批量覆盖后台官方模板展示位置，最多 100 个。
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

后台真实 AI 测试会调用供应商接口并可能消耗额度，请求体必须包含确认字段：

```json
{ "modelId": 1, "confirmRealCost": true }
```

模型管理页的 `POST /admin/real-models/:id/test` 同样需要 `confirmRealCost: true`。
