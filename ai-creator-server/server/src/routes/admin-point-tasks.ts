// routes/admin-point-tasks.ts
import { Router, Request, Response } from 'express';
import { adminAuthMiddleware } from '../middleware/auth';
import { queryOne, query } from '../utils/db';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';

const router = Router();
const SUPPORTED_POINT_TASK_KEYS = new Set(['watch_ad', 'daily_checkin', 'share_work', 'invite_friend', 'open_pro', 'checkin_7']);

router.get('/point-tasks', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    const rows = await query<any>('SELECT * FROM point_tasks ORDER BY task_group, sort_order, id');
    success(res, rows.map(toPublicPointTask));
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取积分任务失败');
  }
});

router.post('/point-tasks', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const payload = normalizePointTask(req.body);
    const [r] = await query<any>(
      `INSERT INTO point_tasks
       (task_key, title, task_group, reward_points, icon, action_text, reset_cycle, status, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
      [
        payload.taskKey,
        payload.title,
        payload.group,
        payload.rewardPoints,
        payload.icon,
        payload.actionText,
        payload.resetCycle,
        payload.status,
        payload.sortOrder,
      ],
    );
    success(res, { id: (r as any).insertId });
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') { error(res, ErrorCodes.PARAM_ERROR, '任务标识已存在'); return; }
    error(res, ErrorCodes.PARAM_ERROR, err?.message || '创建积分任务失败');
  }
});

router.put('/point-tasks/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await queryOne<any>('SELECT id FROM point_tasks WHERE id = ?', [id]);
    if (!existing) { error(res, ErrorCodes.NOT_FOUND, '积分任务不存在', 404); return; }
    const payload = normalizePointTask(req.body, true);
    const sets: string[] = [];
    const vals: any[] = [];
    for (const [key, column] of Object.entries({
      taskKey: 'task_key',
      title: 'title',
      group: 'task_group',
      rewardPoints: 'reward_points',
      icon: 'icon',
      actionText: 'action_text',
      resetCycle: 'reset_cycle',
      status: 'status',
      sortOrder: 'sort_order',
    })) {
      if ((payload as any)[key] !== undefined) {
        sets.push(`${column} = ?`);
        vals.push((payload as any)[key]);
      }
    }
    if (sets.length === 0) { error(res, ErrorCodes.PARAM_ERROR, '没有可更新的字段'); return; }
    vals.push(id);
    await query(`UPDATE point_tasks SET ${sets.join(', ')}, updated_at = NOW(3) WHERE id = ?`, vals);
    success(res, { updated: true });
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') { error(res, ErrorCodes.PARAM_ERROR, '任务标识已存在'); return; }
    error(res, ErrorCodes.PARAM_ERROR, err?.message || '更新积分任务失败');
  }
});

router.put('/point-tasks/:id(\\d+)/status', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const status = normalizePointTaskStatus(req.body?.status ?? (req.body?.active === false ? 'disabled' : 'active'));
    const result = await query<any>(
      'UPDATE point_tasks SET status = ?, updated_at = NOW(3) WHERE id = ?',
      [status, parseInt(req.params.id)],
    );
    if ((result as any).affectedRows === 0) { error(res, ErrorCodes.NOT_FOUND, '积分任务不存在', 404); return; }
    success(res, { updated: true, status });
  } catch (err: any) {
    error(res, ErrorCodes.PARAM_ERROR, err?.message || '更新积分任务状态失败');
  }
});

router.delete('/point-tasks/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const used = await queryOne<any>('SELECT COUNT(*) AS cnt FROM user_point_task_logs WHERE task_id = ?', [id]);
    if (Number(used?.cnt || 0) > 0) {
      error(res, ErrorCodes.PARAM_ERROR, '任务已有领取记录，请停用而不是删除');
      return;
    }
    const result = await query<any>('DELETE FROM point_tasks WHERE id = ?', [id]);
    if ((result as any).affectedRows === 0) { error(res, ErrorCodes.NOT_FOUND, '积分任务不存在', 404); return; }
    success(res, { deleted: true });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '删除积分任务失败');
  }
});

// GET /point-packages - list all point purchase packages for admin
router.get('/point-packages', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    const rows = await query<any>('SELECT * FROM point_packages ORDER BY sort_order, id');
    success(res, rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      points: r.points,
      priceCents: r.price_cents,
      priceYuan: Number(r.price_cents || 0) / 100,
      description: r.description || '',
      firstPurchaseBonusType: normalizeFirstPurchaseBonusType(r.first_purchase_bonus_type),
      firstPurchaseBonusPoints: Number(r.first_purchase_bonus_points || 0),
      enabled: !!r.enabled,
      sortOrder: r.sort_order,
      createdAt: r.created_at,
    })));
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取积分套餐失败'); }
});

router.post('/point-packages', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const payload = normalizePointPackage(req.body);
    const [r] = await query<any>(
      `INSERT INTO point_packages
       (name, points, price_cents, description, first_purchase_bonus_type, first_purchase_bonus_points, enabled, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
      [
        payload.name,
        payload.points,
        payload.priceCents,
        payload.description,
        payload.firstPurchaseBonusType,
        payload.firstPurchaseBonusPoints,
        payload.enabled ? 1 : 0,
        payload.sortOrder,
      ],
    );
    success(res, { id: (r as any).insertId });
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') { error(res, ErrorCodes.PARAM_ERROR, '套餐名称已存在'); return; }
    error(res, ErrorCodes.PARAM_ERROR, err?.message || '创建积分套餐失败');
  }
});

