# AI 创作工坊 · 小程序接口文档

> 基础地址：`https://你的域名/api/v1`

最后核对：2026-08-29。本文只描述小程序实际调用的请求契约；PC 用户网页端、安装向导和完整管理后台接口见 [API.md](API.md)。
> 全部 JSON 格式，文件上传用 multipart/form-data
> 标注 🔓 无需登录，🔒 需 `Authorization: Bearer <token>`

---

## Mini Program UX Updates (2026-06-10)

- Announcement list items open a detail panel. Long content scrolls in the panel, and HTML tags supported by mini-program `rich-text` such as `<h1>` and `<h2>` are rendered as rich content instead of plain text.
- Logged-in users without `user.phoneBound` see a lightweight home-page phone binding prompt. The button uses WeChat `open-type="getPhoneNumber"` and posts `detail.code` to `POST /users/me/phone`; phone binding cannot be silent or automatic on app open.
- Migration `20260610_003_seed_content_sensitive_words_multilingual.sql` adds Chinese and English seed words to `content_sensitive_words` with `INSERT IGNORE`, so updates and fresh installs can extend the compliance seed set without duplicating words.

## Mini Program Session And Watermark Update (2026-06-26)

- 小程序 access token 仍由 `JWT_EXPIRES_IN` 控制，默认 7200 秒；refresh token 改由 `JWT_REFRESH_EXPIRES_IN` 控制，默认 31536000 秒（365 天）。
- 小程序端收到 401 后继续调用 `/auth/refresh-token` 静默刷新，并保存接口返回的新 `refreshToken`。只要用户未主动退出、未清理小程序缓存，通常不需要再次微信登录和手机号授权。
- `refreshTokenExpiresIn` 返回 `JWT_REFRESH_EXPIRES_IN` 的实际秒数，供客户端或排查工具展示有效期。
- 平台图片水印固定为 `AI艺术生成工坊`。服务端水印 SVG 内嵌中文字体子集，不依赖 Linux 服务器预装中文字体。

## Template Save/Use Member Gate (2026-06-10)

- `GET /public/app` returns `membership.template_save_use_member_only` and `memberOnly.templateSaveUse`.
- `GET /templates`, `GET /templates/inspirations`, `GET /templates/:id`, and `GET /public/templates` return `canView/canUse/canSave/lockReason`.
- `GET /templates`, `GET /templates/home-inspirations`, `GET /templates/inspirations`, `GET /templates/inspirations/top`, `GET /templates/:id`, and `GET /templates/my-favorites` return `usageCount`, `favoriteCount`, `isFavorited`, `author/nickname`, and `avatarUrl/authorAvatar`. `usageCount` is the template use count, `favoriteCount` is the template favorite count, anonymous requests return `isFavorited=false`, official templates use `@官方灵感`, and user templates use the sharer's nickname.
- `POST /templates/:id/favorite` and `DELETE /templates/:id/favorite` are idempotent. They return `{ templateId, isFavorited, favoriteCount, totalFavorites }`; `totalFavorites` is the personal-center favorite total. First-time favorites on another user's public template also create a template-favorite notification for the template owner.
- If `membership.enabled=true` and `membership.template_save_use_member_only=true`, non-members may browse and preview templates but must be blocked from saving template media and from using a template to generate the same style.
- Generated result saving remains independent: `scene=export_save` is only a compliance confirmation flow and must not be blocked by the template gate.
- Legacy keys `membership.image_template_use_member_only` and `membership.save_to_album_member_only` are not the current template save/use policy.

## 通用说明

### 鉴权

通过 `/auth/wechat-login` 获取 token 和 refreshToken，过期后用 `/auth/refresh-token` 刷新。小程序端应保存新的 refreshToken。
`token` 默认短期有效，`refreshToken` 默认 365 天有效；如需调整小程序免二次登录窗口，修改服务端 `JWT_REFRESH_EXPIRES_IN` 并重启后端。
微信小程序工程 AppID 必须与后端 `wechat.app_id` 使用同一个小程序，否则 `uni.login` 返回的 code 无法通过后端 `jscode2session` 换取 openid。

### 响应格式

```json
{ "code": 0, "message": "success", "data": { } }
```

`code=0` 成功，非 0 查看错误码表。

### 分页

请求传 `page` / `pageSize`，响应包含：

```json
{ "pagination": { "page": 1, "pageSize": 20, "total": 150, "totalPages": 8 } }
```

---

## 一、用户与认证

### POST /auth/wechat-login 🔓

微信登录。开发环境设置 `wechat.login_bypass_dev=true` 后可用 `dev_` 前缀 code 跳过。

**参数：** `{ "code": "...", "inviteCode?": "..." }`

**返回：** `{ token, refreshToken, expiresIn, user: { id, nickname, avatarUrl, phone, status }, points: { balance }, membership: { level, expireAt } }`

### POST /auth/refresh-token 🔒

`{ "refreshToken": "..." }` → `{ token, refreshToken, expiresIn }`

### GET /users/me 🔒

基本信息：nickname / avatarUrl / openid / phone / status

### PUT /users/me 🔒

`{ "nickname?": "...", "avatarUrl?": "...", "preferences?": {} }`

### GET /users/me/full 🔒

个人中心聚合数据：用户、积分、会员、创作资产、邀请统计、菜单入口。

`user` 会返回脱敏 `phone` 和 `phoneBound`；`membership` 会返回我的页和会员信息页展示字段：`isMember/membershipLevel/versionKey/versionName/planId/planName/durationType/durationDays/startedAt/expireAt/remainingDays/rights`；`assets` 会返回 `totalCreations/imageCount/videoCount/totalFavorites/couponsCount` 用于个人中心统计卡。小程序头像昵称填写后继续复用 `PUT /users/me` 保存 `nickname/avatarUrl`。

### POST /users/me/phone 🔒

小程序手机号绑定走微信官方 `getPhoneNumber` 授权。用户点击授权后，前端提交微信返回的 `code`，后端调用微信接口换取手机号并绑定；该流程不需要短信验证码，也不允许前端手输任意手机号直接绑定。

微信手机号授权绑定。小程序按钮使用 `open-type="getPhoneNumber"` 获取 `detail.code` 后提交。

**参数：** `{ "code": "..." }`

**返回：** 同 `/users/me/full`，包含最新 `user.phone/user.phoneBound`。

---

## 二、应用配置

### GET /public/app 🔓

小程序启动时调一次，缓存使用。包含：

