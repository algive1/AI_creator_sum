import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  getMembershipPlans,
  getPlanDetail,
  getPlanFeatureDiscounts,
  getUserMembership,
  getMembershipRights,
} from '../services/membership.service';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import { SettingsService } from '../services/settings.service';
import { getCommerceAvailability, PURCHASE_UNAVAILABLE_MESSAGE } from '../services/commerce-availability.service';

const router = Router();
const MEMBERSHIP_DISABLED_MESSAGE = '会员功能已关闭，请联系管理员';
const POINTS_EXPIRE_TYPE_DISABLED = 'none';

async function requireMembershipEnabled(_req: Request, res: Response, next: NextFunction) {
  try {
    const commerce = await getCommerceAvailability();
    if (!commerce.purchaseEnabled || !commerce.membershipEnabled) {
      error(res, ErrorCodes.FORBIDDEN, commerce.message || PURCHASE_UNAVAILABLE_MESSAGE);
      return;
    }
    const enabled = await SettingsService.getBoolean('membership.enabled', true);
    if (!enabled) {
      error(res, ErrorCodes.FORBIDDEN, MEMBERSHIP_DISABLED_MESSAGE);
      return;
    }
    next();
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '读取会员功能开关失败');
  }
}

function parseHighlightFeatures(value: any): any {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function serializePointRule(row: any): any {
  if (!row?.point_rule_id && !row?.id) return null;
  return {
    totalPoints: Number(row.total_points || 0),
    immediatePoints: Number(row.immediate_points || 0),
    monthlyPoints: Number(row.monthly_points || 0),
    giftPoints: Number(row.gift_points || 0),
    grantMode: row.grant_mode || 'immediate',
    pointsExpireType: POINTS_EXPIRE_TYPE_DISABLED,
    pointsExpireDays: null,
    pointsExpireEnabled: false,
    pointsDiscountRate: Number(row.points_discount_rate ?? 1),
  };
}

router.get('/plans', requireMembershipEnabled, async (req: Request, res: Response) => {
  try {
    const version = (req.query as any).version;
    const list = await getMembershipPlans(version || undefined);
    const plans = [];
    for (const plan of list) {
      plans.push({
        planId: plan.id,
        name: plan.name,
        planKey: plan.plan_key,
        versionKey: plan.version_key,
        versionName: plan.version_name,
        durationType: plan.duration_type,
        durationDays: plan.duration_days,
        price: plan.price,
        originalPrice: plan.original_price,
        tag: plan.tag,
        highlightFeatures: parseHighlightFeatures(plan.highlight_features),
        pointRule: serializePointRule(plan),
        featureDiscounts: await getPlanFeatureDiscounts(plan.id),
      });
    }
    success(res, {
      list: plans,
    });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取会员套餐失败');
  }
});

router.get('/plans/:id(\\d+)', authMiddleware, requireMembershipEnabled, async (req: Request, res: Response) => {
  try {
    const detail = await getPlanDetail(parseInt(req.params.id, 10));
    if (!detail) {
      error(res, ErrorCodes.NOT_FOUND, '会员套餐不存在', 404);
      return;
    }

    success(res, {
      planId: detail.plan.id,
      name: detail.plan.name,
      planKey: detail.plan.plan_key,
      versionName: detail.plan.version_name,
      versionKey: detail.plan.version_key,
      durationType: detail.plan.duration_type,
      durationDays: detail.plan.duration_days,
      price: detail.plan.price,
      originalPrice: detail.plan.original_price,
      tag: detail.plan.tag,
      description: detail.plan.description,
      rights: detail.rights,
      pointRules: detail.pointRules,
      pointRule: serializePointRule(detail.pointRules),
      featureDiscounts: detail.featureDiscounts,
    });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取会员套餐详情失败');
  }
});

router.get('/me', authMiddleware, requireMembershipEnabled, async (req: Request, res: Response) => {
  try {
    const membership = await getUserMembership(req.user!.userId);
    success(res, membership);
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取会员状态失败');
  }
});

router.get('/rights', authMiddleware, requireMembershipEnabled, async (req: Request, res: Response) => {
  try {
    const rights = await getMembershipRights(req.user!.userId);
    success(res, { rights });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取会员权益失败');
  }
});

export default router;
