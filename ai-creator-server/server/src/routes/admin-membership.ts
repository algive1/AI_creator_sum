// routes/admin-membership.ts
import { Router, Request, Response } from 'express';
import { adminAuthMiddleware } from '../middleware/auth';
import { queryOne, query, getConnection } from '../utils/db';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import { getPlanFeatureDiscounts, normalizeDiscountPercent, replacePlanFeatureDiscounts } from '../services/membership.service';
import {
  createLinkedMemberBenefitIcon,
  listMemberBenefitIcons,
  normalizePublicIconUrl,
} from '../services/member-benefit-icons.service';

const router = Router();
const POINTS_EXPIRE_TYPE_DISABLED = 'none';

// GET /membership/benefit-icons - list icon library
router.get('/membership/benefit-icons', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    success(res, { list: await listMemberBenefitIcons() });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取权益图标库失败');
  }
});

// POST /membership/benefit-icons - add linked/uploaded icon into library
router.post('/membership/benefit-icons', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const name = String(req.body?.name || '').trim();
    const iconUrl = String(req.body?.iconUrl || '').trim();
    const iconFileId = Number(req.body?.iconFileId || 0) || null;
    const source = req.body?.source === 'upload' ? 'upload' : 'link';
    if (!name || !iconUrl) {
      error(res, ErrorCodes.PARAM_ERROR, '缺少图标名称或链接');
      return;
    }
    const id = await createLinkedMemberBenefitIcon({ name, iconUrl, iconFileId, source });
    success(res, { id });
  } catch (e: any) {
    error(res, ErrorCodes.SERVER_ERROR, '保存权益图标失败: ' + (e?.message || ''));
  }
});

// GET /membership/versions - list all membership versions
router.get('/membership/versions', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    const rows = await query<any>('SELECT * FROM member_versions ORDER BY sort_order, id');
    success(res, rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      versionKey: r.version_key,
      description: r.description || '',
      sortOrder: r.sort_order,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })));
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取会员版本失败');
  }
});

// POST /membership/versions - create a membership version
router.post('/membership/versions', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, versionKey, description, sortOrder, status } = req.body;
    if (!name || !versionKey) {
      error(res, ErrorCodes.PARAM_ERROR, '缺少版本名称或版本 Key');
      return;
    }
    const [result] = await query<any>(
      'INSERT INTO member_versions (name, version_key, description, sort_order, status) VALUES (?, ?, ?, ?, ?)',
      [name, versionKey, description || '', sortOrder || 0, status || 'active'],
    );
    success(res, { id: (result as any).insertId });
  } catch (e: any) {
    error(res, ErrorCodes.SERVER_ERROR, '创建会员版本失败: ' + (e.message || ''));
  }
});

// PUT /membership/versions/:id - update a membership version
router.put('/membership/versions/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { name, versionKey, description, sortOrder, status } = req.body;
    const sets: string[] = [];
    const vals: any[] = [];
    if (name !== undefined) { sets.push('name = ?'); vals.push(name); }
    if (versionKey !== undefined) { sets.push('version_key = ?'); vals.push(versionKey); }
    if (description !== undefined) { sets.push('description = ?'); vals.push(description); }
    if (sortOrder !== undefined) { sets.push('sort_order = ?'); vals.push(sortOrder); }
    if (status !== undefined) { sets.push('status = ?'); vals.push(status); }
    if (!sets.length) {
      error(res, ErrorCodes.PARAM_ERROR, '没有可更新的字段');
      return;
    }
    vals.push(id);
    await query('UPDATE member_versions SET ' + sets.join(', ') + ' WHERE id = ?', vals);
    success(res, { updated: true });
  } catch (e: any) {
    error(res, ErrorCodes.SERVER_ERROR, '更新会员版本失败: ' + (e.message || ''));
  }
});

// GET /membership/versions/:id/rights - get version rights template
router.get('/membership/versions/:id(\\d+)/rights', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const rows = await query<any>(
      'SELECT id, right_key, right_name, right_value, hint, right_category, icon_url, icon_file_id, sort_order FROM member_version_rights WHERE version_id = ? ORDER BY sort_order',
      [parseInt(req.params.id)],
    );
    success(res, rows.map((r: any) => ({
      id: r.id,
      rightKey: r.right_key,
      rightName: r.right_name,
      rightValue: r.right_value,
      hint: r.hint || '',
      rightCategory: r.right_category,
      iconUrl: r.icon_url || '',
      iconFileId: r.icon_file_id ? Number(r.icon_file_id) : null,
      sortOrder: r.sort_order,
    })));
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取版本权益模板失败'); }
});