| 字段 | 说明 |
|------|------|
| `appName` / `siteName` | 站点名称 |
| `features` | 功能开关（wechatLogin / payment / membership / invite / imageCreate / videoCreate / promptOptimize 等） |
| `memberOnly` | 全局会员门槛：`promptOptimize` / `imageTemplateUse` / `saveToAlbum` |
| `featureKeys` | 所有启用功能的 key 数组 |
| `modelTiers` | **按 feature 分组的完整档位信息**（名称 / 积分 / 能力配置 / 图片尺寸组合） |
| `customerService` | 客服配置（标题 / 图标 / 卡片） |
| `help` | 使用帮助配置：`enabled/title/contentHtml/items[]`，内容来自后台微信配置；`items[]` 每条支持 `title/subtitle/contentHtml/mediaType/mediaUrl/mediaRatio/copyText/copyLabel`，帮助目录只展示标题和副标题，点击进入详情页后媒体按固定比例完整展示，可复制内容用于客服号、模板文本或代码片段 |
| `promptGuides` | 生成页提示词引导配置：`enabled/items`。`items` 按固定模式 key 下发，支持 `placeholder/title/subtitle/contentHtml/copyText/copyLabel/helpId/enabled`；小程序用 `placeholder` 覆盖主提示词输入框占位文字，点击“不会写提示词？”后展示轻量弹层，并可跳转完整帮助页 |
| `visualAssets` | 小程序运营素材 URL：`homeBannerUrl/homeMemberUpsellUrl/inspirationBannerUrl/comicBannerUrl/profileMemberOfferBannerUrl`；为空时小程序使用本地 JPG 或 CSS 兜底 |
| `homeEntrySwitches` | 首页三大创作入口维护开关，结构为 `{ image/video/comic: { enabled, message } }`；默认全部 `enabled=true`。任一入口关闭后，首页点击提示 `message` 且不跳转；不关闭生成接口或其它页面入口 |
| `mediaDownload` | 模板素材可保存来源：`storageOrigins/origins` 为对象存储/CDN 下载域名；`fileProxyOrigins` 保留为空数组兼容旧字段 |
| `toolsConfig` | 工具箱配置：`enabled/tools/usage/adUnitId/bannerAdUnitId`。工具项包含 `key/title/description/category/memberDailyQuota/guestDailyQuota/adUnlockEnabled/pointsEnabled/pointsCost/featureKey/modelBound` |
| `freeImageQuota` | 非会员免费生图轻量配置：`enabled/showInDailyTasks/dailyLimit/totalLimit/allowedTierKeys/exhaustedMessage`；不包含用户剩余额度，剩余额度用 `/free-image-quota/me` 查询 |
| `tabBar` / `navigation.tabBar` | 底部导航栏；后台「微信配置 → 底部导航」保存，支持 `text/pagePath/icon/iconPath/selectedIconPath/enabled` |
| `profileWorkbenchEnabled` / `miniapp.profile_workbench_enabled` | 我的页“我的创作台”入口开关；后台「微信配置 → 底部导航」保存，默认 `true`，关闭后只隐藏入口区块 |
| `profilePointsTasksEnabled` / `miniapp.profile_points_tasks_enabled` | 我的页“今日积分任务”卡片开关；后台「微信配置 → 底部导航」保存，默认 `true`，关闭后只隐藏任务卡片 |
| `profileMemberEntryEnabled` / `miniapp.profile_member_entry_enabled` | 我的页会员卡片入口开关；后台「微信配置 → 底部导航」保存，默认 `true`，关闭后只隐藏会员套餐入口卡片，不影响会员状态 |
| `membershipEnabled` / `inviteEnabled` / `paymentEnabled` | 功能开关 |

`visualAssets` 中的图片必须使用公网 HTTPS，并在微信公众平台配置到 `downloadFile` 合法域名。首页 3 个核心入口图保留本地 JPG，不依赖后台配置。

`promptGuides.items` 的固定模式 key 为：`ai_image.text2img`、`ai_image.img2img`、`ai_image.edit`、`ai_video.text2video`、`ai_video.img2video`、`ai_video.reference`、`ai_video.first_last_frame`、`ai_video.edit`、`comic.story`。后台配置位置是「微信配置 → 使用帮助 → 生成页提示词引导」；配置缺失或关闭时，小程序保留页面原默认占位文字并隐藏帮助按钮。

首页生图、生视频、生漫剧入口维护态由后台「功能开关 → 首页入口维护」维护，配置键分别为 `miniapp.home_entry.image.enabled/message`、`miniapp.home_entry.video.enabled/message`、`miniapp.home_entry.comic.enabled/message`。任一入口关闭后只拦截首页入口点击，不关闭对应任务接口，也不影响用户从其他页面进入已存在的功能页。`ai.storyboard_generate.enabled` 仍用于控制漫剧页内的分镜生成能力。

后台文件管理上传并保存到模板的素材会优先通过对象存储/CDN 地址下发。微信公众平台 `downloadFile` 合法域名配置当前对象存储/CDN 域名即可；后端 API 域名只用于 `request/uploadFile`，除非主动启用文件代理兜底，否则不要依赖它保存模板素材。外部种子素材不应加入可保存来源，只用于灵感预览和生成同款。

底部导航由小程序自定义组件 `AppTabBar` 渲染。小程序启动时会强制刷新 `/public/app`，缓存配置只作为接口失败时兜底；如果接口下发的 `tabBar` 少于 2 项或解析失败，会使用本地默认导航。默认导航是 `首页 / 灵感 / 工具 / 作品库 / 我的`。后台可以保存超过 5 个导航项，小程序端只渲染排序靠前的 5 个启用项。历史页 `/pages/history/index` 继续保留旧路由；旧文案“资产”或“记录”会在小程序显示层归一为“作品库”。后台把首个导航页改成灵感页后，小程序会先拿配置再跳转，避免默认首页入口先闪一下。后台填写的图标 URL 必须是 HTTPS 或小程序本地 `/static/...` 路径，未填写时使用内置 SVG 图标或 CSS 图标兜底。

### 本机配置 AppID/AppSecret 测试小程序

1. 微信开发者工具导入 `uni-app` 编译后的微信小程序目录时，工程 `project.config.json` 的 `appid` 要填真实小程序 AppID。
2. 后台「微信配置 → 微信小程序」填写同一个 AppID 和对应 AppSecret；保存后后端用它调用 `jscode2session`。
3. 本机只测普通接口时，可在微信开发者工具勾选“不校验合法域名”，并把 `uni-app/src/env/dev.ts` 的 `baseURL` 指向本机后端，例如 `http://127.0.0.1:3000/api/v1`。真机或局域网设备不能访问电脑自己的 `127.0.0.1`，要改成电脑局域网 IP。
4. 如果要真实测试微信登录，不要使用 `dev_` code，后端必须能访问微信接口；如果只是本地联调业务流程，可把后台 `wechat.login_bypass_dev=true` 且后端 `NODE_ENV=development`，小程序开发环境会用 `dev_uni_app_user` 登录。
5. 生产发布时必须使用 HTTPS 后端域名，并在微信公众平台配置 `request/uploadFile/downloadFile` 合法域名；本机 HTTP 只适合开发者工具调试。

### GET /public/model-tiers 🔓

按单个 feature 获取档位列表。也可直接从 `/public/app` 的 `modelTiers` 字段取。

**参数：** `?feature=image_create`。PC 网页端可额外传 `clientType=web` 使用网页端展示过滤；小程序不要传该参数。

