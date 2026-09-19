# 免费生图额度扣减排查记录

日期：2026-08-28

## 结论

当前代码不是“生成成功后完全没有扣减逻辑”。免费额度采用两阶段账本：

1. 创建图片任务时，在事务内把本次 `imageCount` 写入 `reserved_today/reserved_total`，并写入 `free_image_quota_logs` 的 `reserve` 流水。
2. 任务成功时，根据实际生成图片数写入 `used_today/used_total`，释放未生成的预占数量，并写入 `consume/release` 流水。
3. 任务失败或取消时释放预占，不消耗免费额度。

线上公开配置（`https://mini.thtapi.com`，release `1.0.74`）当前为：每日 2 张、总计 30 张、开关开启，允许档位为 `image_standard,image_pro`。线上公开模型接口返回这两个档位的主模型均为 GPT Image 2，并标记 `freeImageQuotaModelEligible=true`。

因此，若用户确实使用非会员、标准/专业档位、一次不超过剩余额度的自动提交，正常任务应当出现 `billingSource=free_quota`，并产生 `reserve` 与最终的 `consume` 流水。

## 最可能的情况

### 1. 用户选择的图片数超过剩余免费数，然后改用积分继续

系统明确不支持“部分免费 + 部分积分”混合支付。比如每日剩余 2 张但选择生成 4 张，后端返回 `4606/FREE_QUOTA_INSUFFICIENT`；小程序弹窗中的“使用积分继续”会再次提交 `billingSource=points`。

这种任务可以正常生成图片，但不会扣免费额度，这是预期行为。

### 2. 实际任务走的是积分计费

会员、`image_top` 等不在白名单的档位、后端判定主模型不是 GPT Image 2，或者小程序在额度不足弹窗中重试积分，都会使任务的 `price_snapshot.billingSource` 为 `points`。积分任务不会写免费额度流水。

### 3. 页面显示的是旧状态

`GET /free-image-quota/me` 本身没有业务缓存，小程序会在生图页和“我的”页进入时重新拉取。不过生图提交后立即跳转结果页，页面不会在任务成功回调中主动刷新额度；如果用户没有重新进入生图页/“我的”页，或恰好命中首次查询仍在进行的请求，短时间内可能看到旧数字。

## 账号级核查 SQL

需要使用实际用户 ID 或任务 ID 在生产库执行，不能使用本地测试库代替：

```sql
-- 1. 查看任务实际计费来源
SELECT id, user_id, status, points_cost, points_refunded,
       price_snapshot, created_at, completed_at, failed_at
  FROM ai_tasks
 WHERE id = :task_id;

-- 2. 查看免费额度预占、消耗、释放流水
SELECT task_id, event_type, image_count, quota_date,
       daily_remaining_after, total_remaining_after, remark, created_at
  FROM free_image_quota_logs
 WHERE task_id = :task_id
 ORDER BY id;

-- 3. 查看账号当前汇总账本
SELECT user_id, quota_date, used_today, reserved_today,
       used_total, reserved_total, daily_limit_snapshot,
       total_limit_snapshot, updated_at
  FROM user_free_image_quotas
 WHERE user_id = :user_id;
```

判断方式：

| 查询结果 | 含义 |
| --- | --- |
| `billingSource=free_quota` + `reserve` + `consume` | 后端已正确扣减免费额度；若页面仍显示旧数，是前端刷新/显示问题 |
| `billingSource=points`，无免费流水 | 本次没有使用免费额度，需核对会员、档位、图片数和是否点击了积分重试 |
| 有 `reserve`，任务 `failed/cancelled`，有 `release` | 免费额度已释放，最终不扣减，属于预期行为 |
| 任务已 `completed`，只有 `reserve` 没有 `consume/release` | 后端结算链路异常，需要结合服务日志和任务 ID 修复 |
| 任务成功但没有任何免费流水 | 创建任务时没有进入免费额度分支，优先核对 `billingSource`、会员状态、tierKey 和主模型 |

## 相关代码位置

- 小程序提交与积分重试：`uni-app/src/pages/ai-image/index.vue` 的 `submit`。
- 免费额度状态查询：`uni-app/src/api/free-image-quota.ts`、`uni-app/src/pages/profile/index.vue`。
- 图片任务选择免费计费：`ai-creator-server/server/src/services/task.service.ts` 的 `buildImageFreeQuotaPlan`。
- 创建任务时预占：`ai-creator-server/server/src/services/free-image-quota.service.ts` 的 `reserveFreeImageQuotaForTaskTx`。
- 成功/失败/取消结算：`ai-creator-server/server/src/services/task.service.ts` 与 `free-image-quota.service.ts` 的对应 finalize/settle/release 方法。

## 本次验证

- 后端 `npm run build`：通过。
- 前端 `npm run typecheck`：通过。
- 前端免费额度工具测试：10/10 通过。
- 后端免费额度规划测试（使用 `tsx`）：11/11 通过。
- 线上 `/health`：返回 release `1.0.74`。
- 本次未修改业务源码；当前缺少用户 token/任务 ID，尚未能对具体账号的生产账本做最终归因。

## 下一步

拿到出现问题的任务 ID 后，按上面的三条 SQL 查询即可在一次核查中区分：后端实际未使用免费额度、任务失败后正确释放，还是后端已扣但小程序显示旧数据。若确认是最后一种，再补充统一的额度状态刷新；若确认只有 `reserve` 无结算流水，则修复任务结算异常并补偿受影响账号。
