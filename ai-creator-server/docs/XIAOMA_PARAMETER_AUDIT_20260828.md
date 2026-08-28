# 小马参数与小程序链路审计（2026-08-28）

## 结论

本次核对使用了小马实时能力目录和模型详情接口，不以仓库中的历史 SQL migration 作为当前文档。实时目录版本为 `2026-08-27`；当前目录同步结果为小马 `139` 个模型（image `17`、video `55`、audio `7`、text/chat `60`）。

发现的主要根因是：小马不同模型虽然都使用同一个异步媒体入口，但必填字段名、字段类型、枚举值和返回包结构并不统一；旧 adapter 把小程序的 canonical 参数直接按通用字段发送，导致部分必填字段没有落到上游字段，或把上游不支持的 `n`、错误的 `resolution` 等字段发出。

本次已修复请求映射、能力暴露和跨供应商识别，并把数据库中 `wan2.7-xuxie` 的实时配置同步到当前目录。小程序沿用动态 capabilities，不需要增加模型专用硬编码。

## 实时协议核对

| 环节 | 小马实时约定 | 后端处理 |
| --- | --- | --- |
| 创建媒体任务 | `POST /v1/media/generate`，请求体为顶层 `model`、`prompt`、`params` | `xiaoma.adapter.ts` 统一提交 |
| 创建响应 | envelope `code=200` 才表示业务成功，任务号位于 `data.task_id`；HTTP 200 不能单独当作成功 | 创建媒体任务改为严格校验 `code=200`，缺少 code 或返回 `0` 会进入失败流程 |
| 查询任务 | `GET /v1/skills/task-status?task_id=...`；当前响应为裸对象，状态在顶层 `state/status`，完成标志为 `is_final=true`，成功状态为 `success` | adapter 同时支持裸对象和兼容嵌套字段，并把 `success` 映射为内部 `completed` |
| 结果字段 | 完成响应使用顶层 `result_url`；结果域名可能与 API 域名不同 | `extractParsedResult` 和 Xiaoma adapter 已支持 `result_url`，随后进入统一转存 |
| 输入文件 | 图片/音频可用公网 URL 或 base64；视频必须使用公网 URL；复数上传字段必须传数组 | 小程序通过统一上传流程提供 URL，adapter 按模型声明恢复单数/复数字段和数组类型 |
| 费用 | 当前小马媒体费用文档按 CNY 计价 | `parseCost` 改为 `CNY`，金额按元转分 |

## 参数、类型和调用方式差异

| 当前模型 | 上游关键字段 | 已处理的差异 |
| --- | --- | --- |
| `qwen-image` | `size` 是比例字符串，例如 `21:9`；`prompt_extend` 是开关值；不声明 `n` | 小程序的 `ratio` 映射到声明的 `size`，不再额外发送 `aspect_ratio` 或 `n` |
| `banana-pro` / `banana-2` | `aspectRatio` + `imageSize`；`banana-2` 另有思考/联网可选参数 | 保留 `21:9`，将分辨率映射为 `imageSize`；只对小马当前精确模型 token 启用 Banana mapping |
| `tt-image-2` | `size` 是像素字符串，不是 `1K/2K`；当前目录没有 `n` | 根据小程序的 ratio/resolution 生成声明的像素尺寸；最大输出数按声明收敛为 1 |
| `gk-video-3` | `aspect_ratio`、`size`、`duration`；当前可用尺寸/时长是枚举值 | 将 `720p` 等 UI 值恢复为上游枚举拼写（如 `720P`），将 `10s` 转为 `10` |
| `gk-video-3.5` | `aspect_ratio`、`resolution`、`duration` 均为声明字段 | 不再只依赖旧模型 ID 分支，按实时 `remote_parameters` 选择字段 |
| `vo3.1` | `generation_mode`、`enhance_prompt`、`enable_upsample`、`generation_type`、`quality` | 小程序的模式、开关和首尾帧输入映射到对应字段；`generation_type` 根据 `videoMode` 与图片数量生成 `TEXT/REFERENCE/FIRST&LAST` |
| `kwvideo-v2-ref` | `version`、`duration`、`resolution`、`images` 为必填/关键字段 | 使用实时配置中的 `default_params.version=Mini` 等默认值；图片字段始终按数组处理 |
| `wan2.7-xuxie` | 必填上传字段是 `clips`，不是通用 `video_url` | 将它识别为 `video_edit`，把视频 URL 发送到 `clips: []`；已同步数据库配置 |

小马目录中的新模型仍可能出现脚本字段、音色字段或其他专用字段。例如当前 `vidu-jieshuoman` 需要 `script_name/script_content/assets`，当前 `speech-2.8` 需要 `voice_id`。这两个模型目前没有绑定到前台档位，因此没有被小程序展示；在增加绑定前必须先补对应产品输入控件和 adapter 映射。

## 小程序匹配情况

调用链为：

`ai-image/ai-video` → `model-tiers` 动态 capabilities → `task.service` canonical 参数 → Xiaoma model config 声明映射 → `/v1/media/generate` → status polling → 结果转存。

核对结果：