**返回：** `{ list: [{ id, tierId, tierName, tierKey, modelName, apiModelName, upstreamModelCode, providerType, webVisible, webDisplayName, webSortOrder, basePointsCost, pointsCost, memberDiscountPercent, memberDiscountApplied, isDefault, pricing, capabilities: { ratios, qualities, resolutionPresets, sizeOptions, defaultSizeKey, styles, durations, audioModes, defaultAudioMode, supportedSizeModes, maxImages, maxReferenceImages, inputMediaTypes, maxVideoUrls, maxAudioUrls, maxDurationSeconds, inputMode, referenceUploadMode, minReferenceImages, requiredReference } }] }`. 图片/视频媒体数量优先来自绑定模型配置中的真实参数上限（包括远端参数 `maxItems`），未明示时才回退到档位兼容配置；公共展示与任务创建使用同一有效能力。

`modelName/apiModelName/upstreamModelCode/providerType` 来自该入口绑定的主模型。`webVisible/webDisplayName/webSortOrder` 是 PC 网页端专用运营字段；仅当请求 `clientType=web` 时后端会按 `webVisible` 过滤、按 `webSortOrder` 排序。小程序继续使用 `tierName` 展示业务入口名，创建任务仍提交 `tierKey`，不要直接提交真实 `modelId`。

图片档位的 `sizeOptions` 是可提交的合法尺寸组合，格式示例：`{ key:"16:9_2K", ratio:"16:9", resolutionPreset:"2K", label:"2K 16:9" }`。小程序应按 `ratio` 分组展示比例，再只展示该比例下存在的 `resolutionPreset`；`defaultSizeKey` 是默认选中项。GPT Image 2 的自动尺寸是 `{ key:"auto", ratio:"auto", resolutionPreset:"auto" }`，非自动尺寸按上游 `size` 枚举下发：`1K/2K/4K` 均支持 `1:1/2:3/3:2/3:4/4:3/9:16/16:9`，其中 `16:9_4K` 会提交 `size:"3840x2160"`。小马 Nano Banana Pro 返回 11 个比例与 `1K/2K/4K`；小马 Nano Banana 2 返回 15 个比例与 `0.5K/1K/2K/4K`，后端固定提交 `thinkingLevel:"high"`，小程序不展示该参数。Seedream 5.0 这类模型应按模型配置展示 `aspect_ratio` 与 `size=2K/3K`，不要前端自行追加 1K/4K。`qualities` 仅作为旧版清晰度字段兼容，新的清晰度字段用 `resolutionPresets`。

视频档位能力以后台档位和绑定主模型配置为准：小程序只展示返回的 `ratios/qualities/durations/audioModes`，不要自行追加默认比例或声音模式。单一能力项也要展示，但以锁定态呈现，例如固定 `8秒`、固定 `1080p`、固定 `有声/无声`。`audioModes` 为空时不显示声音模式；返回单项时显示锁定态。素材入口和数量必须按 `inputMediaTypes/maxReferenceImages/maxVideoUrls/maxAudioUrls` 渲染；参考生视频可按模型能力上传参考视频，视频编辑在 `maxVideoUrls > 1` 时允许上传多个源视频。小程序支持可选高级参数 `seed/fps/audioUrl`，后端会归一化为小马常用字段透传；这些参数只在用户填写时提交，不保证所有模型都生效。仍有供应商专属必填字段时，必须在后台 `request_template/default_params` 中补齐默认值后再绑定到小程序档位。视频档位可能返回 `pricing`：`mode=fixed/matrix/per_second_matrix/token_preauth`，小程序可按当前时长、清晰度、声音等参数展示预计创作点；`token_preauth` 只展示并冻结后台配置的预扣点数，任务完成后不按 token 自动补扣或退款。

小马首批视频档位由迁移 `20260609_005_bind_xiaoma_video_launch_tiers.sql` 写入，覆盖 Sora/Grok/即梦/可灵/Veo 3.1/Omni Flash/SD 2.0 首尾帧/SD 2.0 参考生。SD 2.0 参考生和全能参考使用 `referenceUploadMode=reference_images`，小程序应按 `maxReferenceImages` 允许多图上传；其中全能参考最多 9 张。固定 8 秒、固定有声/无声、固定清晰度这类单项也要展示为锁定态。

迁移 `20260614_005_refresh_xiaoma_media_model_configs.sql` 会刷新小马视频/音频模型后台字段。小程序仍以公开档位返回为准：SD 2.0 参考生不展示 `version` 高级参数，`21:9` 原样展示，未返回 `advancedParams` 的模型不显示高级参数入口。

若请求带有效用户 token，`pointsCost` 为当前用户会员折扣后的实际扣费积分；`basePointsCost` 为档位原始积分；`memberDiscountPercent=100` 表示无折扣。

仅返回可在小程序提交任务的档位：功能和入口启用、已绑定启用模型、供应商启用且 Base URL/API Key 已配置、绑定模型能力匹配当前 feature。返回空列表时，小程序应提示后台配置可用模型档位，不应继续显示“加载中”。

常用 feature：`image_create`、`image_to_image`、`image_edit`、`video_create`、`image_to_video`、`first_last_frame_video`、`video_edit`、`prompt_optimize`。默认种子档位示例：`image_standard`、`image_to_image_standard`、`image_edit_standard`、`video_standard`；APIMart 迁移会额外提供 `apimart_*` 专属档位。

### GET /public/templates 🔓

按展示位置筛选模板，置顶优先；非置顶模板按 `createdAt DESC, id DESC` 返回最新内容。

**参数：** `?type=image&feature=text_to_image&page=1&pageSize=10`

`feature` 会归一化并兼容旧值：`image_create -> text_to_image`、`video_create -> text_to_video`、`image_editing -> image_edit`。服务端会优先匹配模板 `displayConfig` 中的展示位置，置顶模板按 `pinned=true`、`pinOrder` 较大优先，非置顶模板按创建时间倒序；未传 `feature` 时使用 `isRecommended` 兼容旧置顶，之后同样按创建时间倒序。

### GET /app/home 🔓

首页聚合：弹窗公告、首页公告、功能入口、推荐/热门模板、灵感分类、用户摘要、最近作品、积分中心、会员入口。`recommendedTemplates` 按推荐/置顶优先，其余按 `createdAt DESC, id DESC`；`hotTemplates` 按使用和收藏热度排序，同分时最新模板优先。

`popupAnnouncement` 返回当前用户可弹出的第一条首页弹窗公告。服务端会按后台启用状态、有效期、投放目标和 `show_frequency` 频率规则过滤：`once` 每个用户一次，`once_per_day` 每天一次，`every_open` 每次打开可弹，`list_only` 不返回为弹窗。登录用户会记录 `lastPopupAt/popupCount/readAt/closedAt`；未登录用户由小程序本地按公告 ID 做兜底限频。

`homeAnnouncements` 返回当前可见的首页公告卡片数据，包含 `popup/home/profile/system/activity/maintenance` 类型，并排除 `show_frequency=list_only`。用户是否已读、是否关闭过、今天是否已经弹出过，不影响首页公告条展示。列表按 `priority DESC, sort_order DESC, created_at DESC` 排序，最多 10 条。小程序首页取第一条展示公告条，字段包含：

| 字段 | 说明 |
| --- | --- |
| `id/title/content/type` | 公告基础信息 |
| `showFrequency/priority` | 展示频率与排序权重 |
| `startAt/endAt/createdAt` | 展示时间、结束时间与创建时间 |
| `readAt/closedAt/lastPopupAt/popupCount` | 登录用户的已读、关闭和弹窗记录，未登录时为空 |

