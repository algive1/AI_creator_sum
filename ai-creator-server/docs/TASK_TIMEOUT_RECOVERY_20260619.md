# 生成任务超时误判修复

## 范围

本次只处理图片/视频异步生成“本地超时失败并退款，但供应商实际成功”的问题，不处理小程序导航页。

## 运行策略

- 图片默认轮询窗口为 `IMAGE_TASK_MAX_RUNNING_MINUTES=20`，默认轮询次数为 `IMAGE_TASK_MAX_POLL_COUNT=240`。
- 视频默认轮询窗口为 `VIDEO_TASK_MAX_RUNNING_MINUTES=30`，默认轮询次数为 `VIDEO_TASK_MAX_POLL_COUNT=240`。
- 模型配置 `max_polling_minutes` 优先于环境默认值，不再被环境默认值截断。
- 到达本地超时或轮询次数上限时，服务会先向供应商做最后一次状态查询；供应商已完成则保存结果并结算，供应商仍处理中才失败退款，供应商明确失败则失败退款。
- 供应商查询接口网络异常、临时不可用或熔断时，任务保持处理中，等待下次轮询或人工修复。
- `GET /api/v1/tasks?ids=...` 会对已到期或已超时的处理中图片/视频任务触发一次补轮询，再返回任务数据。

## 历史补偿脚本

先预览：

```bash
cd server
npm run repair:timed-out-provider-tasks -- --dry-run --limit 50
```

确认后执行：

```bash
cd server
npm run repair:timed-out-provider-tasks -- --apply --limit 50
```

脚本只扫描：

- `ai_tasks.status='failed'`
- 存在 `provider_task_id`
- `fail_reason` 或 `provider_status_message` 命中 timeout / timed out / polling count exceeded / 超时
- `task_type` 为 `image` 或 `video`

## 积分结算

- 补查成功后，任务改为 `completed`，补保存输出，写入 `timeout_recovered` 任务日志。
- 图片按实际成功张数扣费，未生成张数保留退款；完整成功时 `points_refunded=0`。
- 如果失败时已全额退款，修复成功会从当前余额补扣实际费用；余额不足允许负数，并同步 `user_assets.points_balance`。
- 幂等依赖 `point_logs` 唯一键 `(source, ref_type, ref_id)`，纠正流水使用 `source=task_recovery`、`ref_type=ai_task_timeout_recovery_charge`，重复执行不会重复扣积分。

## 上线检查

1. 更新生产 `.env` 中的图片/视频轮询窗口和轮询次数。
2. 重启后端进程，确认后台任务轮询正常启动。
3. 先执行 dry-run，抽查输出中的任务 ID、供应商状态、实际输出数量和预计扣费。
4. 再执行 apply，抽查任务状态、`ai_task_outputs`、`point_logs`、`point_accounts` 和 `user_assets`。
