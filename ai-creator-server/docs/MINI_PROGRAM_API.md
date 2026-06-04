# AI 创作工坊 · 小程序接口文档

> 基础地址：`https://你的域名/api/v1`
> 全部 JSON 格式，文件上传用 multipart/form-data
> 标注 🔓 无需登录，🔒 需 `Authorization: Bearer <token>`

---

## 通用说明

### 鉴权

通过 `/auth/wechat-login` 获取 token 和 refreshToken，过期后用 `/auth/refresh-token` 刷新。小程序端应保存新的 refreshToken。

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

个人中心聚合数据：用户、积分、会员、邀请统计、菜单入口。

`membership` 会返回我的页和会员信息页展示字段：`isMember/membershipLevel/versionKey/versionName/planId/planName/durationType/durationDays/startedAt/expireAt/remainingDays/rights`。小程序头像昵称填写后继续复用 `PUT /users/me` 保存 `nickname/avatarUrl`。

---

## 二、应用配置

### GET /public/app 🔓

小程序启动时调一次，缓存使用。包含：

| 字段 | 说明 |
|------|------|
| `appName` / `siteName` | 站点名称 |
| `features` | 功能开关（wechatLogin / payment / membership / invite / imageCreate / videoCreate / promptOptimize 等） |
| `featureKeys` | 所有启用功能的 key 数组 |
| `modelTiers` | **按 feature 分组的完整档位信息**（名称 / 积分 / 能力配置 / 画质倍率） |
| `customerService` | 客服配置（标题 / 图标 / 卡片） |
| `help` | 使用帮助配置：`enabled/title/contentHtml`，内容来自后台微信配置 |
| `visualAssets` | 小程序运营素材 URL：`homeBannerUrl/homeMemberUpsellUrl/inspirationBannerUrl/comicBannerUrl/profileMemberOfferBannerUrl`；为空时小程序使用本地 JPG 或 CSS 兜底 |
| `tabBar` | 底部导航栏 |
| `membershipEnabled` / `inviteEnabled` / `paymentEnabled` | 功能开关 |

`visualAssets` 中的图片必须使用公网 HTTPS，并在微信公众平台配置到 `downloadFile` 合法域名。首页 3 个核心入口图保留本地 JPG，不依赖后台配置。

### GET /public/model-tiers 🔓

按单个 feature 获取档位列表。也可直接从 `/public/app` 的 `modelTiers` 字段取。

**参数：** `?feature=image_create`

**返回：** `{ list: [{ id, tierId, tierName, tierKey, basePointsCost, pointsCost, memberDiscountPercent, memberDiscountApplied, isDefault, capabilities: { ratios, qualities, styles, durations, audioModes, defaultAudioMode, supportedSizeModes, maxImages, maxReferenceImages, maxDurationSeconds } }] }`

若请求带有效用户 token，`pointsCost` 为当前用户会员折扣后的实际扣费积分；`basePointsCost` 为档位原始积分；`memberDiscountPercent=100` 表示无折扣。

常用 feature：`image_create`、`image_to_image`、`image_edit`、`video_create`、`image_to_video`、`first_last_frame_video`、`video_edit`、`prompt_optimize`。默认种子档位示例：`image_standard`、`image_to_image_standard`、`image_edit_standard`、`video_standard`；APIMart 迁移会额外提供 `apimart_*` 专属档位。

### GET /public/templates 🔓

按展示位置筛选模板，置顶优先。

**参数：** `?type=image&feature=text_to_image&page=1&pageSize=10`

### GET /app/home 🔓

首页聚合：弹窗公告、首页公告、功能入口、推荐/热门模板、灵感分类、用户摘要、最近作品、积分中心、会员入口。

`homeAnnouncements` 返回当前可见的首页公告，按 `priority DESC, sort_order DESC, created_at DESC` 排序，最多 10 条。小程序首页取第一条展示公告条，字段包含：

| 字段 | 说明 |
| --- | --- |
| `id/title/content/type` | 公告基础信息 |
| `showFrequency/priority` | 展示频率与排序权重 |
| `startAt/endAt/createdAt` | 展示时间、结束时间与创建时间 |
| `readAt/closedAt` | 登录用户的已读/关闭记录，未登录时为空 |

---

## 三、AI 创作

### POST /tasks/image 🔒

**文生图 text2img：** `{ prompt, tierKey:"image_standard", ratio?, quality?, style?, negativePrompt?, platformWatermarkEnabled? }`

**图生图 img2img：** `{ prompt, subType:"img2img", tierKey:"image_to_image_standard", uploadKeys:["主图fileNo"], referenceKeys?:["参考图fileNo"], platformWatermarkEnabled? }`