---

## 三、AI 创作

### GET /free-image-quota/me 🔒

查询当前登录用户的非会员免费生图额度状态。该接口只查用户额度汇总表、配置和会员状态，不扫描历史任务。

返回：
```json
{
  "enabled": true,
  "eligible": true,
  "canUseFreeQuota": true,
  "dailyRemaining": 1,
  "dailyLimit": 1,
  "totalRemaining": 3,
  "totalLimit": 3,
  "remaining": 1,
  "allowedTierKeys": ["image_standard", "image_pro"],
  "showInDailyTasks": true,
  "exhaustedMessage": "今日免费生图额度已用完，可以开通会员获得积分，或使用已有积分继续生成。",
  "membershipEnabled": true,
  "purchaseEnabled": true
}
```

`GET /public/app` 只返回 `freeImageQuota.enabled/showInDailyTasks/dailyLimit/totalLimit/allowedTierKeys/exhaustedMessage` 这类轻量配置，不返回用户剩余额度。小程序生图页进入时可拉取 `/free-image-quota/me`，并结合当前选中 `tierKey` 判断是否展示“免费生成”状态；默认 `allowedTierKeys=["image_standard","image_pro"]`，`image_top` 等未列入白名单的入口仍展示并走积分。我的页“今日积分任务”卡片可在 `enabled && showInDailyTasks && eligible` 时展示“免费生图 今日剩余 Y/Z 张”。会员用户不消耗免费额度，仍走会员折扣和积分体系。

### POST /tasks/image 🔒

**文生图 text2img：** `{ prompt, tierKey:"image_standard", sizeKey?, ratio?, resolutionPreset?, imageCount?, style?, negativePrompt?, platformWatermarkEnabled? }`

**图生图 img2img：** `{ prompt, subType:"img2img", tierKey:"image_to_image_standard", uploadKeys:["主图fileNo"], referenceKeys?:["参考图fileNo"], platformWatermarkEnabled? }`

**图片编辑 edit：** `{ prompt, subType:"edit", tierKey:"image_edit_standard", uploadKeys:["待编辑图fileNo"], editTool:"eraser", maskFileId?, maskUrl?, backgroundFileId?, backgroundUrl?, platformWatermarkEnabled? }`

文生图始终只输入文字，不显示参考图入口。图生图和图片编辑的参考图数量由所选档位 `capabilities.maxReferenceImages` 控制；未返回该字段时小程序按最多 4 张处理。图片编辑始终使用大上传卡片，模型上限大于 1 时通过“继续上传”和预览槽位追加图片。预览区默认显示 4 个槽位，上限小于 4 时超出上限的槽位置灰并禁止操作，上限大于 4 时显示真实数量。视频档位额外返回 `capabilities.referenceUploadMode`、`capabilities.minReferenceImages`、`capabilities.inputMediaTypes`、`capabilities.maxVideoUrls` 与 `capabilities.maxAudioUrls`：`first_frame` 表示单首图图生视频，`reference_images` 表示多素材参考生视频，`first_last` 表示首尾帧，`source_video` 表示视频编辑。小程序提交前应按 `min/maxReferenceImages`、`maxVideoUrls`、`maxAudioUrls` 校验，后端创建任务时也会二次校验。首尾帧视频固定首图/尾图 2 张；视频编辑默认单源视频，模型返回 `maxVideoUrls > 1` 时允许多个源视频。

图生图、图片编辑、图生视频的参考素材不要直接传 `base64/data:`、本地路径、`localhost` 或内网地址。小程序应先通过 `/files/upload` 上传，并把生成用素材按 `visibility=public` 上传，再把返回的 `fileNo` 放入 `uploadKeys/referenceKeys`；后端提交给第三方模型前也会把对应素材兜底转为 `public`。生产环境必须确保后端返回的文件地址是第三方模型可访问的公网 HTTPS URL。

提交前会校验后台敏感词库，命中后不创建任务、不扣积分，返回 `code=1006`，提示：`生成内容敏感，请勿生成违规内容。请修改后再次生成。`

图片和视频 AI 生成提交有独立用户级限流，默认每用户 10 次/分钟；超限返回 429。

`platformWatermarkEnabled` 缺省为 `true`。开启时服务端会在生成图片左下角写入 `AI艺术生成工坊`；关闭时不添加可见平台水印，并在文件记录中标记已关闭平台水印。图片编辑选择 `去水印` 时后端会强制不叠加平台水印。该参数仅用于图片任务，视频任务不支持。

图片清晰度请传 `resolutionPreset`，不要把 `1K/2K/4K` 放进 provider `quality`。旧版 `quality=standard/hd/1K/2K/4K/auto` 会被后端兼容为清晰度；`quality=high/medium/low` 等 provider 原生质量值不会被转换。`resolutionPreset` 会参与 `pricing_rules` 分辨率定价；`imageCount` 会按“所选分辨率单张积分 × 张数”预冻结，完成时按实际成功张数扣减。若模型返回图片数少于 `imageCount` 但至少有 1 张，任务仍为 `completed`，`outputs` 返回实际成功图片，未生成张数对应积分通过 `pointsRefunded` 退回；0 张结果才失败并退款。

免费生图额度开启时，非会员图片任务默认优先尝试使用免费额度，但只覆盖后台 `free_image_quota.allowed_tier_keys` 白名单内的 `tierKey`。提交成功响应会增加 `billingSource`（`free_quota` 或 `points`）；例如默认标准生图 `image_standard` 和专业生图 `image_pro` 可免费，顶级/超分生图 `image_top` 继续走积分。如果本次 `imageCount` 超过今日或总剩余额度，后端不会创建任务，也不会做“部分免费 + 部分积分”的混合支付，返回 `code=4606`、`errorCode=FREE_QUOTA_INSUFFICIENT`，并在 `data` 中带 `requestedImages/dailyRemaining/totalRemaining/estimatedPointsCost/canUsePoints/membershipEnabled/purchaseEnabled`。小程序应提示用户减少张数，或在用户确认后用 `billingSource:"points"` 重试积分支付。

图片任务传入固定 `ratio/sizeKey` 时，服务端以页面选择的比例作为最终尺寸约束；提示词中的 `320x100`、`16:9`、`横版/竖版` 等尺寸描述只作为冲突提示来源，不会覆盖页面参数。只有 `ratio` 为空或 `auto` 时，服务端才会从提示词推断尺寸。小程序提交前应在检测到提示词比例与页面选择不一致时弹窗确认，继续生成则按页面选择比例提交。

### POST /tasks/video 🔒

`{ prompt, tierKey:"video_standard", subType?:"text_to_video"/"image_to_video"/"first_last_frame_video"/"video_edit", referenceMode?, ratio?, duration?, resolution?, quality?, audioMode?, preserveAudio?, seed?, fps?, audioUrl?, audioUrls?, audioFileId?, inputAssets?, uploadKeys?, firstFrameFileId?, lastFrameFileId?, videoFileId?, videoUrl?, videoUrls? }`