- 图片页从 `sizeOptions` 生成比例和分辨率选择，当前后端返回的 `21:9` 不再被归一化为 `7:3`。
- 视频页从绑定模型的 ratios、qualities、durations、audioModes 和 media limits 生成控件；不会为未声明的字段凭空发送 `resolution`、`n` 等参数。
- `maxImages` 现在优先看小马模型是否声明 `n`；当前 `tt-image-2` 等不支持多张输出的模型在小程序中会收敛到 1 张。
- `inputAssets` 是小程序到后端的统一素材入口；后端再按 `images`、`clips`、`video`、`audio` 等模型声明转换，避免同一素材重复传递。
- `wan2.7-xuxie` 的目录同步后，若未来绑定到视频编辑档位，小程序可以根据 `video_edit/source_video` 能力展示视频上传入口。

## 红鸟和 Agnes-AI 影响评估

本次没有修改红鸟或 Agnes-AI 的请求协议和 adapter 分支。共享图片映射存在以下保护：

- `tt-image-2` 只有在 Xiaoma 传入 provider context 时才走 GPT Image 2 的像素尺寸映射；不会改变 Hongniao/OpenAI-compatible 的默认处理。
- `gr-banana-pro`、`banana2-S` 等红鸟模型 ID 不会被误判为小马 Banana 模型；红鸟当前仍按自身的 `quality/resolution` 字段处理。
- Agnes-AI 的 `isAgnesModel` 专用路径仍优先执行；Agnes 当前请求回归测试通过。
- 三家实时目录门禁均通过：小马 `remote=139`、红鸟 `remote=24`、Agnes-AI `remote=10`，均无新增、删除或待同步配置差异。

## 代码和数据变更

核心代码变更：

- `server/src/services/adapters/xiaoma.adapter.ts`：严格创建响应 code、实时 envelope 错误解析、声明字段映射、CNY 费用。
- `server/src/services/adapters/xiaoma-video-param-mapper.ts`：按 `remote_parameters/param_names` 选择精确字段、恢复枚举大小写、处理 `clips` 和多媒体数组。
- `server/src/services/adapters/image-param-mapper.ts`：TT Image 2 provider-scoped mapping，精确识别当前小马 Banana token。
- `server/src/services/image-size-options.service.ts`：补充 TT 支持比例/像素表、保留产品比例、按声明判断输出数量、暴露模型参考图上限。
- `server/src/services/xiaoma-media-parameters.ts`、`server/src/services/media-input-limits.service.ts`：增加 `clips` 作为视频输入字段。
- `server/scripts/check-xiaoma-image-params.ts`、`server/scripts/check-xiaoma-config-refresh.ts`、`server/test/xiaoma-current-catalog-contract.test.mjs`：增加当前目录契约和跨供应商回归检查；历史 migration 检查不再把旧的 `speech-2.8` 行当成实时文档。
- 本地归档 `other/notes/API_CAPABILITIES.md`：增加历史缓存与实时目录的边界说明；它不是运行时能力的唯一来源。

数据变更：通过只针对 Xiaoma 的 provider model sync apply，将 `wan2.7-xuxie` 的数据库配置更新为实时声明；本次无新增、无删除模型。

## 输出结果比例和尺寸风险

请求侧的比例已经按模型声明发送，且小程序页面选择会优先使用后端返回的 capabilities。结果侧仍有一个需要后续处理的元数据问题：

- 小马文档允许上游对选定尺寸进行下采样，实际像素应以下载后的媒体内容为准。
- 当前 HTTP 流式转存路径为保护内存而不解析图片内容，`files.width/height` 会记录为 `0`；`ai_task_outputs` 在此情况下会回填计划尺寸。因此 API 元数据可能表示“计划尺寸”而不是“实际尺寸”。
- 小程序结果页会在媒体加载时读取实际宽高用于预览比例，所以目前视觉展示不会依赖错误的计划尺寸；但作品库、第三方调用者或分辨率文案仍可能看到不精确数据。

这不是本次参数映射改动引入的回归，建议后续在受控大小/超时限制下对图片流做尺寸探测，或明确区分 `targetWidth/targetHeight` 与 `actualWidth/actualHeight`。

## 验证结果

- `npm run check:all`：通过；`check:tiers` 仅提示 3 个未绑定主模型的文本/工具档位，属于当前数据库状态警告。
- `npm run build`：通过。
- `npm run lint`：0 errors，12 warnings；均为现有未使用变量、异常 cause、prefer-const 等告警。
- `npm run check:provider-model-catalog`：通过，三家目录完整且无待同步差异。
- Xiaoma image/video/config checks：通过。
- `node --import tsx --test test/agnes-adapter-request.test.mjs test/xiaoma-current-catalog-contract.test.mjs test/xiaoma-adapter-remote-media-params.test.mjs test/xiaoma-video-param-mapper-multimedia.test.mjs`：13/13 通过。
- 小程序 `npm run typecheck`：通过；`npm run build:mp-weixin`：通过。构建仅有 uni-app/Sass 版本提示和既有 circular chunk 提示。

未执行真实的付费小马、红鸟或 Agnes 生成任务，因此不能声称已完成生产 API 联调；本次是实时目录读取、数据库同步和 mock/contract 验证。

## 后续风险

1. 小马模型目录和可用枚举会变化，部署前应运行 provider catalog preview；出现差异后再 apply，并检查绑定档位。
2. `vidu-jieshuoman`、`speech-2.8` 等需要专用输入的模型不能仅凭 `model_type` 绑定到现有小程序档位。
3. 本次会话中曾暴露供应商 API key。请立即在供应商侧轮换两把 key，并仅通过服务器环境变量/密钥管理配置，避免写入代码、文档、日志或聊天记录。
