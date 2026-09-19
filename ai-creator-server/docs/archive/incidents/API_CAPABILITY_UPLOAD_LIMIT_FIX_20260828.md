# API 模型上传能力与小程序数量一致性修复

日期：2026-08-28

## 问题原因

小程序请求的 `/public/model-tiers` 已经按功能加载档位，但图片参考图数量仍可能使用 `tier_capabilities.max_reference_images` 的历史默认值（通常为 4），没有覆盖绑定模型配置中的真实上限。视频能力计算同样把档位传入的默认上限放在模型配置之前；当模型真实参数是 `maxItems=9`、`max_video_urls=3` 或 `max_audio_urls=2` 时，页面和任务校验可能按旧值处理。

另外，视频模型的 `remote_parameters` 可能是按任务嵌套的参数结构，原能力判断只看第一层，无法稳定发现图片、视频、音频参数。视频编辑页面原来固定显示 1 个源视频，服务端也有“只能上传一个源视频”的硬编码，和支持多视频的模型配置冲突。图片页面还把文生图、图生图、图片编辑的入口逻辑混在一起，图片编辑多图时也会退回小上传卡片；预览区的槽位策略没有明确区分“视觉槽位”和“可用上限”。

## 修改方案

1. 新增 `media-input-limits.service.ts`，在服务端本地解析已从数据库加载的模型配置：
   - 优先读取远端媒体参数的 `maxItems`（含嵌套任务参数）；
   - 没有 `maxItems` 时读取模型配置的 `max_reference_images/max_video_urls/max_audio_urls`；
   - 最后才回退到档位能力或兼容默认值；
   - 不新增供应商请求，也不新增小程序请求。
2. 公共档位接口和任务路由统一使用模型有效能力：
   - 图片 `buildImageSizeCapabilities` 现在返回模型实际 `maxReferenceImages`；
   - 视频 `buildVideoCapabilities` 优先使用绑定模型的输入模式、参考上传模式和媒体数量；
   - `model-tier-list.service.ts` 与 `tier-router.service.ts` 使用同一能力计算结果，避免“页面允许但提交被拒绝”或反过来的分叉。
3. 小程序联动：
   - 文生图始终保持纯文字输入，不显示参考图入口；图生图保留主图 + 参考图上传结构，并按当前绑定模型的参考图上限显示和裁剪；
   - 图片编辑始终使用大上传卡片；模型上限为 1 时走单图流程，上限大于 1 时通过“继续上传”和预览槽位追加多图；
   - 预览区默认显示 4 个槽位，上限小于 4 时超出槽位置灰并禁止操作，上限大于 4 时显示真实数量；
   - 参考生视频按图片/视频/音频各自的能力和数量显示素材卡；
   - 视频编辑当 `maxVideoUrls > 1` 时使用动态多视频素材卡，并继续复用现有上传、预览、替换、删除和 `inputAssets` 链路；
   - 仍保持图生视频单首图、首尾帧 2 张等模式语义，不把不同模式混用。
4. 服务端视频编辑会解析并保留多个允许的视频输入，数量由同一份有效模型能力校验；不再无条件拒绝第二个源视频。

## 主要文件

- `server/src/services/media-input-limits.service.ts`
- `server/src/services/image-size-options.service.ts`
- `server/src/services/video-capabilities.service.ts`
- `server/src/services/model-tier-list.service.ts`
- `server/src/services/tier-router.service.ts`
- `server/src/services/task.service.ts`
- `uni-app/src/pages/ai-image/index.vue`
- `uni-app/src/pages/ai-video/index.vue`
- `server/test/media-input-limits.test.mjs`
- `server/test/video-capabilities-multimedia.test.mjs`
- `server/test/video-multi-input-flow.test.mjs`
- `uni-app/src/pages/video-media-upload-ui.test.mjs`

接口契约同步更新于 `docs/API.md`、`docs/MINI_PROGRAM_API.md`、`docs/AI_DEVELOPMENT_GUIDE.md`、`docs/DEVELOPMENT.md`。

## 验证结果

- 服务端 `npm run build`：通过。
- 服务端 `npm run lint -- --no-warn-ignored`：0 errors；12 条为项目原有 warning。
- 服务端 `npm run check:all`：通过；`check:tiers` 仅报告已有的未绑定档位 warning。
- 服务端 `node --import tsx --test test/*.mjs`：120/120 通过。
- 小程序 `npm run typecheck`：通过。
- 小程序 `npm run build:mp-weixin`：通过；仅有 uni-app/Sass 版本提示和既有 circular chunk 提示。
- 小程序页面回归测试：11/11 通过。
- `git diff --check`：通过。

## 风险与后续

- 本次没有真实调用第三方 API；模型真实数量依赖后台同步或模型配置中保存的参数。若后台模型配置已经过期，需要先执行现有模型同步/档位能力修复流程。
- 通用及 Hongniao 适配器会透传允许的多媒体数组；个别供应商专用适配器若有明确的上游限制，仍可能按其专用映射截断，这是供应商契约约束，不应由小程序继续放大数量。
- 当前工作区在任务开始前已经存在其他未提交修改和新增文件，本次未清理、回滚或覆盖这些改动。