`audioMode` 应来自所选档位 `capabilities.audioModes`；后端只在有值时转发为 `audioMode/audio_mode`。`preserveAudio` 用于视频编辑，会转发为 `preserveAudio/preserve_audio`。`seed/fps/audioUrl/audioFileId` 是可选高级透传字段，空值不要提交。`referenceMode` 用于区分小程序单首图/多参考素材图生视频 UI，后端仍统一路由到 `image_to_video`。`inputAssets` 会白名单保留 `type/typeLabel/path/url/sourceType/uploadKey/fileId/fileNo/mediaType`，其中图片素材会进入参考图池，视频素材会进入 `videoUrl/videoUrls`，音频素材会进入 `audioUrl/audioUrls`；所有外链素材必须是公网 `http/https` URL。

图生视频、首尾帧视频和视频编辑如使用第三方异步模型，上传素材最终必须能转为公网可访问 HTTPS URL。

提交前同样校验后台敏感词库，命中后返回 `code=1006` 并阻止创建任务。

### POST /tasks/optimize-prompt 🔒

`{ prompt, scene?, style?, ratio?, usage?, negativePrompt?, context?, tierKey?, tierId? }` → `{ optimizedPrompt, styleSuggestions, charged, pointsCost }`

后台开启 `membership.prompt_optimize_member_only` 时，非会员返回 `code=4603`，且不会扣除积分。

该接口对应小程序提示词输入框下方的“智能优化”按钮。按钮是否展示由 `/public/app.features.promptOptimize` 控制。系统提示词仅服务于此接口，在后台「内容合规 → 系统提示词」中直接新增或编辑“提示词优化系统提示词”（固定 `targetFeature=prompt_optimize`）；系统内置补全规则会和启用的自定义提示词合并注入。该配置不会注入生图、生视频、脚本生成、提示词生成、分镜或工具等其他功能。模型绑定和主/备用切换在「AI 模型管理 → 功能页配置 → 提示词优化」完成；旧的「系统设置 → AI 文本能力 → 智能优化兼容模型 ID」仅作为无档位绑定时的兼容兜底。请求传 `tierKey` 或 `tierId` 时，可在已绑定的提示词优化档位之间切换模型，不能传真实 `modelId`。

### POST /tasks/script 🔒

`{ topic, style?, duration?, characters? }` → 分镜脚本

该接口用于后续“剧本/脚本生成”入口，开关为 `/public/app.features.scriptGenerate`。脚本生成使用自身的内置指令，不读取「内容合规 → 系统提示词」中的提示词优化配置。

### POST /tasks/prompt 🔒

`{ idea, scene?, style?, count? }` → 提示词变体

该接口用于后续提示词框的智能补全或多版本提示词生成，开关为 `/public/app.features.promptGenerate`。提示词生成使用自身的内置指令，不读取「内容合规 → 系统提示词」中的提示词优化配置。

### POST /tasks/storyboard 🔒

`{ script, style?, ratio? }` → 分镜描述

该接口用于后续 AI 漫剧分镜生成，开关为 `/public/app.features.storyboardGenerate`。分镜生成使用自身的内置指令，不读取「内容合规 → 系统提示词」中的提示词优化配置。

### GET /tasks 🔒

我的任务列表。筛选：`?type=image/video&status=pending/queued/processing/completed/failed`

返回列表字段包含 `id/taskId/taskNo/title/type/subType/status/progress/prompt/optimizedPrompt/formData/params/editTool/generationMode/tierName/tierKey/outputs/thumbnail/coverUrl/pointsCost/pointsRefunded/billingSource/ratio/size/auditStatus/failReason/errorMessage/createdAt/completedAt`。`outputs[].url` is the saved media URL, `outputs[].video` is set for video outputs, and `outputs[].thumbnail` is the preview image. 图片输出的 `thumbnail` 复用最终产物地址；视频输出只有上游返回缩略图时使用缩略图，否则用视频地址兜底。`generationMode` 为任务创建入口/档位展示名，例如 `专业生图`；`billingSource=free_quota` 表示本任务使用免费生图额度；`pointsCost` 为任务创建时冻结积分，部分成功时最终消费为 `pointsCost - pointsRefunded`。

本人任务完成后，小程序结果页可直接使用 `outputs[0].image/video/url` 或 `thumbnail/coverUrl` 展示结果。`auditStatus=pending` 不会隐藏本人输出；只有 `auditStatus=rejected` 或 `blocked` 时后端返回空输出。生产环境必须使用对象存储或 CDN，返回完整公网 `https://` 媒体地址；后端不会把相对路径、`localhost`、HTTP 地址作为可用结果下发。若转存后的媒体 URL 无法公网下载，任务会失败并退回积分，不会标记为 completed。

微信公众平台合法域名配置：

| 类型 | 域名 |
| --- | --- |
| request 合法域名 | 后端 API 域名，例如 `https://mini.thtapi.com` |
| uploadFile 合法域名 | 后端 API 域名；若启用腾讯云 COS 直传，还要加入 COS 存储桶域名，例如 `https://ai-creator-1301433202.cos.ap-chengdu.myqcloud.com`；若启用七牛直传，还要加入七牛上传域名 |
| downloadFile 合法域名 | 对象存储/CDN 域名；如使用后台运营图片外链，也要加入对应 HTTPS 域名。只有主动使用 `/api/v1/files/:fileNo/content` 文件代理兜底时，才需要额外加入后端 API 域名 |

### GET /tasks/:id 🔒

任务详情：输入参数、输出结果、审核状态、积分流水。

返回字段与任务列表一致，并包含完整 `outputs` 数组。若任务仍在 `processing`、已有 `providerTaskId` 且到达 `nextPollAt`，后端会在后台触发一次供应商状态补轮询；本次响应结构不变，小程序继续按 3 秒轮询即可在下一轮拿到完成状态和 `outputs`。

### POST /tasks/:id/cancel 🔒

取消尚未完成的任务，成功返回 `{ cancelled: true }`。已完成、失败、已取消或不属于当前用户的任务不可取消。

## 工具箱 🔒

工具页入口默认位于底部导航第三项。小程序上传图片后调用工具接口；上传建议使用 `fileCategory=tool_source`、`visibility=private`。

### GET /tools/config

返回 `{ enabled, tools, usage, adUnitId, bannerAdUnitId }`。后台「微信配置 → 工具页配置」通过 `tools.visible_keys` 控制工具箱内工具集合和顺序；移出工具不会返回，直接访问运行页也会被后端拦截。`adUnitId` 是非会员广告解锁使用的激励视频广告位；`bannerAdUnitId` 是工具执行页底部横幅广告位，未配置时小程序不展示横幅广告。当前工具 key：

- `prompt_reverse`：反推提示词，单图输入，返回 `prompt`。
- `grid_cut`：九宫格切图，单图输入，返回 9 张图片。
- `image_compress`：图片压缩，单图输入，参数 `quality=30..95`。
- `watermark`：图片加水印，单图输入，参数 `text/opacity`。
- `compare`：双图对比，双图输入，参数 `width/height`。
- `cutout`：智能抠图，单图输入，参数 `tolerance`。
- `resize`：尺寸调整，单图输入，参数 `width/height/fit`。
- `phone_frame`：截图加手机壳，单图输入，无需额外参数；上传截图会展示在 iPhone 17 Pro Max 正面屏幕框内。