// PUT /membership/versions/:id/rights - replace version rights template
router.put('/membership/versions/:id(\\d+)/rights', adminAuthMiddleware, async (req: Request, res: Response) => {
  const versionId = parseInt(req.params.id);
  const { rights } = req.body;
  if (!Array.isArray(rights)) { error(res, ErrorCodes.PARAM_ERROR, 'rights 必须是数组'); return; }
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM member_version_rights WHERE version_id = ?', [versionId]);
    for (const rt of rights) {
      await conn.execute(
        `INSERT INTO member_version_rights (version_id, right_key, right_name, right_value, hint, right_category, icon_url, icon_file_id, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [versionId, rt.rightKey, rt.rightName, rt.rightValue || '', rt.hint || '', rt.rightCategory || 'general', rt.iconUrl || '', rt.iconFileId || null, rt.sortOrder || 0],
      );
    }
    // Sync: add any missing rights to all plans in this version
    const plans = await conn.execute('SELECT id FROM member_plans WHERE version_id = ?', [versionId]);
    for (const plan of (plans as any)[0]) {
      for (const rt of rights) {
        await conn.execute(
          `INSERT IGNORE INTO member_plan_rights (plan_id, right_key, right_name, right_value, right_category, icon_url, icon_file_id, sort_order, enabled)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [plan.id, rt.rightKey, rt.rightName, rt.rightValue || '', rt.rightCategory || 'general', rt.iconUrl || '', rt.iconFileId || null, rt.sortOrder || 0],
        );
      }
    }
    await conn.commit();
    success(res, { updated: true, count: rights.length });
  } catch (e: any) {
    await conn.rollback();
    error(res, ErrorCodes.SERVER_ERROR, '更新版本权益模板失败: ' + (e.message || ''));
  } finally {
    conn.release();
  }
});

// GET /membership/versions/:id/rights-with-plans — version rights template + all plan overrides
router.get('/membership/versions/:id(\\d+)/rights-with-plans', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const versionId = parseInt(req.params.id);
    const rights = await query<any>(
      `SELECT id, right_key, right_name, right_value, hint, right_category, icon_url, icon_file_id, sort_order
         FROM member_version_rights WHERE version_id = ? ORDER BY sort_order`,
      [versionId],
    );
    const plans = await query<any>(
      `SELECT id, name, plan_key, duration_type, duration_days, sort_order
         FROM member_plans WHERE version_id = ? AND status = 'active' ORDER BY sort_order`,
      [versionId],
    );
    // Load per-plan overrides for all rights
    const planRights = await query<any>(
      `SELECT plan_id, right_key, right_value, enabled, sort_order
         FROM member_plan_rights WHERE plan_id IN (SELECT id FROM member_plans WHERE version_id = ?)`,
      [versionId],
    );
    // Index overrides by plan_id:right_key
    const overrideMap: Record<string, any> = {};
    for (const pr of planRights) {
      overrideMap[`${pr.plan_id}:${pr.right_key}`] = pr;
    }
    success(res, {
      rights: rights.map((r: any) => ({
        id: r.id,
        rightKey: r.right_key,
        rightName: r.right_name,
        rightValue: r.right_value,
        hint: r.hint || '',
        rightCategory: r.right_category,
        iconUrl: r.icon_url || '',
        iconFileId: r.icon_file_id ? Number(r.icon_file_id) : null,
        sortOrder: r.sort_order,
      })),
      plans: plans.map((p: any) => ({
        id: p.id,
        name: p.name,
        planKey: p.plan_key,
        durationType: p.duration_type,
        durationDays: p.duration_days,
        sortOrder: p.sort_order,
      })),
      overrides: planRights.map((pr: any) => ({
        planId: pr.plan_id,
        rightKey: pr.right_key,
        rightValue: pr.right_value,
        enabled: pr.enabled === 1,
      })),
    });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取版本权益配置失败'); }
});