router.put('/point-packages/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await queryOne<any>('SELECT id FROM point_packages WHERE id = ?', [id]);
    if (!existing) { error(res, ErrorCodes.NOT_FOUND, '积分套餐不存在', 404); return; }
    const payload = normalizePointPackage(req.body, true);
    const sets: string[] = [];
    const vals: any[] = [];
    for (const [key, column] of Object.entries({
      name: 'name',
      points: 'points',
      priceCents: 'price_cents',
      description: 'description',
      firstPurchaseBonusType: 'first_purchase_bonus_type',
      firstPurchaseBonusPoints: 'first_purchase_bonus_points',
      enabled: 'enabled',
      sortOrder: 'sort_order',
    })) {
      if ((payload as any)[key] !== undefined) {
        sets.push(`${column} = ?`);
        vals.push(key === 'enabled' ? ((payload as any)[key] ? 1 : 0) : (payload as any)[key]);
      }
    }
    if (sets.length === 0) { error(res, ErrorCodes.PARAM_ERROR, '没有可更新的字段'); return; }
    vals.push(id);
    await query(`UPDATE point_packages SET ${sets.join(', ')}, updated_at = NOW(3) WHERE id = ?`, vals);
    success(res, { updated: true });
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') { error(res, ErrorCodes.PARAM_ERROR, '套餐名称已存在'); return; }
    error(res, ErrorCodes.PARAM_ERROR, err?.message || '更新积分套餐失败');
  }
});

router.put('/point-packages/:id(\\d+)/status', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const enabled = !!req.body?.enabled;
    await query('UPDATE point_packages SET enabled = ?, updated_at = NOW(3) WHERE id = ?', [enabled ? 1 : 0, parseInt(req.params.id)]);
    success(res, { updated: true, enabled });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '更新积分套餐状态失败'); }
});

router.delete('/point-packages/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await query<any>('DELETE FROM point_packages WHERE id = ?', [parseInt(req.params.id)]);
    if ((result as any).affectedRows === 0) { error(res, ErrorCodes.NOT_FOUND, '积分套餐不存在', 404); return; }
    success(res, { deleted: true });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '删除积分套餐失败'); }
});

export default router;