`usage[toolKey]` 包含 `usedToday/freeQuota/remainingFree/unlocked`。工具项包含 `pointsEnabled/pointsCost`：免费次数或广告解锁不可用时，若开启积分收费且 `pointsCost>0`，`/tools/process` 会扣对应积分；处理失败后端会自动退款。`tools[].featureKey` 当前可能为 `tool_prompt_reverse` 或 `tool_cutout`，对应后台「微信配置 → 工具页配置」里的工具模型绑定区域；`AI 模型管理 → 功能页配置` 默认隐藏工具功能。

### POST /tools/process

请求：

```json
{ "toolKey": "prompt_reverse", "fileIds": [123], "params": { "scene": "产品海报" }, "tierKey": "tool_prompt_reverse_standard" }
```

成功返回 `{ toolKey, outputs, prompt, usageSource }`。图片输出是私有文件地址，需要携带当前用户 token 下载或预览。

返回 `{ toolKey, outputs, prompt?, usageSource, pointsCost }`。`usageSource` 可能是 `member_quota/guest_quota/ad_unlock/points`。非会员免费次数耗尽、未开启工具积分收费且工具开启广告解锁时，接口返回 `code=1004`，并带 `data.needAd=true`。小程序收到后不要直接展示错误 toast，应先调用广告会话接口，完整播放微信激励视频后再重试处理。

### POST /tools/ad-session

请求 `{ toolKey }`，返回 `{ sessionId, adUnitId, expiresAt }`。`adUnitId` 复用后台 `ad.reward.ad_unit_id`。

### POST /tools/ad-unlock

请求 `{ toolKey, sessionId, completed }`。完整观看后返回 `{ unlocked:true }`，下一次 `/tools/process` 会消耗一次解锁。

反推提示词会调用后台绑定的 `tool_prompt_reverse` 模型；供应商需要兼容 OpenAI `chat/completions` 图片输入。请求可传 `tierKey` 或 `tierId` 切换已绑定档位。未绑定可用模型或调用失败时后端返回明确错误并退款，不返回伪造的本地提示词。智能抠图当前是本地轻量算法，`tool_cutout` 绑定入口用于后续替换为供应商抠图/图片编辑能力。

---

## 四、积分与签到

### GET /points/balance 🔒 → `{ balance, totalEarned, totalSpent }`

### GET /points/transactions 🔒

积分流水分页。兼容旧筛选 `?type=earn/spend&source=`，新增：

- `direction=income/expense`：按积分增加或减少筛选，`expense` 包含任务冻结等负数流水。
- `category=recharge/task/signin/ad/invite/membership`：按来源分类筛选，分别对应积分购买、任务消耗、签到奖励、广告奖励、邀请奖励、会员赠送。
- `page/pageSize`：分页参数，`pageSize` 最大 100。

返回列表字段包含 `id/type/amount/balance_before/balance_after/source/ref_type/ref_id/title/remark/created_at`，并额外兼容返回 `refType/refId/balanceBefore/balanceAfter/createdAt`。

### GET /checkin/status 🔒

`todayReward/normal.todayReward`：未签到时为今日可领取积分；已签到时为今日实际已领取积分，来自签到记录。

### POST /checkin 🔒 普通签到

### POST /checkin/super/session 🔒 → `{ sessionId, adUnitId, expiresAt, minWatchSeconds }`

创建超级签到专用广告会话。该会话只用于 `/checkin/super` 校验，不发放广告积分，也不占用 `/ads/*` 的每日广告积分次数。

### POST /checkin/super 🔒 超级签到 `{ sessionId }`

`sessionId` 来自 `/checkin/super/session`。完整观看微信激励视频并达到服务端校验时长后调用；奖励来源为 `signin_super`，独立于广告积分奖励。

### POST /checkin/makeup 🔒 补签 `{ targetDate? }`

### GET /point-tasks 🔒

积分任务列表：`{ todayAvailable, list: [{ id, title, group, reward, icon, action, resetCycle, completed, sortOrder }] }`。

任务中心按钮只跳转到对应业务页面；积分由签到、广告、邀请、会员等原业务发放，不提供额外领取接口。

---

## 五、激励广告

### GET /ads/status 🔒 → `{ watchedToday, remainingToday, rewardPerWatch }`

### POST /ads/session 🔒 → `{ sessionId }`

### POST /ads/reward 🔒 `{ sessionId, completed? }` → `{ rewarded, rewardPoints, balance }`

小程序端必须先用微信 `createRewardedVideoAd` 播放真实激励视频，只有 `onClose` 返回完整观看后才能调用领奖接口。生产环境不要用弹窗、倒计时或本地模拟完成态发放积分；后台未配置 `ad.reward.ad_unit_id` 时服务端会拒绝创建会话和领奖。

`/ads/*` 只用于“看广告得积分”，每日次数由后台 `ad.reward.max_daily_count` 控制；超级签到广告使用 `/checkin/super/session`，两者奖励和次数统计互不占用。

---

## 六、邀请

### GET /invite/my-code 🔒 → `{ inviteCode, sharePath, shareTitle }`

`sharePath` 指向 `/pages/login/index?...&inviteCode=xxx`，登录页会自动把 `inviteCode` 透传给 `/auth/wechat-login`。小程序解析二维码 `scene` 时也应还原出 `inviteCode`。

### POST /invite/bind 🔒 `{ inviteCode }`

### GET /invite/summary 🔒 → `{ inviteCount, totalRewardPoints }`

### GET /invite/records 🔒 分页

---

## 七、模板

### GET /templates/categories 🔓 → `{ list: [{ id, name, categoryKey, icon }] }`

### GET /templates 🔓 筛选：`?templateType=image/video/inspiration&targetFeature=&categoryId=&keyword=&sortBy=recommended/hot/new&random=true`

返回含 `usageType`（generate=文生图 / reference=图生图 / edit=编辑）、`targetFeature`、`displayConfig`、`coverUrl`、`previewUrl`。本地存储返回的 `/static/...` 等相对媒体地址会按后端公网域名补全，便于小程序 `<image>/<video>` 直接显示。

生图和生视频创作页优先使用此接口返回的后台模板。生产环境接口为空时不展示 mock 模板，运营需要在后台图片模板/视频模板中创建并审核通过。
小程序顶部模板按功能位传 `targetFeature` 获取；服务端会同时匹配 `targetFeature` 和 `displayConfig` 中的 `text_to_image/image_to_image/image_edit/text_to_video/image_to_video/first_last_frame_video/video_edit` 展示位。默认排序为置顶模板最前，其余按 `createdAt DESC, id DESC`；`random=true` 时置顶模板仍固定在前，其余模板随机排序。

### GET /templates/recommended 🔓 前 8 条

### GET /templates/search 🔓 `?keyword=xxx`

### GET /templates/inspirations 🔓 灵感广场