**图片编辑 edit：** `{ prompt, subType:"edit", tierKey:"image_edit_standard", uploadKeys:["待编辑图fileNo"], editTool:"eraser", maskFileId?, maskUrl?, backgroundFileId?, backgroundUrl?, platformWatermarkEnabled? }`

图生图和图生视频的普通参考图数量由所选档位 `capabilities.maxReferenceImages` 控制；未返回该字段时小程序按最多 4 张处理。首尾帧视频固定首图/尾图 2 张；图片编辑固定 1 张待编辑图；视频编辑固定 1 个源视频。

提交前会校验后台敏感词库，命中后不创建任务、不扣积分，返回 `code=1006`，提示：`生成内容敏感，请勿生成违规内容。请修改后再次生成。`

`platformWatermarkEnabled` 缺省为 `true`。开启时服务端会在生成图片左下角写入 `AI艺术生成工坊`；关闭时不添加可见平台水印，并在文件记录中标记已关闭平台水印。图片编辑选择 `去水印` 时后端会强制不叠加平台水印。该参数仅用于图片任务，视频任务不支持。

### POST /tasks/video 🔒

`{ prompt, tierKey:"video_standard", subType?:"text_to_video"/"image_to_video"/"first_last_frame_video"/"video_edit", ratio?, duration?, resolution?, quality?, audioMode?, preserveAudio?, inputAssets?, uploadKeys?, firstFrameFileId?, lastFrameFileId?, videoFileId?, videoUrl? }`

`audioMode` should be one of the selected tier `capabilities.audioModes`; the backend forwards it as `audioMode/audio_mode` only when provided. `preserveAudio` is for video edit and is forwarded as `preserveAudio/preserve_audio`. `inputAssets` is stored after whitelist cleanup for result-page display only; only `type/typeLabel/path/uploadKey/fileId/mediaType` are retained.

图生视频、首尾帧视频和视频编辑如使用第三方异步模型，上传素材最终必须能转为公网可访问 HTTPS URL。

提交前同样校验后台敏感词库，命中后返回 `code=1006` 并阻止创建任务。

### POST /tasks/optimize-prompt 🔒

`{ prompt, scene?, style?, ratio? }` → `{ optimizedPrompt, styleSuggestions, charged, pointsCost }`

### POST /tasks/script 🔒

`{ topic, style?, duration?, characters? }` → 分镜脚本

### POST /tasks/prompt 🔒

`{ idea, scene?, style?, count? }` → 提示词变体

### POST /tasks/storyboard 🔒

`{ script, style?, ratio? }` → 分镜描述

### GET /tasks 🔒

我的任务列表。筛选：`?type=image/video&status=pending/queued/processing/completed/failed`

返回列表字段包含 `id/taskId/taskNo/title/type/subType/status/progress/prompt/optimizedPrompt/formData/params/editTool/generationMode/tierName/tierKey/outputs/thumbnail/coverUrl/pointsCost/pointsRefunded/ratio/size/auditStatus/failReason/errorMessage/createdAt/completedAt`。`outputs[].url` is the saved media URL, `outputs[].video` is set for video outputs, and `outputs[].thumbnail` is the preview image. `generationMode` 为任务创建入口/档位展示名，例如 `专业生图`；`pointsCost` 为任务创建时实际冻结和扣减的积分。

### GET /tasks/:id 🔒

任务详情：输入参数、输出结果、审核状态、积分流水。

返回字段与任务列表一致，并包含完整 `outputs` 数组。

### POST /tasks/:id/cancel 🔒

取消尚未完成的任务，成功返回 `{ cancelled: true }`。已完成、失败、已取消或不属于当前用户的任务不可取消。

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

### POST /checkin 🔒 普通签到

### POST /checkin/super 🔒 超级签到 `{ sessionId }`

### POST /checkin/makeup 🔒 补签 `{ targetDate? }`

### GET /point-tasks 🔒

积分任务列表：`{ todayAvailable, list: [{ id, title, group, reward, icon, action, resetCycle, completed, sortOrder }] }`。

任务中心按钮只跳转到对应业务页面；积分由签到、广告、邀请、会员等原业务发放，不提供额外领取接口。

---

## 五、激励广告

### GET /ads/status 🔒 → `{ watchedToday, remainingToday, rewardPerWatch }`

### POST /ads/session 🔒 → `{ sessionId }`

### POST /ads/reward 🔒 `{ sessionId, completed? }` → `{ rewarded, rewardPoints, balance }`

---

## 六、邀请

### GET /invite/my-code 🔒 → `{ inviteCode, sharePath, shareTitle }`

### POST /invite/bind 🔒 `{ inviteCode }`

### GET /invite/summary 🔒 → `{ inviteCount, totalRewardPoints }`

### GET /invite/records 🔒 分页

---

## 七、模板

### GET /templates/categories 🔓 → `{ list: [{ id, name, categoryKey, icon }] }`

