# 视频动态定价开发计划

更新时间：2026-06-09

## 背景

小马视频模型的上游价格不是单一固定价，存在以下扣费方式：

- 固定按次：例如 `omni-flash`
- 按次参数矩阵：例如 `sora-2`、`veo3.1`、`kling-v3-video`
- 按秒参数矩阵：例如豆包 Seedance、HappyHorse、PixVerse
- 按 token：例如 `kwvideo-v2`、`kwvideo-v2-ref`、`kwvideo-v2-quannengcankao`

当前项目中，视频小程序展示和任务扣费都只使用 `model_tiers.points_cost` 这个单一字段。时长、清晰度、声音、模式等参数只参与能力展示和提交参数，不参与动态定价。

上游价格快照见：

- `ai-creator-server/docs/XIAOMA_VIDEO_PRICING.md`

## 当前代码链路

小程序拿价格：

- `uni-app/src/api/ai-video.ts`
  - `GET /public/model-tiers?feature=...`
- `uni-app/src/pages/ai-video/index.vue`
  - 当前只读取 `selectedModel.pointsCost`
  - `generationCostText` 只展示固定档位价

后台公开档位接口：

- `ai-creator-server/server/src/routes/public-config.ts`
  - 注册 `/api/v1/public/model-tiers`
- `ai-creator-server/server/src/services/model-tier-list.service.ts`
  - 读取 `model_tiers.points_cost`
  - 返回 `basePointsCost / pointsCost`

任务创建扣费：

- `ai-creator-server/server/src/services/tier-router.service.ts`
  - `selectTierModel()` 读取 `model_tiers.points_cost`
  - 应用会员折扣后返回 `tierResult.pointsCost`
- `ai-creator-server/server/src/services/task.service.ts`
  - `createTierTask()` 按 `tierResult.pointsCost` 冻结积分
  - 写入 `ai_tasks.points_cost` 和 `price_snapshot`
  - 失败按冻结金额退款

后台档位管理：

- `ai-creator-server/server/src/routes/admin-tiers.ts`
  - 早期只保存 `pointsCost` 和历史 `qualityMultipliers`，当前生效价格应以 `pricing_mode/pricing_rules` 为准
- `ai-creator-server/admin-web/src/pages/FeatureConfig.tsx`
  - 已支持动态定价 JSON，并提供按次矩阵、按秒矩阵、token 预扣的辅助编辑器

## 产品原则

1. 平台售价和上游成本分开。小马价格只作为成本参考，用户扣费以后台配置的“创作点”规则为准。
2. 前端展示价不参与真实扣费。任务创建时后端必须按同一套规则重新计算并冻结积分。
3. 保持兼容。没有配置动态规则的档位继续按 `points_cost` 固定价运行。
4. 单一选项也要展示。例如只支持 8 秒，仍展示“8 秒”但锁定；只支持有声/无声也展示并锁定。
5. token 类模型只做平台预扣，不在本系统按 token 数量自动补扣或退款。token 数量和上游真实成本由小马侧计算，本系统只保留成本快照和运营复核入口。

## 第一阶段范围

本阶段做“可配置、可展示、可真实扣费”的最小闭环：

1. 数据库增加动态定价字段。
2. 后端增加统一价格计算服务。
3. `/public/model-tiers` 返回价格规则。
4. `selectTierModel()` 按用户选择参数重算价格。
5. `price_snapshot` 记录命中的价格规则和参数。
6. 小程序视频页读取规则，按当前选择展示预计消耗。
7. 后台支持 JSON 配置，同时提供常用矩阵规则辅助编辑器，最终仍以保存的 `pricing_rules` JSON 生效。

暂不做：

- 自动同步小马上游价格到后台售价。
- token 模型完成后按实际 token 自动补扣/退回。
- 小马上游价格自动覆盖平台售价；当前只提供价格快照同步脚本，人工确认后再改平台创作点。
- 多价格版本和历史审计表。

## 数据库设计

在 `model_tiers` 上新增字段：

```sql
pricing_mode VARCHAR(32) NOT NULL DEFAULT 'fixed'
pricing_rules JSON NULL
```

保留现有字段：

```sql
points_cost INT NOT NULL DEFAULT 1
```

字段职责：

- `points_cost`：固定价、默认价、兜底价。
- `pricing_mode`：
  - `fixed`
  - `matrix`
  - `per_second_matrix`
  - `token_preauth`
- `pricing_rules`：平台创作点定价规则 JSON。

不放在 `ai_models` 的原因：

- `ai_models` 是真实模型/供应商调用配置。
- 同一真实模型可以绑定到不同档位，售价应允许不同。
- 任务扣费当前按档位生效。

不放在 `tier_capabilities` 的原因：

- `tier_capabilities` 是“支持哪些参数”。
- 定价是“这些参数如何收费”，职责不同。

## pricing_rules 结构

固定价可以不填 `pricing_rules`：

```json
{
  "mode": "fixed"
}
```

按次矩阵：