返回公开图片/视频模板；`template.user_public_enabled=true` 时包含后台审核通过的用户分享模板，否则仅返回官方模板。登录态会带 `isFavorited`，匿名固定为 `false`；`usageCount` 表示使用次数，`favoriteCount` 表示收藏次数；`author/nickname` 为展示来源，`avatarUrl/authorAvatar` 为来源头像。竖版/横版展示可优先读取 `ratio`，没有比例时客户端可从 `width/height` 或 prompt 尾部尺寸推断。

支持 `random=true`，用于灵感页“换一换”随机刷新瀑布流。置顶模板仍固定在前，非置顶模板随机。

### GET /templates/home-inspirations 🔓 首页灵感推荐

返回配置了 `display_config.home_inspiration` 的首页模板卡片；当首页展示位为空时，后端回退到灵感广场模板并返回 `fallback=true`。置顶模板固定在前，非置顶模板默认按最新优先。字段语义与灵感广场一致，首页可直接使用 `title/coverUrl/previewUrl/author/favoriteCount/isFavorited` 渲染大图卡片和收藏状态。

支持 `random=true`，规则同灵感广场。

### GET /templates/inspirations/top 🔓 灵感页顶部推荐

返回配置了 `display_config.inspiration_top` 的图片/视频模板，`template.user_public_enabled=true` 时包含后台审核通过的用户分享模板，字段语义与灵感广场一致。

支持 `random=true`，用于灵感页“推荐灵感”换一换。置顶模板仍固定在前，非置顶模板随机。

### GET /templates/:id 🔓 含会员权限校验

### POST /templates/:id/use 🔒 使用模板，返回 prompt 和参数

当后台开启 `membership.template_save_use_member_only` 且会员体系启用时，所有公开模板仍允许非会员浏览和预览，但列表和详情会返回 `canUse=false`、`canSave=false`、`lockReason`；调用 `POST /templates/:id/use` 会返回 `MEMBERSHIP_REQUIRED`。

### POST /templates/share 🔒 `{ taskId, outputId?, outputIndex?, title, ... }` 分享作品

优先传 `outputId`；如果任务详情输出缺少数据库 ID，可传 `outputIndex`，后端按任务输出序号兜底查询。

分享前用户必须设置非默认昵称；未设置时返回 `code=4610`，小程序应弹窗让用户填写昵称后再重试。头像不强制，未设置时客户端可继续使用默认头像展示。

### POST /templates/:id/cancel-public 🔒 取消公开

### POST /templates/:id/favorite 🔒 收藏模板

幂等接口。首次收藏会写入 `template_favorites`，并同步 `templates.favorite_count + 1`、`user_assets.total_favorites + 1`；重复收藏不重复计数。若收藏的是其他用户分享的模板，会给模板作者写入一条未读模板收藏通知；收藏自己的模板不通知。返回：

```json
{ "templateId": 1, "isFavorited": true, "favoriteCount": 12, "totalFavorites": 4 }
```

### DELETE /templates/:id/favorite 🔒 取消收藏模板

幂等接口。已收藏时删除关系并安全递减模板收藏数和个人收藏总数，计数不会小于 0；重复取消不重复递减。返回字段同收藏接口。

### GET /templates/my-favorites 🔒 `?page=1&pageSize=20`

返回当前用户收藏的模板列表，按收藏时间倒序，包含图片和视频模板；视频模板会返回 `coverUrl` 与可播放的 `previewUrl/mediaUrl`。

### GET /templates/my-templates 🔒

---

## 八、会员

### GET /membership/plans 🔒 → `{ list: [{ planId, name, planKey, versionKey, versionName, durationType, durationDays, price, originalPrice, tag, highlightFeatures, pointRule, featureDiscounts }] }`

会员页版本 Tab 由套餐列表中的 `versionKey/versionName` 派生，不再单独调用 `/membership/versions`。套餐权益明细通过 `/membership/plans/:id` 获取；未登录游客态可使用 `/shop/member-plans` 返回的 `rights`。

模型档位接口只返回至少有一个可用模型绑定的档位；如果后台供应商尚未配置 Base URL 或 API Key，该供应商专属档位会自动从小程序隐藏，后台配置完成后再展示。

注意：price 单位是**分**。

`pointRule.pointsDiscountRate` 为旧版全局积分消耗折扣，`1` 表示无折扣，`0.9` 表示 9 折。新版按功能折扣以 `featureDiscounts` 为准，字段为 `{ featureKey, featureName, discountPercent }`，`discountPercent=100` 表示无折扣，`95` 表示按原积分 95% 扣费。`pointRule.pointsExpireType=none`、`pointsExpireEnabled=false` 表示积分过期策略尚未上线，会员到期不会自动扣回已到账积分。

### GET /membership/plans/:id 🔒 含权益列表 + 积分规则

返回套餐详情、后台配置权益 `rights`、积分规则 `pointRule`、功能折扣 `featureDiscounts`；小程序会员页使用前三个套餐详情生成权益对比表，永久会员“每图低至 X 折”优先取 `image_create` 的 `discountPercent`。

`rights` 字段包含：

```json
{
  "rightKey": "watermark_removal",
  "rightName": "去水印",
  "rightValue": "true",
  "rightCategory": "export",
  "iconUrl": "https://example.com/assets/member-benefit-icons/benefit_remove_watermark.svg",
  "iconFileId": null
}
```

会员权益可能超过 8 条，小程序应按接口返回的权益集合展示，不要写死权益数量。`iconUrl` 由后台权益图标库、上传图片或手动链接配置；为空或加载失败时，小程序使用本地默认权益图标兜底。若后台配置外链图标，域名必须加入微信小程序 `downloadFile` 合法域名。

### GET /membership/me 🔒 → `{ membershipLevel, planName, versionName, versionKey, expireAt, isExpired, autoRenew }`

### GET /membership/rights 🔒

---

## 九、商城与支付

### GET /shop/point-packages 🔓

返回启用的积分套餐列表：

```json
{
  "list": [
    {
      "id": 1,
      "name": "60积分",
      "points": 60,
      "priceCents": 600,
      "description": "推荐",
      "firstPurchaseBonusType": "none|double|fixed",
      "firstPurchaseBonusPoints": 0,
      "enabled": true,
      "sortOrder": 1
    }
  ]
}
```

`firstPurchaseBonusType=double` 表示用户首个支付成功并完成发放的积分订单额外赠送同等积分；`fixed` 表示额外赠送 `firstPurchaseBonusPoints`。

### GET /shop/member-plans 🔓

### POST /orders 🔒 `{ orderType:"points"/"membership", productId }` → `{ orderNo }`

积分订单会在创建时写入套餐与首充活动快照，支付成功发放时再判断用户是否仍满足首充条件。

### GET /orders 🔒 分页，筛选 `?orderType=&payStatus=`

### GET /orders/:orderNo 🔒

### POST /orders/:orderNo/cancel 🔒

### POST /payments/wechat/jsapi 🔒 `{ orderNo }` → `{ orderNo, timeStamp, nonceStr, package, signType, paySign }`

客户端用此数据调 `wx.requestPayment()`。