// PUT /membership/plans/batch-rights — batch save plan right overrides (one right across multiple plans)
router.put('/membership/plans/batch-rights', adminAuthMiddleware, async (req: Request, res: Response) => {
  const { planOverrides } = req.body;
  if (!Array.isArray(planOverrides)) { error(res, ErrorCodes.PARAM_ERROR, 'planOverrides 必须是数组'); return; }
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    for (const item of planOverrides) {
      if (!item.rightKey) continue;
      for (const po of (item.plans || [])) {
        await conn.execute(
          `INSERT INTO member_plan_rights (plan_id, right_key, right_name, right_value, right_category, icon_url, icon_file_id, sort_order, enabled)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE right_value = VALUES(right_value), enabled = VALUES(enabled), sort_order = VALUES(sort_order)`,
          [po.planId, item.rightKey, item.rightName || item.rightKey, po.rightValue || item.rightValue || '', item.rightCategory || 'general', item.iconUrl || '', item.iconFileId || null, item.sortOrder || 0, po.enabled !== false ? 1 : 0],
        );
      }
    }
    await conn.commit();
    success(res, { updated: true, count: planOverrides.length });
  } catch (e: any) {
    await conn.rollback();
    error(res, ErrorCodes.SERVER_ERROR, '批量更新权益失败: ' + (e.message || ''));
  } finally {
    conn.release();
  }
});

// GET /membership/plans - list all plans with version name
router.get('/membership/plans', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    const rows = await query<any>(
      `SELECT p.*, v.name as version_name, v.version_key
       FROM member_plans p
       JOIN member_versions v ON v.id = p.version_id
       ORDER BY v.sort_order, p.sort_order`
    );
    success(res, rows.map((r: any) => ({
      id: r.id,
      versionId: r.version_id,
      versionName: r.version_name,
      versionKey: r.version_key,
      name: r.name,
      planKey: r.plan_key,
      durationType: r.duration_type,
      durationDays: r.duration_days,
      price: r.price,
      originalPrice: r.original_price,
      tag: r.tag || '',
      description: r.description || '',
      highlightFeatures: typeof r.highlight_features === 'string' ? JSON.parse(r.highlight_features) : r.highlight_features,
      sortOrder: r.sort_order,
      status: r.status,
      createdAt: r.created_at,
    })));
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取会员套餐失败'); }
});

// GET /membership/plans/:id - plan detail with merged version rights
router.get('/membership/plans/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const plan = await queryOne<any>('SELECT * FROM member_plans WHERE id = ?', [id]);
    if (!plan) { error(res, ErrorCodes.NOT_FOUND, '会员套餐不存在', 404); return; }

    // Merge version rights template with plan-level overrides
    const merged = await query<any>(
      `SELECT vr.right_key, vr.right_name, vr.right_value AS default_value, vr.hint, vr.right_category,
              COALESCE(pr.right_value, vr.right_value) AS right_value,
              COALESCE(pr.icon_url, vr.icon_url) AS icon_url,
              COALESCE(pr.icon_file_id, vr.icon_file_id) AS icon_file_id,
              COALESCE(pr.sort_order, vr.sort_order) AS sort_order,
              COALESCE(pr.enabled, 1) AS enabled,
              pr.id AS plan_right_id
         FROM member_version_rights vr
         LEFT JOIN member_plan_rights pr ON pr.plan_id = ? AND pr.right_key COLLATE utf8mb4_unicode_ci = vr.right_key COLLATE utf8mb4_unicode_ci
        WHERE vr.version_id = ?
        ORDER BY sort_order`,
      [id, plan.version_id],
    );
    const pointRule = await queryOne<any>('SELECT * FROM member_plan_point_rules WHERE plan_id = ?', [id]);
    const featureDiscounts = await getPlanFeatureDiscounts(id);
    success(res, {
      id: plan.id,
      versionId: plan.version_id,
      name: plan.name,
      planKey: plan.plan_key,
      durationType: plan.duration_type,
      durationDays: plan.duration_days,
      price: plan.price,
      originalPrice: plan.original_price,
      tag: plan.tag || '',
      description: plan.description || '',
      highlightFeatures: typeof plan.highlight_features === 'string' ? JSON.parse(plan.highlight_features) : plan.highlight_features,
      sortOrder: plan.sort_order,
      status: plan.status,
      rights: await Promise.all(merged.map(async (r: any) => ({
        rightKey: r.right_key,
        rightName: r.right_name,
        rightValue: r.right_value,
        defaultRightValue: r.default_value || '',
        hint: r.hint || '',
        rightCategory: r.right_category,
        iconUrl: await normalizePublicIconUrl(r.icon_url || ''),
        iconFileId: r.icon_file_id ? Number(r.icon_file_id) : null,
        sortOrder: r.sort_order,
        enabled: r.enabled === 1,
      }))),
      pointRule: pointRule ? {
        id: pointRule.id,
        totalPoints: pointRule.total_points,
        immediatePoints: pointRule.immediate_points,
        monthlyPoints: pointRule.monthly_points,
        giftPoints: pointRule.gift_points,
        grantMode: pointRule.grant_mode,
        pointsExpireType: POINTS_EXPIRE_TYPE_DISABLED,
        pointsExpireDays: null,
        pointsExpireEnabled: false,
        pointsDiscountRate: pointRule.points_discount_rate,
      } : null,
      featureDiscounts,
    });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取会员套餐失败'); }
});

