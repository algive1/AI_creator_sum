# Provider Model Catalog Sync - 2026-08-28

## 结论

已使用真实上游目录完成 Xiaoma、Hongniao 和 Agnes AI 的同步、能力配置刷新及 stale model 清理。当前本地数据库状态满足上线前目录门禁：三家目录完整、没有新增/变更/删除待处理项，active provider-specific tier 均绑定到具备对应 feature capability 的 live model。

本次操作没有把 API key 写入源码、SQL、前端或本文档。通过项目已有的环境变量同步机制写入数据库的 key 为加密值；聊天中出现过 key，仍建议在供应商控制台轮换。

## 实际上游与本地数量

检查时间：2026-08-28（Asia/Shanghai）。

| Provider | 上游 live models | 本地 active models | 类型分布 | 能力来源 | 异步模型 |
|---|---:|---:|---|---|---:|
| Xiaoma (`xiaoma`) | 139 | 139 | text 60 / image 17 / video 55 / audio 7 | 136 declared + 3 inferred | 79 |
| Hongniao (`hongniao`) | 24 | 24 | image 8 / video 16 | 24 declared from `/v1/models` | 24 |
| Agnes AI (`agnes_ai`) | 10 | 10 | text 5 / image 2 / video 3 | 10 documented by official docs | 3 |

### 能力分类

- Xiaoma：60 个 text model 均有 `text_chat`、`text_generation`；17 个 image model 有 `text_to_image`、`image_to_image`；55 个 video model 按上游参数分为 `text_to_video` 22、`image_to_video` 48、`first_last_frame_video` 14、`video_edit` 11；7 个 audio model 有 `audio_generation`。
- Hongniao：8 个 image model 有 `text_to_image`、`image_to_image`；16 个 video model 有 `text_to_video`、`image_to_video`，其中 10 个还声明了 `video_edit`。原始 `tasks[].parameters` 保存在 `config.remote_parameters`。
- Agnes text models：`agnes-2.0-flash`、`agnes-2.5-flash`、`agnes-2.5-pro`、`agnes-2.5-pro-alpha`、`agnes-2.5-pro-beta`，能力为 `text_chat`、`text_generation`、`vision_chat`、`image_understanding`、`tool_calling`、`agent_workflow`、`reasoning`、`code_generation`、`long_context`、`streaming`。
- Agnes image models：`agnes-image-2.0-flash`、`agnes-image-2.1-flash`，能力为 `text_to_image`、`image_to_image`、`image_edit`、`multi_image_composition`、`style_control`，并声明 URL/base64 image output。
- Agnes `agnes-video-v2.0`：`text_to_video`、`image_to_video`、`first_last_frame_video`、`keyframe_animation`、`motion_control`、`visual_consistency`、`cinematic_output`、`async_generation`。
- Agnes `agnes-video-2.5`：`text_to_video`、`image_to_video`、`first_last_frame_video`、`video_reference`、`video_to_video`、`video_edit`、`audio_reference`、`audio_visual_sync`、`async_generation`。
- Agnes `agnes-video-2.5-flash`：`text_to_video`、`image_to_video`、`first_last_frame_video`、`audio_reference`、`async_generation`；仅 720P，视频引用不支持，最多 5 张参考图。