### GET /templates 🔓 筛选：`?templateType=image/video/inspiration&categoryId=&keyword=&sortBy=recommended/hot/new`

返回含 `usageType`（generate=文生图 / reference=图生图 / edit=编辑）

### GET /templates/recommended 🔓 前 8 条

### GET /templates/search 🔓 `?keyword=xxx`

### GET /templates/inspirations 🔓 灵感广场

### GET /templates/:id 🔓 含会员权限校验

### POST /templates/:id/use 🔒 使用模板，返回 prompt 和参数

### POST /templates/share 🔒 `{ taskId, outputId?, outputIndex?, title, ... }` 分享作品

优先传 `outputId`；如果任务详情输出缺少数据库 ID，可传 `outputIndex`，后端按任务输出序号兜底查询。

### POST /templates/:id/cancel-public 🔒 取消公开

### GET /templates/my-templates 🔒

---

## 八、会员

### GET /membership/plans 🔒 → `{ list: [{ planId, name, planKey, versionKey, versionName, durationType, durationDays, price, originalPrice, tag, highlightFeatures, pointRule, featureDiscounts }] }`

会员页版本 Tab 由套餐列表中的 `versionKey/versionName` 派生，不再单独调用 `/membership/versions`。套餐权益明细通过 `/membership/plans/:id` 获取；未登录游客态可使用 `/shop/member-plans` 返回的 `rights`。

模型档位接口只返回至少有一个可用模型绑定的档位；如果后台供应商尚未配置 Base URL 或 API Key，该供应商专属档位会自动从小程序隐藏，后台配置完成后再展示。

注意：price 单位是**分**。

`pointRule.pointsDiscountRate` 为旧版全局积分消耗折扣，`1` 表示无折扣，`0.9` 表示 9 折。新版按功能折扣以 `featureDiscounts` 为准，字段为 `{ featureKey, featureName, discountPercent }`，`discountPercent=100` 表示无折扣，`95` 表示按原积分 95% 扣费。

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

### POST /payments/wechat/jsapi 🔒 `{ orderNo }` → `{ prepayId, nonceStr, timeStamp, paySign }`

客户端用此数据调 `wx.requestPayment()`。

### POST /payments/wechat/query 🔒 `{ orderNo }` 主动查单

---

## 十、文件管理

### GET /files/upload-config 🔒 → `{ uploadMode, storageProvider, maxFileSize, allowedMimeTypes }`

### GET /files/credential 🔒 `?fileCategory=&originalName=&fileSize=&contentType=&visibility=`

返回直传凭证，同时创建当前用户的私有占位文件：`{ storageKey, uploadUrl, cdnUrl, credential, expireAt, fileId, fileNo }`。

### POST /files/upload 🔒 multipart/form-data。字段：`file` + `fileCategory` + `visibility`

### POST /files/notify 🔒 `{ storageKey, provider, etag, fileSize }`

直传上传成功后调用。后端只确认 `/files/credential` 已创建的占位文件，防止陌生 `storageKey` 被绑定到用户。

### GET /files/:fileNo 🔒

### GET /files/:fileNo/url 🔓（私密文件需 Token）

### DELETE /files/:fileNo 🔒

### POST /files/batch-delete 🔒 `{ fileNos: [] }`

### POST /files/:id/export 🔒 去除元数据和水印

### GET /files/:id/export-status 🔒

---

## 十一、公告

### GET /announcements/popup 🔓

### GET /announcements 🔓 分页

登录用户返回项中包含 `readAt`；小程序个人中心消息红点以当前可见公告是否存在 `readAt` 为空的记录为准。

### GET /announcements/:id 🔓

### POST /announcements/:id/read 🔒

### POST /announcements/:id/close 🔒

---

## 十二、法律与合规

### GET /legal/documents 🔓 → `{ list, requiredDocTypes }`

### GET /legal/required-status 🔒 → `{ required, missing: [{ docType, version, title }] }`

### POST /legal/accept 🔒 `{ documents: [{ docType, version }], scene? }`

个人中心“用户协议”页会把 `/legal/documents` 返回的多份启用协议一次性提交确认，推荐 `scene=profile_agreement`。默认必签协议为 `user_agreement/privacy_policy/ai_content_rules`。

### POST /compliance/confirm 🔒

`{ scene, taskId?, fileId?, templateId?, confirmationText }`

`scene` 支持 `export_save/share/public_template/platform_watermark_off`。关闭平台显式水印时传 `{ scene:"platform_watermark_off", confirmationText:"checked" }`，用于保存账号级合规确认记录。

### POST /compliance/confirm 🔒 `{ scene, confirmationText, taskId?, fileId?, templateId? }`

export_save / share 场景需输入 `我确认`；public_template 场景传 `checked`。

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