// POST /membership/plans - create plan with rights and point rules
router.post('/membership/plans', adminAuthMiddleware, async (req: Request, res: Response) => {
  const conn = await getConnection();
  try {
    const { versionId, name, planKey, durationType, durationDays, price, originalPrice, tag, description, sortOrder, status, rights, pointRule, featureDiscounts } = req.body;
    if (!versionId || !name || !planKey || !durationType || !durationDays || !price) {
      error(res, ErrorCodes.PARAM_ERROR, '缺少套餐必要参数'); return;
    }
    await conn.beginTransaction();
    const [r] = await conn.execute(
      'INSERT INTO member_plans (version_id, name, plan_key, duration_type, duration_days, price, original_price, tag, description, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [versionId, name, planKey, durationType, durationDays, price, originalPrice || price, tag || '', description || '', sortOrder || 0, status || 'active']
    );
    const planId = (r as any).insertId;

    if (rights && Array.isArray(rights)) {
      for (const rt of rights) {
        await conn.execute(
          `INSERT INTO member_plan_rights
           (plan_id, right_key, right_name, right_value, right_category, icon_url, icon_file_id, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [planId, rt.rightKey, rt.rightName, rt.rightValue, rt.rightCategory || 'general', rt.iconUrl || '', rt.iconFileId || null, rt.sortOrder || 0],
        );
      }
    }
    if (pointRule) {
      await conn.execute(
        'INSERT INTO member_plan_point_rules (plan_id, total_points, immediate_points, monthly_points, gift_points, grant_mode, points_expire_type, points_discount_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [planId, pointRule.totalPoints || 0, pointRule.immediatePoints || 0, pointRule.monthlyPoints || 0, pointRule.giftPoints || 0, pointRule.grantMode || 'immediate', POINTS_EXPIRE_TYPE_DISABLED, pointRule.pointsDiscountRate || 1]
      );
    }
    if (Array.isArray(featureDiscounts)) {
      await replacePlanFeatureDiscounts(conn, planId, featureDiscounts);
    }
    await conn.commit();
    success(res, { id: planId });
  } catch (e: any) {
    await conn.rollback();
    error(res, ErrorCodes.SERVER_ERROR, '创建会员套餐失败: ' + (e.message || ''));
  } finally {
    conn.release();
  }
});

// PUT /membership/plans/:id - update basic plan info
router.put('/membership/plans/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { name, versionId, durationType, durationDays, price, originalPrice, tag, description, sortOrder, status } = req.body;
    const sets: string[] = []; const vals: any[] = [];
    if (name !== undefined) { sets.push('name = ?'); vals.push(name); }
    if (versionId !== undefined) { sets.push('version_id = ?'); vals.push(versionId); }
    if (durationType) { sets.push('duration_type = ?'); vals.push(durationType); }
    if (durationDays !== undefined) { sets.push('duration_days = ?'); vals.push(durationDays); }
    if (price !== undefined) { sets.push('price = ?'); vals.push(price); }
    if (originalPrice !== undefined) { sets.push('original_price = ?'); vals.push(originalPrice); }
    if (tag !== undefined) { sets.push('tag = ?'); vals.push(tag); }
    if (description !== undefined) { sets.push('description = ?'); vals.push(description); }
    if (sortOrder !== undefined) { sets.push('sort_order = ?'); vals.push(sortOrder); }
    if (status) { sets.push('status = ?'); vals.push(status); }
    if (sets.length === 0) { error(res, ErrorCodes.PARAM_ERROR, '没有可更新的字段'); return; }
    vals.push(id);
    await query('UPDATE member_plans SET ' + sets.join(', ') + ' WHERE id = ?', vals);
    success(res, { updated: true });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '更新会员套餐失败'); }
});

// PUT /membership/plans/:id/rights - save per-plan right overrides (enabled + override value)
router.put('/membership/plans/:id(\\d+)/rights', adminAuthMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { rights } = req.body;
  if (!Array.isArray(rights)) { error(res, ErrorCodes.PARAM_ERROR, 'rights 必须是数组'); return; }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    for (const rt of rights) {
      if (!rt.rightKey) continue;
      await conn.execute(
        `INSERT INTO member_plan_rights (plan_id, right_key, right_name, right_value, right_category, icon_url, icon_file_id, sort_order, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           right_value = VALUES(right_value),
           enabled = VALUES(enabled),
           sort_order = VALUES(sort_order)`,
        [
          id,
          rt.rightKey,
          rt.rightName || rt.rightKey,
          rt.rightValue || '',
          rt.rightCategory || 'general',
          rt.iconUrl || '',
          rt.iconFileId || null,
          rt.sortOrder || 0,
          rt.enabled !== false ? 1 : 0,
        ],
      );
    }
    await conn.commit();
    success(res, { updated: true, count: rights.length });
  } catch (e: any) {
    await conn.rollback();
    error(res, ErrorCodes.SERVER_ERROR, '更新会员权益失败: ' + (e.message || ''));
  } finally {
    conn.release();
  }
});

// PUT /membership/plans/:id/points - update point rules
router.put('/membership/plans/:id(\\d+)/points', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { totalPoints, immediatePoints, monthlyPoints, giftPoints, grantMode, pointsDiscountRate } = req.body;
    const existing = await queryOne<any>('SELECT id, points_discount_rate FROM member_plan_point_rules WHERE plan_id = ?', [id]);
    const nextDiscountRate = pointsDiscountRate === undefined
      ? Number(existing?.points_discount_rate ?? 1)
      : Number(pointsDiscountRate);
    if (existing) {
      await query(
        'UPDATE member_plan_point_rules SET total_points=?, immediate_points=?, monthly_points=?, gift_points=?, grant_mode=?, points_expire_type=?, points_discount_rate=? WHERE plan_id=?',
        [totalPoints ?? 0, immediatePoints ?? 0, monthlyPoints ?? 0, giftPoints ?? 0, grantMode || 'immediate', POINTS_EXPIRE_TYPE_DISABLED, nextDiscountRate, id]
      );
    } else {
      await query(
        'INSERT INTO member_plan_point_rules (plan_id, total_points, immediate_points, monthly_points, gift_points, grant_mode, points_expire_type, points_discount_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, totalPoints || 0, immediatePoints || 0, monthlyPoints || 0, giftPoints || 0, grantMode || 'immediate', POINTS_EXPIRE_TYPE_DISABLED, nextDiscountRate]
      );
    }
    success(res, { updated: true });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '更新会员积分规则失败'); }
});

// PUT /membership/plans/:id/feature-discounts - replace feature discounts for a plan
router.put('/membership/plans/:id(\\d+)/feature-discounts', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { featureDiscounts } = req.body;
    if (!Array.isArray(featureDiscounts)) {
      error(res, ErrorCodes.PARAM_ERROR, 'featureDiscounts 必须是数组');
      return;
    }
    await replacePlanFeatureDiscounts(id, featureDiscounts.map((item: any) => ({
      featureKey: item.featureKey || item.feature_key,
      discountPercent: normalizeDiscountPercent(item.discountPercent ?? item.discount_percent),
    })));
    success(res, { updated: true, count: featureDiscounts.length });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '更新会员功能折扣失败');
  }
});

export default router;
