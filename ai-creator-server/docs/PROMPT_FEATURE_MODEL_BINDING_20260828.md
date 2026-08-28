# 提示词功能模型绑定与系统提示词配置说明

## 本次目标

提示词优化和反推提示词都统一使用现有的功能档位模型体系，支持后台绑定模型、切换主模型，并允许请求通过 `tierKey` 或 `tierId` 指定已绑定的功能档位。

提示词优化的系统提示词继续使用 `system_prompts` 表，不新增配置表。内置深度补全规则会和启用的自定义提示词合并后注入文本模型。

## 后台操作路径

### 1. 配置提示词优化模型

入口一：

`系统设置 → AI 文本能力 → 配置提示词优化模型`

入口二：

`AI 模型管理 → 功能页配置 → 提示词优化`

在提示词优化功能下选择或新增一个档位，点击「配置绑定」，选择：

- 主模型：当前默认调用的模型
- 备用模型：该档位的其他可用模型配置

保存绑定后，新的提示词优化请求会从功能档位绑定中解析模型。旧配置项 `ai.prompt_optimize.model_id` 仍保留，但只在没有可用档位绑定时作为兼容兜底。

### 2. 设置提示词优化系统提示词

入口一：

`系统设置 → AI 文本能力 → 编辑提示词优化系统提示词`

入口二：

`AI 模型管理 → 功能页配置 → 提示词优化` 页面顶部的「编辑系统提示词」

入口三：

`内容合规 → 系统提示词`

进入后点击「新增优化规则」，或编辑已有记录。需要确认：

- 功能选择「智能优化」
- 数据库存储的目标功能为 `prompt_optimize`
- 状态为启用
- 内容填写业务规则、输出格式、风格约束或禁止事项

生效组合为：

```text
系统内置提示词优化规则

启用的 targetFeature=prompt_optimize 自定义系统提示词
```

保存后会清理对应系统提示词缓存。

### 3. 配置反推提示词模型

入口：

`微信配置 → 工具页配置 → 工具模型绑定`

下方切换到「工具-反推提示词」，在对应档位点击「配置绑定」，选择主模型和备用模型。模型必须满足 `tool_prompt_reverse` 能力，并且供应商 Base URL、API Key 和模型调用 code 均可用。

## 接口约定

### 提示词优化

`POST /api/v1/tasks/optimize-prompt`

可选模型选择字段：

```json
{
  "prompt": "赛博朋克女孩",
  "tierKey": "prompt_optimize_standard"
}
```

`tierId` 与 `tierKey` 二选一即可。服务端会校验档位属于 `prompt_optimize` 功能，且档位、绑定模型、供应商均为启用状态，并检查文本能力。客户端不能传真实 `modelId` 作为模型选择。

### 反推提示词

`POST /api/v1/tools/process`

可选模型选择字段：

```json
{
  "toolKey": "prompt_reverse",
  "fileIds": [123],
  "params": { "scene": "产品海报" },
  "tierKey": "tool_prompt_reverse_standard"
}
```

未绑定可用模型或模型调用失败时，接口返回明确错误；如果本次使用了积分，服务端会退款，不再返回固定格式的本地伪提示词。

## 修改文件

- `server/src/services/ai-feature.service.ts`：提示词优化优先解析功能档位绑定，支持请求级 `tierKey/tierId`，保留旧模型 ID 兼容兜底，并按档位区分缓存。
- `server/src/services/tools.service.ts`：反推提示词支持功能档位选择和能力校验，去除失败时的伪提示词 fallback。
- `server/src/routes/tasks.ts`、`server/src/routes/tools.ts`：接收并校验 `tierKey/tierId`。
- `server/src/routes/admin-tiers.ts`：切换档位主模型或修改档位状态后清理文本模型缓存。
- `admin-web/src/pages/settings/index.tsx`：增加提示词优化模型配置和系统提示词编辑入口。
- `admin-web/src/pages/FeatureConfig.tsx`：提示词优化功能页增加系统提示词直达入口。
- `admin-web/src/pages/ContentManagement.tsx`：系统提示词页面增加提示词优化说明、筛选和快速新增入口。
- `admin-web/src/pages/WechatToolsSettings.tsx`：明确反推提示词模型绑定和切换位置。
- `uni-app/src/api/tools.ts`：补充工具接口返回的模型绑定字段和请求级档位字段类型。
- `docs/API.md`、`docs/MINI_PROGRAM_API.md`：同步后台路径、接口字段和失败行为。

## 验证结果

- `server`: `npm run build` 通过。
- `admin-web`: `npm run build` 通过。
- 后端定向测试：9 项通过。
- 管理端提示词入口测试：2 项通过。
- `git diff --check` 通过。
- server/admin 全量 lint 均无 error；现有 warning 未涉及本次新增逻辑。

## 当前边界

本次代码已完成真实绑定解析、档位切换、权限/状态/能力校验和管理端入口，但未使用或写入任何供应商 API Key，也未进行生产供应商 API 的真实联调。部署后需要在后台完成供应商配置、模型同步、功能档位绑定，再用真实图片/提示词验证上游接口。

当前同步文本调用支持手动切换主模型和按请求指定档位；供应商请求失败后的自动重试/自动切换备用模型，仍应沿用后续专门的文本 failover 设计，不应把本次的手动绑定切换误认为请求失败自动故障转移。