Agnes 能力与端点依据 [官方模型文档索引](https://wiki.agnes-ai.com/llms.txt) 及 [官方中文概览](https://agnes-ai.com/zh-Hans/docs/overview) 写入；每个 Agnes live model 的 `config.capability_source=agnes_official_model_docs`、`capability_confidence=documented`。

Xiaoma 有 3 个 chat 详情接口未成功返回：`kimi/kimi-k2.7-code-highspeed`、`kimi/kimi-k2.7-code`、`stepfun/step-3.7-flash`。它们仍存在于完整的上游 model list 中，但只登记基础 `text_chat`/`text_generation`，标记为 `capability_confidence=inferred`，不会伪造 vision/tool/reasoning 等高级能力。

## 失效模型处理

- Xiaoma：29 个不在完整上游目录中的 live model 已写入 `ai_model_catalog_archive` 后物理删除。
- Hongniao：8 个不在完整上游目录中的 live model 已归档后物理删除；另外 3 个历史遗留的 `deleted_at` 软删除模型也已归档后物理删除，因此归档表累计 11 条。
- Agnes：没有 stale model，归档 0 条。
- 三家当前 `ai_models` 均只有 `status=active`；没有把上游不存在的模型保留为 inactive live row。
- 删除前会拒绝删除仍被 `pending/queued/processing` 任务引用的 model；绑定、fallback、model capability、price rule 会在同一事务中清理。
- 历史任务、调用日志和成本日志通过 `ai_model_catalog_archive` 回显原 model 名称，不因 live model 物理删除而丢失可读性。

因历史 provider-specific tier 只绑定了已消失的模型，当前额外将 17 个没有任何 live model 的 `xiaoma_*` / `hongniao_*` tier 设为 inactive，避免生产前台暴露空入口。这不是模型停用；仍有 live model 且能力匹配的 14 个 provider-specific tier 保持 active。孤儿 `tier_model_bindings` 为 0。

范围外风险：数据库仍有 3 个历史全局默认档位没有任何模型绑定：`prompt_optimize_standard`、`tool_cutout_standard`、`tool_prompt_reverse_standard`。它们不属于本次三家 provider 目录，且当前没有权威的 provider/model 映射；本次没有擅自绑定模型或关闭功能。若生产需要开放这 3 项功能，发布前必须补充明确的模型来源和能力映射。

## 代码与联动修改

- `server/src/services/model-sync.service.ts`：严格 provider 目录同步；完整目录校验；归档后 hard delete；空 tier 自动处理；Xiaoma/Hongniao 能力来源与 confidence；Agnes 官方文档能力映射。
- `server/src/migrations/20260828_001_model_catalog_hard_delete.sql`：新增历史 model archive 表。
- `server/src/migrations/20260828_002_deactivate_empty_provider_tiers.sql`：清理当前无 live model 的 provider-specific tier。
- `server/src/migrations/20260828_003_archive_and_delete_legacy_provider_models.sql`：清理旧流程留下的软删除 model。
- `server/src/services/adapters/openai-compatible.adapter.ts`：接入 Agnes image/video 端点、异步查询 URL、`video_id` 和 model 参数传递；按官方文档区分 v2.0 的 `width/height/num_frames/frame_rate` 与 2.5 的 `seconds/size/aspect_ratio` 请求体。
- `server/src/services/video-polling.service.ts`、`server/src/services/task-timeout-recovery.service.ts`、`server/src/routes/admin-tiers.ts`、`server/src/routes/admin-config-check.ts`：异步查询链路传递 `api_model_name`/model config。
- `server/src/routes/admin.ts`、`server/src/routes/admin-models.ts`：历史任务、调用日志、成本统计兼容 archive snapshot。
- `server/scripts/sync-provider-models.ts`：可重复执行的 preview/apply CLI。
- `server/scripts/check-provider-model-catalog.ts`：生产只读门禁，检查上游目录一致性、能力匹配和空 tier。
- `admin-web/src/pages/ProviderModels.tsx`：同步弹窗改为 hard delete 文案；目录不完整时禁用确认按钮；显示能力详情拉取失败。

## 验证结果

已通过：

- `server`: `npm run build`
- `server`: `npm run lint`（0 errors；仅项目既有 warnings）
- `server`: `node --import tsx --test test/model-sync-service.test.mjs`
- `server`: `node --import tsx --test test/agnes-adapter-request.test.mjs`（Agnes v2.0/v2.5 请求体）
- `server`: Xiaoma adapter、video capability、polling 相关 12 项测试
- `server`: `npm run check:migrations-idempotent`
- `server`: `npm run check:provider-model-rollout`
- `admin-web`: `npm run build`
- `admin-web`: `npm run lint`（0 errors；仅项目既有 warnings）
- 数据库：`npm run db:migrate`
- live gate：`npm run check:provider-model-catalog -- --providers=xiaoma,hongniao,agnes_ai`

live gate 只对本次指定的三家 provider 及其 provider-specific tiers 做硬阻断；上面的 3 个范围外空档位会按产品功能上线决策单独处理。

## 生产部署门禁

生产环境迁移和同步时必须使用生产数据库与生产环境变量，不要把 key 写入仓库：

```bash
npm run db:migrate
npm run sync:provider-models -- --mode=apply --providers=xiaoma,hongniao,agnes_ai
npm run check:provider-model-catalog -- --providers=xiaoma,hongniao,agnes_ai
```

其中 `XIAOMA_API_KEY`、`HONGNIAO_API_KEY`、`AGNES_API_KEY` 由部署环境注入。`apply` 在上游目录不完整、目录为空或运行中任务引用待删除模型时会失败并回滚；`check` 非零退出时禁止发布。

本次已验证的是当前工作区连接的数据库和真实上游目录，不等于已经替生产服务器执行发布/重启；生产发布仍需在生产环境按上述门禁执行并确认进程重新加载配置。