```json
{
  "mode": "matrix",
  "defaultParams": {
    "duration": "5s",
    "quality": "720P",
    "audioMode": "silent"
  },
  "rules": [
    {
      "conditions": { "duration": "5s", "quality": "720P" },
      "pointsCost": 20
    },
    {
      "conditions": { "duration": "10s", "quality": "1080P" },
      "pointsCost": 60
    }
  ]
}
```

按秒矩阵：

```json
{
  "mode": "per_second_matrix",
  "defaultParams": {
    "duration": "5s",
    "quality": "720P",
    "audioMode": "silent"
  },
  "defaultUnitPoints": 6,
  "rules": [
    {
      "conditions": { "quality": "720P" },
      "unitPoints": 6
    },
    {
      "conditions": { "quality": "1080P", "audioMode": "audio" },
      "unitPoints": 12
    }
  ]
}
```

token 预扣：

```json
{
  "mode": "token_preauth",
  "preauthPoints": 80,
  "settlement": "manual_later"
}
```

规则匹配原则：

1. 后端优先匹配 `rules` 中 conditions 全部命中的规则。
2. 多条命中时，选择 conditions 字段最多的一条。
3. 没有命中时退回 `points_cost`。
4. `per_second_matrix` 使用 `duration` 解析秒数，`秒数 * unitPoints`。
5. 会员折扣在计算出基础创作点后统一应用。

## 后端改动计划

### 1. 新增迁移

文件建议：

- `ai-creator-server/server/src/migrations/20260609_004_video_dynamic_pricing.sql`

内容：

- 给 `model_tiers` 增加 `pricing_mode`
- 给 `model_tiers` 增加 `pricing_rules`
- 要写成幂等迁移，重复执行不报错

### 2. 新增价格计算服务

文件建议：

- `ai-creator-server/server/src/services/tier-pricing.service.ts`

导出：

```ts
export type TierPricingMode = 'fixed' | 'matrix' | 'per_second_matrix' | 'token_preauth';

export function resolveTierPricing(input: {
  basePointsCost: number;
  pricingMode?: string;
  pricingRules?: any;
  params?: Record<string, any>;
  discountPercent?: number;
}): {
  pricingMode: TierPricingMode;
  basePointsCost: number;
  pointsCost: number;
  memberDiscountPercent: number;
  memberDiscountApplied: boolean;
  unitBasePointsCost?: number;
  unitPointsCost?: number;
  matchedRule?: any;
  priceParams: Record<string, any>;
  pricingSnapshot: any;
};
```

### 3. 修改公开档位列表

文件：

- `ai-creator-server/server/src/services/model-tier-list.service.ts`

目标：

- 读取 `pricing_mode/pricing_rules`
- 用默认参数计算默认 `basePointsCost/pointsCost`
- 返回 `pricing` 对象给小程序

返回示例：

```json
{
  "basePointsCost": 20,
  "pointsCost": 16,
  "pricing": {
    "mode": "matrix",
    "rules": [],
    "defaultParams": {},
    "memberDiscountPercent": 80,
    "memberDiscountApplied": true
  }
}
```

### 4. 修改任务路由选择

文件：

- `ai-creator-server/server/src/services/tier-router.service.ts`

目标：

- 查询 `model_tiers` 时带上 `pricing_mode/pricing_rules`
- `selectTierModel()` 根据提交参数计算真实价格
- `TierModelResult` 增加 `pricing` 或 `pricingSnapshot`

### 5. 修改任务价格快照

文件：

- `ai-creator-server/server/src/services/task.service.ts`

目标：

- `price_snapshot` 增加：
  - `pricingMode`
  - `pricingRulesVersion` 或简化为 `pricing`
  - `matchedRule`
  - `priceParams`
  - `basePointsCost`
  - `pointsCost`
  - `memberDiscountPercent`

### 6. 修改后台档位 API

文件：

- `ai-creator-server/server/src/routes/admin-tiers.ts`

目标：

- `GET /admin/model-tiers` 返回 `pricingMode/pricingRules`
- `POST /admin/model-tiers` 支持保存
- `PUT /admin/model-tiers/:id` 支持更新

### 7. 修改后台页面

文件：

- `ai-creator-server/admin-web/src/pages/FeatureConfig.tsx`

目标：

- 第一阶段增加两个字段：
  - 定价模式选择：固定价 / 参数矩阵 / 按秒矩阵 / token 预扣
  - 定价规则 JSON 文本框
- 保存时提交 `pricingMode/pricingRules`
- 暂不做可视化矩阵编辑器

### 8. 修改小程序视频页

文件：

- `uni-app/src/pages/ai-video/index.vue`

目标：

- `ModelTier` 类型增加 `pricing`
- `modelOptions` 保留 `pricing`
- 新增前端估价函数，只用于展示
- `generationCostText` 根据当前：
  - `selectedDuration`
  - `resolution/quality`
  - `selectedAudioMode`
  - `selectedModel.pricing`
  动态展示预计创作点
- 创建任务时仍不传价格，避免前端价格被信任

## API 兼容策略

现有字段不删除：

- `basePointsCost`
- `pointsCost`
- `memberDiscountPercent`
- `memberDiscountApplied`

新增字段：

- `pricing`

老版本小程序仍可用 `pointsCost` 显示默认价；新版小程序使用 `pricing` 动态展示。