微信小程序 JSAPI 支付签名中的 AppID 必须与当前小程序 AppID 一致。后台「微信配置 → 微信小程序」和「微信支付」里的 AppID 应填写同一个小程序 AppID；服务端请求微信支付 v3 接口时，`Authorization` 头按 `WECHATPAY2-SHA256-RSA2048 mchid="...",nonce_str="...",signature="...",timestamp="...",serial_no="..."` 生成，参数之间必须用英文逗号分隔。

### POST /payments/wechat/query 🔒 `{ orderNo }` 主动查单

返回会包含 `order.payStatus`、`order.grantStatus` 和 `granted`。小程序支付后必须同时确认：

- `order.payStatus === "paid"` 或 `order.status === "paid"`
- `order.grantStatus === "granted"` 或 `granted === true`

只收到微信支付成功不代表积分或会员已经到账；若已支付但未发放，应提示用户稍后查看或联系客服，并引导后台支付订单页补发。

---

## 十、文件管理

### GET /files/upload-config 🔒 → `{ uploadMode, storageProvider, directUploadProviders, fallbackUploadUrl, maxFileSize, maxImageSize, maxVideoSize, maxAudioSize, allowedMimeTypes, allowedAudioMimeTypes }`

`maxFileSize` 是上传入口允许接收的最大体积，即图片/视频/音频上限中的较大值；业务校验仍按 MIME 分开执行：图片最大 `maxImageSize`（默认 10MB），视频最大 `maxVideoSize`（默认 200MB），音频最大 `maxAudioSize`（默认 50MB）。视频 MIME 支持 `video/mp4`、`video/quicktime`、`video/webm`、`video/x-msvideo`；音频 MIME 支持 `audio/mpeg`、`audio/wav`、`audio/x-wav`、`audio/mp4`、`audio/aac`、`audio/ogg`。

生产环境启用对象存储时，`local` 返回 `server_relay`，非 `local` 返回 `direct_client`。当前小程序直传优先支持 `qiniu_kodo` 和 `tencent_cos`；其他 provider 或直传上传阶段失败时，客户端会回退到 `fallbackUploadUrl` 对应的 `/files/upload` 中转接口。

### GET /files/credential 🔒 `?fileCategory=&originalName=&fileSize=&contentType=&visibility=`

返回直传凭证，同时创建当前用户的文件占位记录：`{ storageKey, uploadUrl, cdnUrl, credential, expireAt, fileId, fileNo }`。`visibility=private` 时返回的 `cdnUrl/url` 是后端受控 `/files/:fileNo/content` 地址，访问需 Bearer Token；生成用素材应传 `visibility=public`。

### POST /files/upload 🔒 multipart/form-data。字段：`file` + `fileCategory` + `visibility`

常用 `fileCategory`：`ref_image`（参考图）、`ref_video`（参考视频）、`ref_audio`（参考音频）、`avatar`、`template_cover`、`general`。AI 生成结果由后端写入 `ai_output/ai_video`；小程序上传参考视频时应使用 `ref_video`，上传参考音频时应使用 `ref_audio`，不要混用 `ai_video`。
返回包含 `{ fileId, fileNo, url, deliveryUrl, publicUrl, publicProxyUrl, storageUrl, cdnUrl, accessUrl, mimeType, fileSize, width, height, reused }`。同一用户重复上传相同内容、相同分类和可见性的未删除文件时，后端会直接复用已有资源并返回 `reused=true`，不再重复写入对象存储和资源记录。小程序展示和提交生成任务优先使用 `fileNo`；需要直接展示地址时优先使用 `deliveryUrl` 或 `url`。后端内容代理 `/files/:fileNo/content` 支持 `Range` 分段请求，视频播放和拖动可复用该地址作为兜底。

### POST /files/notify 🔒 `{ storageKey, provider?, etag?, fileSize, mimeType?, durationMs? }`

直传上传成功后调用。后端只确认 `/files/credential` 已创建的占位文件，防止陌生 `storageKey` 被绑定到用户。`durationMs` 会写入 `file_upload_logs`，用于排查真实上传耗时。

### GET /files/:fileNo 🔒

### GET /files/:fileNo/url 🔓（私密文件需 Token）

### GET /files/:fileNo/content 🔓（私密文件需 Token）

### DELETE /files/:fileNo 🔒

### POST /files/batch-delete 🔒 `{ fileNos: [] }`

### POST /files/:id/export 🔒 去除元数据和水印

### GET /files/:id/export-status 🔒

---

## 十一、公告

### GET /announcements/popup 🔓

获取当前用户可弹出的第一条弹窗公告。频率规则与 `/app/home.popupAnnouncement` 一致，并会在登录用户返回弹窗时写入 `last_popup_at/popup_count`。

### GET /announcements 🔓 分页

登录用户返回项中包含 `readAt`；小程序个人中心消息红点以当前可见公告是否存在 `readAt` 为空的记录为准。

### GET /announcements/:id 🔓

### POST /announcements/:id/read 🔒

### POST /announcements/:id/close 🔒

---

## 十二、消息通知

我的页消息红点应同时检查公告未读、模板收藏通知未读和模板审核通知未读。模板收藏通知只记录“别人收藏了我分享的模板”，取消收藏不会删除历史通知；用户提交模板审核通过后会收到 `template_review_approved` 通知。

### GET /notifications/unread-count 🔒

返回：

```json
{ "total": 2, "templateFavoriteCount": 1, "templateReviewCount": 1 }
```

### GET /notifications 🔒 `?page=1&pageSize=20`

返回当前用户的模板通知，按最新时间倒序。`type` 可能为 `template_favorite` 或 `template_review_approved`；列表项包含 `id/type/title/content/actorNickname/actorAvatarUrl/templateId/templateTitle/readAt/createdAt`。

### POST /notifications/:id/read 🔒

标记单条通知已读，返回 `{ id, read: true }`。

### POST /notifications/read-all 🔒

标记当前用户所有模板通知已读，返回 `{ read: true, affected }`。

---

## 十三、法律与合规

### GET /legal/documents 🔓 → `{ list, requiredDocTypes }`

### GET /legal/required-status 🔒 → `{ required, missing: [{ docType, version, title }] }`

### POST /legal/accept 🔒 `{ documents: [{ docType, version }], scene? }`

个人中心“用户协议”页会把 `/legal/documents` 返回的多份启用协议一次性提交确认，推荐 `scene=profile_agreement`。默认必签协议为 `user_agreement/privacy_policy/ai_content_rules`。

### POST /compliance/confirm 🔒

`{ scene, taskId?, fileId?, templateId?, confirmationText }`

`scene` 支持 `export_save/share/public_template/platform_watermark_off`。`export_save` / `share` 场景需输入 `我确认`，`public_template` 与关闭平台显式水印场景传 `checked`；后者会保存账号级合规确认记录。`export_save` 只做合规确认，不受模板保存/使用会员开关或旧保存会员开关限制。

### GET /compliance/confirmations 🔒

---

## 错误码

| code | 说明 |
|------|------|
| 0 | 成功 |
| 400 | 参数错误 |
| 401 | 未登录 / Token 过期 |
| 403 | 无权限 / 会员不足 |
| 404 | 资源不存在 |
| 429 | 请求过于频繁 |
| 5000 | 服务器内部错误 |
| 5102 | 积分余额不足 |
| 5202 | 合规确认未完成 |
