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

// GET /membership/plans/:id - plan detail with rights + point rules
router.get('/membership/plans/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const plan = await queryOne<any>('SELECT * FROM member_plans WHERE id = ?', [id]);
    if (!plan) { error(res, ErrorCodes.NOT_FOUND, '会员套餐不存在', 404); return; }
    const rights = await query<any>('SELECT * FROM member_plan_rights WHERE plan_id = ? ORDER BY sort_order', [id]);
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
      rights: await Promise.all(rights.map(async (r: any) => ({
        id: r.id,
        rightKey: r.right_key,
        rightName: r.right_name,
        rightValue: r.right_value,
        rightCategory: r.right_category,
        iconUrl: await normalizePublicIconUrl(r.icon_url || ''),
        iconFileId: r.icon_file_id ? Number(r.icon_file_id) : null,
        sortOrder: r.sort_order,
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
    const { name, durationType, durationDays, price, originalPrice, tag, description, sortOrder, status } = req.body;
    const sets: string[] = []; const vals: any[] = [];
    if (name !== undefined) { sets.push('name = ?'); vals.push(name); }
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

// PUT /membership/plans/:id/rights - replace all rights for a plan
router.put('/membership/plans/:id(\\d+)/rights', adminAuthMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { rights } = req.body;
  if (!Array.isArray(rights)) { error(res, ErrorCodes.PARAM_ERROR, 'rights 必须是数组'); return; }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM member_plan_rights WHERE plan_id = ?', [id]);
    for (const rt of rights) {
      await conn.execute(
        `INSERT INTO member_plan_rights
         (plan_id, right_key, right_name, right_value, right_category, icon_url, icon_file_id, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          rt.rightKey,
          rt.rightName,
          rt.rightValue,
          rt.rightCategory || 'general',
          rt.iconUrl || '',
          rt.iconFileId || null,
          rt.sortOrder || 0,
        ],
      );
    }
    await conn.commit();
    success(res, { updated: true, count: rights.length });
  } catch {
    await conn.rollback();
    error(res, ErrorCodes.SERVER_ERROR, '更新会员权益失败');
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