function toPublicPointTask(r: any) {
  return {
    id: r.id,
    taskKey: r.task_key,
    title: r.title,
    group: r.task_group,
    taskGroup: r.task_group,
    rewardPoints: Number(r.reward_points || 0),
    icon: r.icon || '',
    actionText: r.action_text || '去完成',
    resetCycle: r.reset_cycle || 'daily',
    status: r.status || 'active',
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function normalizePointTask(body: any, partial = false) {
  const out: Record<string, any> = {};
  if (!partial || body.taskKey !== undefined || body.task_key !== undefined) {
    const taskKey = String(body.taskKey ?? body.task_key ?? '').trim();
    if (!taskKey) throw new Error('请输入任务标识');
    if (!/^[a-z][a-z0-9_]{1,31}$/.test(taskKey)) throw new Error('任务标识需为 2-32 位小写字母、数字或下划线，并以字母开头');
    if (!SUPPORTED_POINT_TASK_KEYS.has(taskKey)) throw new Error('任务标识暂只支持已接入的小程序入口');
    out.taskKey = taskKey;
  }
  if (!partial || body.title !== undefined) {
    const title = String(body.title || '').trim();
    if (!title) throw new Error('请输入任务名称');
    if (Array.from(title).length > 64) throw new Error('任务名称最多 64 个字符');
    out.title = title;
  }
  if (!partial || body.group !== undefined || body.taskGroup !== undefined || body.task_group !== undefined) {
    out.group = normalizeTaskGroup(body.group ?? body.taskGroup ?? body.task_group);
  }
  if (!partial || body.rewardPoints !== undefined || body.reward_points !== undefined || body.reward !== undefined) {
    const rewardPoints = Number(body.rewardPoints ?? body.reward_points ?? body.reward);
    if (!Number.isInteger(rewardPoints) || rewardPoints < 0) throw new Error('奖励积分必须是非负整数');
    out.rewardPoints = rewardPoints;
  }
  if (!partial || body.icon !== undefined) {
    const icon = String(body.icon || '').trim();
    if (icon.length > 32) throw new Error('图标标识最多 32 个字符');
    out.icon = icon;
  }
  if (!partial || body.actionText !== undefined || body.action_text !== undefined) {
    const actionText = String(body.actionText ?? body.action_text ?? '去完成').trim();
    if (!actionText) throw new Error('请输入按钮文案');
    if (Array.from(actionText).length > 16) throw new Error('按钮文案最多 16 个字符');
    out.actionText = actionText;
  }
  if (!partial || body.resetCycle !== undefined || body.reset_cycle !== undefined) {
    out.resetCycle = normalizeResetCycle(body.resetCycle ?? body.reset_cycle);
  }
  if (!partial || body.status !== undefined) out.status = normalizePointTaskStatus(body.status);
  if (!partial || body.sortOrder !== undefined || body.sort_order !== undefined) {
    const sortOrder = Number(body.sortOrder ?? body.sort_order ?? 0);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) throw new Error('排序必须是非负整数');
    out.sortOrder = sortOrder;
  }
  return out;
}

function normalizeTaskGroup(value: unknown) {
  const group = String(value || 'daily').trim();
  if (group !== 'daily' && group !== 'growth') throw new Error('任务分组只能是 daily 或 growth');
  return group;
}

function normalizeResetCycle(value: unknown) {
  const resetCycle = String(value || 'daily').trim();
  if (resetCycle !== 'daily' && resetCycle !== 'once') throw new Error('重置周期只能是 daily 或 once');
  return resetCycle;
}

function normalizePointTaskStatus(value: unknown) {
  const status = String(value || 'active').trim();
  if (status !== 'active' && status !== 'disabled') throw new Error('任务状态只能是 active 或 disabled');
  return status;
}

function normalizePointPackage(body: any, partial = false) {
  const out: Record<string, any> = {};
  if (!partial || body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name) throw new Error('请输入套餐名称');
    if (name.length > 64) throw new Error('套餐名称最多 64 个字符');
    out.name = name;
  }
  if (!partial || body.points !== undefined) {
    const points = Number(body.points);
    if (!Number.isInteger(points) || points <= 0) throw new Error('积分数量必须是正整数');
    out.points = points;
  }
  if (!partial || body.priceCents !== undefined || body.priceYuan !== undefined || body.price !== undefined) {
    const raw = body.priceCents !== undefined ? Number(body.priceCents) : Math.round(Number(body.priceYuan ?? body.price) * 100);
    if (!Number.isInteger(raw) || raw < 0) throw new Error('售价必须是有效金额');
    out.priceCents = raw;
  }
  if (!partial || body.description !== undefined) {
    const description = String(body.description || '').trim();
    if (Array.from(description).length > 10) throw new Error('套餐描述最多 10 个字');
    out.description = description;
  }
  const bonusTypeInput = body.firstPurchaseBonusType ?? body.first_purchase_bonus_type;
  const bonusPointsInput = body.firstPurchaseBonusPoints ?? body.first_purchase_bonus_points;
  if (!partial || bonusTypeInput !== undefined || bonusPointsInput !== undefined) {
    const bonusType = normalizeFirstPurchaseBonusType(bonusTypeInput);
    const bonusPoints = Number(bonusPointsInput || 0);
    if (!Number.isInteger(bonusPoints) || bonusPoints < 0) throw new Error('首充赠送积分必须是非负整数');
    out.firstPurchaseBonusType = bonusType;
    out.firstPurchaseBonusPoints = bonusType === 'fixed' ? bonusPoints : 0;
  }
  if (!partial || body.enabled !== undefined) out.enabled = body.enabled !== false;
  if (!partial || body.sortOrder !== undefined) out.sortOrder = Number(body.sortOrder || 0);
  return out;
}

function normalizeFirstPurchaseBonusType(value: unknown) {
  const type = String(value || '').trim();
  return type === 'double' || type === 'fixed' ? type : 'none';
}