## 验收步骤

### 后端接口验收

1. 运行迁移。
2. 后台配置某视频档位：

```json
{
  "mode": "matrix",
  "defaultParams": { "duration": "5s", "quality": "720P" },
  "rules": [
    { "conditions": { "duration": "5s", "quality": "720P" }, "pointsCost": 20 },
    { "conditions": { "duration": "10s", "quality": "1080P" }, "pointsCost": 60 }
  ]
}
```

3. 请求：

```bash
curl "http://localhost:3000/api/v1/public/model-tiers?feature=video_create"
```

确认：

- 返回 `pricing.mode`
- 返回默认 `basePointsCost/pointsCost`
- 登录态请求会返回会员折扣后的 `pointsCost`

4. 创建视频任务：

```json
{
  "tierKey": "video_standard",
  "duration": "10s",
  "params": {
    "duration": "10s",
    "quality": "1080P"
  }
}
```

确认：

- 接口返回 `pointsCost=60` 或会员折扣后的值
- `ai_tasks.points_cost` 一致
- `ai_tasks.price_snapshot` 记录命中规则
- `point_logs.amount` 冻结金额一致

### 小程序验收

1. 打开视频页。
2. 切换模型档位，确认默认价格正确。
3. 切换时长/清晰度/声音，确认预计消耗实时变化。
4. 单一选项仍展示但按钮锁定。
5. 创建任务后，生成按钮显示价格与接口返回 `pointsCost` 一致。

### 回归验收

1. 未配置 `pricing_rules` 的图片/视频档位仍按 `points_cost` 扣费。
2. 图片多张生成仍按原有 `imageCount` 逻辑扣费。
3. 会员折扣仍生效。
4. 失败任务退款金额等于冻结金额。

## 风险和注意点

1. 不要把小马上游人民币价格直接作为用户创作点价格。
2. 小程序展示价可能被缓存 60 秒，后台改价后需要刷新或等待缓存过期。
3. token 类模型本阶段只做预扣，不做完成后实际 token 结算。
4. 如果后台 JSON 配错，后端应退回 `points_cost`，但也应在配置检查中提示。
5. 前端估价只用于展示，后端下单必须重算。

## 开发顺序

1. 新增迁移和价格计算服务。
2. 接入 `model-tier-list.service.ts` 和 `tier-router.service.ts`。
3. 接入 `task.service.ts` 价格快照。
4. 接入 `admin-tiers.ts`。
5. 接入 `FeatureConfig.tsx` JSON 配置。
6. 接入 `ai-video/index.vue` 动态展示。
7. 更新 `API.md`、`MINI_PROGRAM_API.md`、`DEVELOPMENT.md`。
8. 运行 TypeScript/构建或至少针对改动文件做静态检查。
9. 运行 `npm run check:video-pricing`，覆盖固定价、参数矩阵、按秒矩阵、token 预扣、会员折扣和 `defaultParams` 被空参数覆盖的回归场景。
10. 运行 `npm run check:xiaoma-video-params`，覆盖小马视频素材数量、首尾帧模式、视频编辑源视频和高级参数透传。

## 本阶段完成状态

- 已新增 `model_tiers.pricing_mode/pricing_rules` 迁移和 schema 字段。
- 已新增统一价格计算服务，并接入公开档位列表、任务创建扣费、价格快照、后台档位 API、后台 JSON 配置和小程序视频页估价。
- 已修复 `defaultParams` 被 `undefined/null/空字符串` 运行时参数覆盖后导致规则匹配失败的问题。
- 已新增迁移 `20260609_005_bind_xiaoma_video_launch_tiers.sql`，把首批小马视频模型绑定到 `video_create/image_to_video/first_last_frame_video/video_edit` 可见档位，并写入平台默认动态定价。
- 已修复 SD 2.0 全能参考 `kwvideo-v2-quannengcankao` 的多参考图映射，后端会按参考生模型最多透传 9 张参考图，不再被普通首尾帧逻辑截断为 2 张。
- 已新增后台动态定价辅助编辑器，可在「功能页配置」里编辑固定价、矩阵、按秒矩阵和 token 预扣规则；token 预扣不会触发完成后自动 token 结算。
- 已新增 `server/scripts/sync-xiaoma-video-pricing.ts`，用于拉取小马视频价格快照到 `docs/xiaoma-video-pricing.snapshot.json`，不自动修改平台售价。
- 已新增小程序视频高级参数折叠区，支持可选 `seed/fps/audioUrl`；后端白名单和小马适配器会在用户填写时透传。
- 已新增 `server/scripts/check-video-pricing.ts` 和 `server/scripts/check-xiaoma-video-params.ts`，并接入 `npm run check:video-pricing`、`npm run check:xiaoma-video-params`、`npm run check:all` 和发布包脚本。
- 本地执行 `npm run db:migrate` 后，已通过服务层验收确认小马 API Key 配置环境下可见档位数量：`video_create=10`、`image_to_video=8`、`first_last_frame_video=6`、`video_edit=2`。
- 本阶段仍不做 token 完成后实际用量补扣/退款，也不做小马上游价格自动覆盖平台售价。
