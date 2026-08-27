import type { PoolConnection } from 'mysql2/promise';
import { getConnection, query, queryOne } from '../utils/db';
import { SettingsService } from './settings.service';
import { requireWechatPayConfig } from './payment-config.service';
import {
  buildJsapiPaymentParams,
  buildResolvedNotifyUrl,
  createJsapiPrepay,
  decryptNotifyResource,
  queryJsapiOrder,
  verifyNotifySignature,
} from './wechat-pay.service';
import { lockPointAccountTx, applyPointChangeTx } from './points.service';
import { grantDueMembershipMonthlyPointsTx } from './membership-points.service';
import { grantInviteMemberPurchaseReward } from './invite.service';
import { normalizePublicIconUrl } from './member-benefit-icons.service';
import { ErrorCodes } from '../types';
import { ensurePurchaseEnabled } from './commerce-availability.service';

export type OrderType = 'points' | 'membership';
export type FirstPurchaseBonusType = 'none' | 'double' | 'fixed';

export interface CreateOrderInput {
  userId: number;
  orderType: OrderType;
  productId: number;
}

export interface ListOrderQuery {
  userId: number;
  orderType?: OrderType;
  status?: string;
  payStatus?: string;
  page?: number;
  pageSize?: number;
  lastId?: number;
}

export interface PaymentLogInput {
  orderNo: string;
  userId: number;
  channel?: string;
  eventType: string;
  status: 'success' | 'failed';
  message: string;
  wxTransactionId?: string;
  wxTradeState?: string;
  rawSummary?: any;
}

export interface PaymentNotifyInput {
  headers: {
    timestamp?: string;
    nonce?: string;
    signature?: string;
    serial?: string;
  };
  rawBody: string;
  payload: any;
}

export interface WechatJsapiPayResult {
  orderNo: string;
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: 'RSA';
  paySign: string;
}

export interface OrderRecord {
  id: number;
  orderNo: string;
  userId: number;
  orderType: OrderType;
  productId: number | null;
  productName: string;
  amountTotal: number;
  currency: string;
  pointsAmount: number;
  basePointsAmount: number;
  pointsBonusType: FirstPurchaseBonusType;
  pointsBonusAmount: number;
  pointsBonusApplied: boolean;
  memberPlanId: number | null;
  memberDurationDays: number;
  status: string;
  payStatus: string;
  payChannel: string;
  wxPrepayId: string | null;
  wxTransactionId: string | null;
  wxTradeState: string;
  wxPayerOpenid: string;
  wxAppid: string;
  wxMchid: string;
  paidAt: string | null;
  expireAt: string;
  grantStatus: string;
  grantMessage: string;
  grantAt: string | null;
  createdAt: string;
  updatedAt: string;
  subject?: string;
  amount?: number;
  paidAmount?: number;
  planId?: number | null;
}

interface PointPackageRow {
  id: number;
  name: string;
  points: number;
  price_cents: number;
  description: string;
  first_purchase_bonus_type?: string;
  first_purchase_bonus_points?: number;
  enabled: number;
  sort_order: number;
}

interface MemberPlanRow {
  id: number;
  name: string;
  duration_days: number;
  price: number;
  original_price: number;
  status: string;
  sort_order: number;
  description: string | null;
  highlight_features: any;
  version_id: number;
  version_name?: string;
  version_key?: string;
}

function normalizeOrderStatus(status: string): string {
  if (!status) return 'created';
  if (status === 'pending') return 'created';
  if (status === 'refunded') return 'closed';
  return status;
}

function normalizePayStatus(payStatus: string, status: string): string {
  if (payStatus && payStatus !== 'pending') return payStatus;
  switch (normalizeOrderStatus(status)) {
    case 'paid':
      return 'paid';
    case 'failed':
      return 'failed';
    case 'cancelled':
    case 'expired':
    case 'closed':
      return 'closed';
    default:
      return 'unpaid';
  }
}

function normalizeOrderRow(row: any): OrderRecord {
  const bonusType = normalizeFirstPurchaseBonusType(row.points_bonus_type);
  return {
    id: Number(row.id),
    orderNo: String(row.order_no),
    userId: Number(row.user_id),
    orderType: row.order_type === 'points' ? 'points' : 'membership',
    productId: row.product_id !== null && row.product_id !== undefined ? Number(row.product_id) : null,
    productName: String(row.product_name || row.subject || ''),
    amountTotal: Number(row.amount_total || row.amount || 0),
    currency: String(row.currency || 'CNY'),
    pointsAmount: Number(row.points_amount || 0),
    basePointsAmount: Number(row.base_points_amount || 0),
    pointsBonusType: bonusType,
    pointsBonusAmount: Number(row.points_bonus_amount || 0),
    pointsBonusApplied: !!row.points_bonus_applied,
    memberPlanId: row.member_plan_id !== null && row.member_plan_id !== undefined ? Number(row.member_plan_id) : null,
    memberDurationDays: Number(row.member_duration_days || 0),
    status: normalizeOrderStatus(String(row.status || 'created')),
    payStatus: normalizePayStatus(String(row.pay_status || ''), String(row.status || 'created')),
    payChannel: String(row.pay_channel || 'wechat_jsapi'),
    wxPrepayId: row.wx_prepay_id || null,
    wxTransactionId: row.wx_transaction_id || null,
    wxTradeState: String(row.wx_trade_state || ''),
    wxPayerOpenid: String(row.wx_payer_openid || ''),
    wxAppid: String(row.wx_appid || ''),
    wxMchid: String(row.wx_mchid || ''),
    paidAt: row.paid_at || null,
    expireAt: String(row.expire_at),
    grantStatus: String(row.grant_status || 'pending'),
    grantMessage: String(row.grant_message || ''),
    grantAt: row.grant_at || null,
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
    subject: row.subject || undefined,
    amount: row.amount !== undefined ? Number(row.amount) : undefined,
    paidAmount: row.paid_amount !== undefined ? Number(row.paid_amount) : undefined,
    planId: row.plan_id !== undefined && row.plan_id !== null ? Number(row.plan_id) : null,
  };
}

function formatOrderForApi(order: OrderRecord, extra?: Record<string, any>) {
  return {
    id: order.id,
    orderNo: order.orderNo,
    userId: order.userId,
    orderType: order.orderType,
    productId: order.productId,
    productName: order.productName,
    amountTotal: order.amountTotal,
    currency: order.currency,
    pointsAmount: order.pointsAmount,
    basePointsAmount: order.basePointsAmount,
    pointsBonusType: order.pointsBonusType,
    pointsBonusAmount: order.pointsBonusAmount,
    pointsBonusApplied: order.pointsBonusApplied,
    memberPlanId: order.memberPlanId,
    memberDurationDays: order.memberDurationDays,
    status: order.status,
    payStatus: order.payStatus,
    payChannel: order.payChannel,
    wxPrepayId: order.wxPrepayId,
    wxTransactionId: order.wxTransactionId,
    wxTradeState: order.wxTradeState,
    wxPayerOpenid: order.wxPayerOpenid,
    paidAt: order.paidAt,
    expireAt: order.expireAt,
    grantStatus: order.grantStatus,
    grantMessage: order.grantMessage,
    grantAt: order.grantAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    ...extra,
  };
}

function trimMessage(message: string, max = 255): string {
  return String(message || '').slice(0, max);
}

function addMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + Math.max(1, minutes) * 60_000);
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + Math.max(1, days) * 24 * 60 * 60_000);
}

function normalizeFirstPurchaseBonusType(value: unknown): FirstPurchaseBonusType {
  const type = String(value || '').trim();
  if (type === 'double' || type === 'fixed') return type;
  return 'none';
}

function configuredBonusPoints(type: FirstPurchaseBonusType, basePoints: number, fixedPoints: number): number {
  if (type === 'double') return basePoints;
  if (type === 'fixed') return Math.max(0, Math.trunc(fixedPoints || 0));
  return 0;
}

async function getOrderTimeoutMinutes(): Promise<number> {
  const value = await SettingsService.getString('wechat_pay.timeout_minutes', '30');
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

function generateOrderNo(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const datePart = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
  const randomPart = Math.floor(Math.random() * 9000 + 1000);
  return `P${datePart}${randomPart}`;
}

async function writePaymentLog(conn: PoolConnection | null, input: PaymentLogInput): Promise<void> {
  const params = [
    input.orderNo,
    input.userId,
    input.channel || 'wechat_jsapi',
    input.eventType,
    input.status,
    trimMessage(input.message),
    input.wxTransactionId || '',
    input.wxTradeState || '',
    input.rawSummary ? JSON.stringify(input.rawSummary).slice(0, 4000) : null,
  ];

  if (conn) {
    await conn.execute(
      `INSERT INTO payment_logs
       (order_no, user_id, channel, event_type, status, message, wx_transaction_id, wx_trade_state, raw_summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      params,
    );
    return;
  }

  await query(
    `INSERT INTO payment_logs
     (order_no, user_id, channel, event_type, status, message, wx_transaction_id, wx_trade_state, raw_summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
    params,
  );
}

async function getOrderByNo(orderNo: string): Promise<OrderRecord | null> {
  const row = await queryOne<any>('SELECT * FROM member_orders WHERE order_no = ?', [orderNo]);
  return row ? normalizeOrderRow(row) : null;
}

async function getOwnedOrder(orderNo: string, userId: number): Promise<OrderRecord | null> {
  const row = await queryOne<any>('SELECT * FROM member_orders WHERE order_no = ? AND user_id = ?', [orderNo, userId]);
  return row ? normalizeOrderRow(row) : null;
}

async function getOrderForUpdate(conn: PoolConnection, orderNo: string): Promise<OrderRecord | null> {
  const [rows] = await conn.execute('SELECT * FROM member_orders WHERE order_no = ? FOR UPDATE', [orderNo]) as any;
  return rows?.[0] ? normalizeOrderRow(rows[0]) : null;
}

async function _updateOrderStatus(conn: PoolConnection | null, orderNo: string, userId: number, fields: Record<string, any>): Promise<void> {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const setSql = keys.map(key => `${key} = ?`).join(', ');
  const values = keys.map(key => fields[key]);
  values.push(orderNo, userId);
  const sql = `UPDATE member_orders SET ${setSql}, updated_at = NOW(3) WHERE order_no = ? AND user_id = ?`;
  if (conn) {
    await conn.execute(sql, values);
    return;
  }
  await query(sql, values);
}

async function updateOrderByNo(conn: PoolConnection | null, orderNo: string, fields: Record<string, any>): Promise<void> {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const setSql = keys.map(key => `${key} = ?`).join(', ');
  const values = keys.map(key => fields[key]);
  values.push(orderNo);
  const sql = `UPDATE member_orders SET ${setSql}, updated_at = NOW(3) WHERE order_no = ?`;
  if (conn) {
    await conn.execute(sql, values);
    return;
  }
  await query(sql, values);
}

async function _ensureOrderNotExpired(order: OrderRecord): Promise<void> {
  if (['paid', 'failed', 'cancelled', 'closed', 'expired'].includes(order.status)) return;
  if (new Date(order.expireAt).getTime() > Date.now()) return;
  await updateOrderByNo(null, order.orderNo, {
    status: 'expired',
    pay_status: 'closed',
    grant_status: order.grantStatus === 'granted' ? order.grantStatus : 'closed',
    grant_message: order.grantMessage || '订单已过期',
    pay_channel: order.payChannel || 'wechat_jsapi',
  });
}

async function resolvePointPackage(productId: number): Promise<PointPackageRow | null> {
  return queryOne<PointPackageRow>('SELECT * FROM point_packages WHERE id = ? AND enabled = 1', [productId]);
}

async function hasGrantedPointOrderBefore(conn: PoolConnection, userId: number, currentOrderId: number): Promise<boolean> {
  const [rows] = await conn.execute(
    `SELECT id
       FROM member_orders
      WHERE user_id = ?
        AND order_type = 'points'
        AND grant_status = 'granted'
        AND id <> ?
      LIMIT 1
        FOR UPDATE`,
    [userId, currentOrderId],
  ) as any;
  return Array.isArray(rows) && rows.length > 0;
}

async function resolveMemberPlan(productId: number): Promise<MemberPlanRow | null> {
  return queryOne<MemberPlanRow>(
    `SELECT p.*, v.name AS version_name, v.version_key
       FROM member_plans p
       JOIN member_versions v ON v.id = p.version_id
      WHERE p.id = ? AND p.status = 'active'`,
    [productId],
  );
}

async function resolveMemberPlanRights(planId: number): Promise<any[]> {
  const rights = await query<any>(
    'SELECT right_key, right_name, right_value, right_category, icon_url, icon_file_id, sort_order FROM member_plan_rights WHERE plan_id = ? ORDER BY sort_order',
    [planId],
  );
  return Promise.all(rights.map(async (right: any) => {
    const iconUrl = await normalizePublicIconUrl(right.icon_url || '');
    const iconFileId = right.icon_file_id ? Number(right.icon_file_id) : null;
    return {
      ...right,
      icon_url: iconUrl,
      icon_file_id: iconFileId,
      rightKey: right.right_key,
      rightName: right.right_name,
      rightValue: right.right_value,
      rightCategory: right.right_category,
      iconUrl,
      iconFileId,
    };
  }));
}

async function resolveMemberPlanPointRule(planId: number): Promise<any | null> {
  return queryOne<any>('SELECT * FROM member_plan_point_rules WHERE plan_id = ?', [planId]);
}

async function resolveUserOpenId(userId: number): Promise<string> {
  const row = await queryOne<any>('SELECT openid FROM users WHERE id = ? AND deleted_at IS NULL', [userId]);
  return String(row?.openid || '');
}

async function insertOrder(conn: PoolConnection, data: Record<string, any>): Promise<OrderRecord> {
  const [result] = await conn.execute(
    `INSERT INTO member_orders
     (order_no, user_id, order_type, product_id, product_name, amount_total, currency, points_amount,
      base_points_amount, points_bonus_type, points_bonus_amount, points_bonus_applied, member_plan_id,
      member_duration_days, plan_id, subject, amount, paid_amount, status, pay_status, pay_channel, wx_prepay_id,
      wx_trade_state, wx_payer_openid, wx_appid, wx_mchid, paid_at, expire_at, grant_status, grant_message, grant_at,
      created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, NULL, '', '', '', '', NULL, ?, 'pending', '', NULL, NOW(3), NOW(3))`,
    [
      data.orderNo,
      data.userId,
      data.orderType,
      data.productId,
      data.productName,
      data.amountTotal,
      data.currency,
      data.pointsAmount,
      data.basePointsAmount,
      data.pointsBonusType,
      data.pointsBonusAmount,
      data.pointsBonusApplied ? 1 : 0,
      data.memberPlanId,
      data.memberDurationDays,
      data.planId,
      data.subject,
      data.amountTotal,
      data.status,
      data.payStatus,
      data.payChannel,
      data.expireAt,
    ],
  ) as any;

  const id = Number((result as any).insertId || 0);
  return {
    id,
    orderNo: data.orderNo,
    userId: data.userId,
    orderType: data.orderType,
    productId: data.productId,
    productName: data.productName,
    amountTotal: data.amountTotal,
    currency: data.currency,
    pointsAmount: data.pointsAmount,
    basePointsAmount: data.basePointsAmount,
    pointsBonusType: data.pointsBonusType,
    pointsBonusAmount: data.pointsBonusAmount,
    pointsBonusApplied: !!data.pointsBonusApplied,
    memberPlanId: data.memberPlanId,
    memberDurationDays: data.memberDurationDays,
    status: data.status,
    payStatus: data.payStatus,
    payChannel: data.payChannel,
    wxPrepayId: null,
    wxTransactionId: null,
    wxTradeState: '',
    wxPayerOpenid: '',
    wxAppid: '',
    wxMchid: '',
    paidAt: null,
    expireAt: data.expireAt,
    grantStatus: 'pending',
    grantMessage: '',
    grantAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    subject: data.subject,
    amount: data.amountTotal,
    paidAmount: 0,
    planId: data.planId,
  };
}

export async function listPointPackages() {
  const rows = await query<PointPackageRow>('SELECT * FROM point_packages WHERE enabled = 1 ORDER BY sort_order, id');
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    points: row.points,
    priceCents: row.price_cents,
    description: row.description || '',
    firstPurchaseBonusType: normalizeFirstPurchaseBonusType(row.first_purchase_bonus_type),
    firstPurchaseBonusPoints: Math.max(0, Number(row.first_purchase_bonus_points || 0)),
    enabled: !!row.enabled,
    sortOrder: row.sort_order,
  }));
}

export async function listMemberPlans() {
  const rows = await query<MemberPlanRow>(
    `SELECT p.*, v.name AS version_name, v.version_key
       FROM member_plans p
       JOIN member_versions v ON v.id = p.version_id
      WHERE p.status = 'active'
      ORDER BY v.sort_order, p.sort_order, p.id`,
  );
  const result = [];
  for (const row of rows) {
    const rights = await resolveMemberPlanRights(row.id);
    result.push({
      id: row.id,
      name: row.name,
      priceCents: row.price,
      originalPriceCents: row.original_price,
      durationDays: row.duration_days,
      enabled: row.status === 'active',
      sortOrder: row.sort_order,
      versionId: row.version_id,
      versionName: row.version_name,
      versionKey: row.version_key,
      rights,
      rightsText: rights.map((item: any) => item.right_name || item.right_value).filter(Boolean).join('，'),
      description: row.description || '',
      highlightFeatures: typeof row.highlight_features === 'string' ? JSON.parse(row.highlight_features || '[]') : row.highlight_features,
    });
  }
  return result;
}

export async function createOrder(input: CreateOrderInput) {
  await ensurePurchaseEnabled();
  const orderType = input.orderType === 'points' ? 'points' : 'membership';
  const orderNo = generateOrderNo();
  const timeoutMinutes = await getOrderTimeoutMinutes();
  const expireAt = addMinutes(new Date(), timeoutMinutes);

  let productName: string;
  let amountTotal: number;
  let pointsAmount = 0;
  let basePointsAmount = 0;
  let pointsBonusType: FirstPurchaseBonusType = 'none';
  let pointsBonusAmount = 0;
  let memberPlanId: number | null = null;
  let memberDurationDays = 0;
  let planId: number | null = null;

  if (orderType === 'points') {
    const packageRow = await resolvePointPackage(input.productId);
    if (!packageRow) {
      throw Object.assign(new Error('积分套餐不存在或已下架'), { code: ErrorCodes.ORDER_NOT_FOUND });
    }
    productName = packageRow.name;
    amountTotal = Number(packageRow.price_cents);
    basePointsAmount = Number(packageRow.points);
    pointsAmount = basePointsAmount;
    pointsBonusType = normalizeFirstPurchaseBonusType(packageRow.first_purchase_bonus_type);
    pointsBonusAmount = configuredBonusPoints(pointsBonusType, basePointsAmount, Number(packageRow.first_purchase_bonus_points || 0));
  } else {
    const membershipEnabled = await SettingsService.getBoolean('membership.enabled', true);
    if (!membershipEnabled) {
      throw Object.assign(new Error('会员功能已关闭，暂不能购买会员套餐'), { code: ErrorCodes.FORBIDDEN });
    }
    const plan = await resolveMemberPlan(input.productId);
    if (!plan) {
      throw Object.assign(new Error('会员套餐不存在或已下架'), { code: ErrorCodes.ORDER_NOT_FOUND });
    }
    productName = plan.name;
    amountTotal = Number(plan.price);
    memberPlanId = plan.id;
    memberDurationDays = Number(plan.duration_days);
    planId = plan.id;
  }
  const subject = productName;

  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const order = await insertOrder(conn, {
      orderNo,
      userId: input.userId,
      orderType,
      productId: input.productId,
      productName,
      amountTotal,
      currency: 'CNY',
      pointsAmount,
      basePointsAmount,
      pointsBonusType,
      pointsBonusAmount,
      pointsBonusApplied: false,
      memberPlanId,
      memberDurationDays,
      planId,
      subject,
      status: 'created',
      payStatus: 'unpaid',
      payChannel: 'wechat_jsapi',
      expireAt,
    });
    await writePaymentLog(conn, {
      orderNo,
      userId: input.userId,
      channel: 'wechat_jsapi',
      eventType: 'create_order',
      status: 'success',
      message: '创建业务订单',
      rawSummary: {
        orderType,
        productId: input.productId,
        amountTotal,
        pointsAmount,
        basePointsAmount,
        pointsBonusType,
        pointsBonusAmount,
        memberDurationDays,
      },
    });
    await conn.commit();
    return formatOrderForApi(order, { amountTotal });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function listOrders(input: ListOrderQuery) {
  const page = Math.max(1, Math.trunc(input.page || 1));
  const pageSize = Math.min(Math.max(1, Math.trunc(input.pageSize || 20)), 100);
  const lastId = Number(input.lastId || 0);
  const useCursor = Number.isFinite(lastId) && lastId > 0;
  const offset = useCursor ? 0 : (page - 1) * pageSize;
  let where = 'o.user_id = ?';
  const params: any[] = [input.userId];
  if (input.orderType) {
    where += ' AND o.order_type = ?';
    params.push(input.orderType);
  }
  if (input.status) {
    where += ' AND o.status = ?';
    params.push(input.status);
  }
  if (input.payStatus) {
    where += ' AND o.pay_status = ?';
    params.push(input.payStatus);
  }
  if (useCursor) {
    where += ' AND o.id < ?';
    params.push(lastId);
  }

  const rows = await query<any>(
    `SELECT o.*, mp.name AS member_plan_name, pp.name AS point_package_name
       FROM member_orders o
       LEFT JOIN member_plans mp ON mp.id = o.member_plan_id
       LEFT JOIN point_packages pp ON pp.id = o.product_id
      WHERE ${where}
      ORDER BY o.id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );
  const countRow = await queryOne<any>(`SELECT COUNT(*) AS total FROM member_orders o WHERE ${where}`, params);
  const list = rows.map(row => {
    const order = normalizeOrderRow(row);
    return formatOrderForApi(order, {
      memberPlanName: row.member_plan_name || '',
      pointPackageName: row.point_package_name || '',
    });
  });
  return {
    list,
    pagination: {
      page,
      pageSize,
      total: Number(countRow?.total || 0),
      totalPages: Math.ceil(Number(countRow?.total || 0) / pageSize),
      nextCursor: list.length ? Number(list[list.length - 1]?.id || 0) : null,
      hasMore: useCursor ? list.length >= pageSize : page * pageSize < Number(countRow?.total || 0),
    },
  };
}

export async function getOrderDetail(orderNo: string, userId: number) {
  const row = await queryOne<any>(
    `SELECT o.*, mp.name AS member_plan_name, pp.name AS point_package_name
       FROM member_orders o
       LEFT JOIN member_plans mp ON mp.id = o.member_plan_id
       LEFT JOIN point_packages pp ON pp.id = o.product_id
      WHERE o.order_no = ? AND o.user_id = ?`,
    [orderNo, userId],
  );
  if (!row) {
    throw Object.assign(new Error('订单不存在'), { code: ErrorCodes.ORDER_NOT_FOUND });
  }
  const order = normalizeOrderRow(row);
  return formatOrderForApi(order, {
    memberPlanName: row.member_plan_name || '',
    pointPackageName: row.point_package_name || '',
  });
}

export async function getOwnOrder(orderNo: string, userId: number): Promise<OrderRecord> {
  const order = await getOwnedOrder(orderNo, userId);
  if (!order) {
    throw Object.assign(new Error('订单不存在或不属于当前用户'), { code: ErrorCodes.ORDER_NOT_OWNED });
  }
  return order;
}

export async function startWechatJsapiPayment(orderNo: string, userId: number): Promise<WechatJsapiPayResult> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const [orderRow] = await conn.execute('SELECT * FROM member_orders WHERE order_no = ? AND user_id = ? FOR UPDATE', [orderNo, userId]) as any;
    if (!orderRow?.[0]) {
      throw Object.assign(new Error('订单不存在或不属于当前用户'), { code: ErrorCodes.ORDER_NOT_OWNED });
    }
    const order = normalizeOrderRow(orderRow[0]);

    if (order.status === 'paid' || order.payStatus === 'paid') {
      throw Object.assign(new Error('订单已支付，请勿重复支付'), { code: ErrorCodes.ORDER_ALREADY_PAID });
    }
    if (['cancelled', 'closed', 'expired', 'failed'].includes(order.status)) {
      throw Object.assign(new Error('订单状态无效，无法发起支付'), { code: ErrorCodes.ORDER_STATUS_INVALID });
    }
    if (new Date(order.expireAt).getTime() <= Date.now()) {
      await updateOrderByNo(conn, order.orderNo, {
        status: 'expired',
        pay_status: 'closed',
        grant_status: order.grantStatus === 'granted' ? order.grantStatus : 'closed',
        grant_message: order.grantMessage || '订单已过期',
      });
      await writePaymentLog(conn, {
        orderNo: order.orderNo,
        userId,
        channel: 'wechat_jsapi',
        eventType: 'jsapi_prepay',
        status: 'failed',
        message: '订单已过期',
      });
      await conn.commit();
      throw Object.assign(new Error('订单已过期，请重新下单'), { code: ErrorCodes.ORDER_EXPIRED });
    }

    const cfg = await requireWechatPayConfig();
    const openid = await resolveUserOpenId(userId);
    if (!openid) {
      throw Object.assign(new Error('当前用户没有微信 openid，无法发起支付'), { code: ErrorCodes.PARAM_ERROR });
    }

    const notifyUrl = await buildResolvedNotifyUrl(cfg.notifyUrl);
    const { prepayId, response } = await createJsapiPrepay({
      orderNo,
      description: order.productName || order.subject || 'AI Creator 支付订单',
      amountTotal: order.amountTotal,
      openid,
      notifyUrl,
    }, cfg);
    const paymentParams = await buildJsapiPaymentParams({
      appId: cfg.appId,
      prepayId,
      privateKey: cfg.privateKey,
    });

    await updateOrderByNo(conn, order.orderNo, {
      status: 'paying',
      pay_status: 'paying',
      pay_channel: 'wechat_jsapi',
      wx_prepay_id: prepayId,
      wx_trade_state: '',
      wx_payer_openid: openid,
      wx_appid: cfg.appId,
      wx_mchid: cfg.mchId,
      grant_status: order.grantStatus || 'pending',
      grant_message: order.grantMessage || '',
    });
    await writePaymentLog(conn, {
      orderNo,
      userId,
      channel: 'wechat_jsapi',
      eventType: 'jsapi_prepay',
      status: 'success',
      message: '微信支付预下单成功',
      rawSummary: {
        prepayId,
        response: summarizePrepayResponse(response),
      },
    });
    await conn.commit();

    return {
      orderNo,
      timeStamp: paymentParams.timeStamp,
      nonceStr: paymentParams.nonceStr,
      package: paymentParams.package,
      signType: paymentParams.signType,
      paySign: paymentParams.paySign,
    };
  } catch (error) {
    await conn.rollback();
    if ((error as any)?.code && Number((error as any).code) < 5000) {
      throw error;
    }
    throw Object.assign(new Error('微信支付下单失败，请稍后重试'), { code: ErrorCodes.WECHAT_PREPAY_FAILED });
  } finally {
    conn.release();
  }
}

export async function handleWechatNotify(input: PaymentNotifyInput): Promise<{ success: boolean; message: string }> {
  const rawSummary = summarizeNotifyPayload(input.payload);
  const headerSummary = {
    timestamp: input.headers.timestamp || '',
    nonce: input.headers.nonce || '',
    serial: input.headers.serial || '',
  };

  let orderNo = '';
  let tradeState = '';
  let transactionId = '';
  let userId = 0;

  try {
    if (!input.payload || !input.payload.resource) {
      return { success: false, message: '回调体不完整' };
    }
    const cfg = await requireWechatPayConfig();
    if (cfg.verifySignature) {
      const verified = await verifyNotifySignature(input.headers, input.rawBody, cfg);
      if (!verified) {
        await writePaymentLog(null, {
          orderNo: String(input.payload?.resource?.out_trade_no || ''),
          userId: Number(input.payload?.resource?.user_id || 0),
          channel: 'wechat_jsapi',
          eventType: 'notify_verified',
          status: 'failed',
          message: '微信回调验签失败',
          rawSummary: { headerSummary, payload: rawSummary },
        });
        return { success: false, message: '微信回调验签失败' };
      }
    }

    const notifyData = decryptNotifyResource(input.payload.resource, cfg.apiV3Key);
    orderNo = String(notifyData.out_trade_no || '');
    tradeState = String(notifyData.trade_state || '');
    transactionId = String(notifyData.transaction_id || '');
    userId = Number((await queryOne<any>('SELECT user_id FROM member_orders WHERE order_no = ?', [orderNo]))?.user_id || 0);

    await writePaymentLog(null, {
      orderNo,
      userId,
      channel: 'wechat_jsapi',
      eventType: 'notify_decrypted',
      status: 'success',
      message: '微信回调解密成功',
      wxTransactionId: transactionId,
      wxTradeState: tradeState,
      rawSummary: { headerSummary, notify: summarizeNotifyData(notifyData) },
    });

    if (!orderNo) {
      return { success: false, message: '缺少订单号' };
    }

    const conn = await getConnection();
    try {
      await conn.beginTransaction();
      const order = await getOrderForUpdate(conn, orderNo);
      if (!order) {
        await writePaymentLog(conn, {
          orderNo,
          userId,
          channel: 'wechat_jsapi',
          eventType: 'notify_received',
          status: 'failed',
          message: '本地订单不存在',
          wxTransactionId: transactionId,
          wxTradeState: tradeState,
          rawSummary: { headerSummary, notify: summarizeNotifyData(notifyData) },
        });
        await conn.commit();
        return { success: false, message: '本地订单不存在' };
      }

      if (order.status === 'paid' && order.payStatus === 'paid' && order.grantStatus === 'granted') {
        await writePaymentLog(conn, {
          orderNo,
          userId: order.userId,
          channel: 'wechat_jsapi',
          eventType: 'duplicate_notify',
          status: 'success',
          message: '重复回调，已忽略',
          wxTransactionId: transactionId || order.wxTransactionId || '',
          wxTradeState: tradeState || order.wxTradeState || '',
          rawSummary: { headerSummary, notify: summarizeNotifyData(notifyData) },
        });
        await conn.commit();
        return { success: true, message: '重复回调已处理' };
      }

      // 如果 pay_status 已经是 paid（正在等待 grant 完成或已由主动查单处理），直接跳过
      if (order.payStatus === 'paid') {
        await writePaymentLog(conn, {
          orderNo,
          userId: order.userId,
          channel: 'wechat_jsapi',
          eventType: 'duplicate_notify',
          status: 'success',
          message: `支付已确认（grantStatus=${order.grantStatus}），跳过重复回调`,
          wxTransactionId: transactionId || order.wxTransactionId || '',
          wxTradeState: tradeState || order.wxTradeState || '',
          rawSummary: { headerSummary, notify: summarizeNotifyData(notifyData) },
        });
        await conn.commit();
        return { success: true, message: '支付已确认，跳过重复回调' };
      }

      if (order.amountTotal !== Number(notifyData?.amount?.total || 0)) {
        await updateOrderByNo(conn, orderNo, {
          status: 'failed',
          pay_status: 'failed',
          wx_trade_state: tradeState,
          wx_transaction_id: transactionId,
        });
        await writePaymentLog(conn, {
          orderNo,
          userId: order.userId,
          channel: 'wechat_jsapi',
          eventType: 'failed',
          status: 'failed',
          message: '支付金额不一致',
          wxTransactionId: transactionId,
          wxTradeState: tradeState,
          rawSummary: { headerSummary, notify: summarizeNotifyData(notifyData), orderAmount: order.amountTotal },
        });
        await conn.commit();
        throw Object.assign(new Error('微信支付金额校验失败'), { code: ErrorCodes.WECHAT_AMOUNT_MISMATCH });
      }

      if (String(notifyData.appid || '') !== cfg.appId) {
        await updateOrderByNo(conn, orderNo, {
          status: 'failed',
          pay_status: 'failed',
          wx_trade_state: tradeState,
          wx_transaction_id: transactionId,
        });
        await writePaymentLog(conn, {
          orderNo,
          userId: order.userId,
          channel: 'wechat_jsapi',
          eventType: 'failed',
          status: 'failed',
          message: 'appid 不一致',
          wxTransactionId: transactionId,
          wxTradeState: tradeState,
          rawSummary: { headerSummary, notify: summarizeNotifyData(notifyData), appid: notifyData.appid, expectedAppid: cfg.appId },
        });
        await conn.commit();
        throw Object.assign(new Error('微信支付 appid 校验失败'), { code: ErrorCodes.WECHAT_APPID_MISMATCH });
      }

      if (String(notifyData.mchid || '') !== cfg.mchId) {
        await updateOrderByNo(conn, orderNo, {
          status: 'failed',
          pay_status: 'failed',
          wx_trade_state: tradeState,
          wx_transaction_id: transactionId,
        });
        await writePaymentLog(conn, {
          orderNo,
          userId: order.userId,
          channel: 'wechat_jsapi',
          eventType: 'failed',
          status: 'failed',
          message: 'mchid 不一致',
          wxTransactionId: transactionId,
          wxTradeState: tradeState,
          rawSummary: { headerSummary, notify: summarizeNotifyData(notifyData), mchid: notifyData.mchid, expectedMchid: cfg.mchId },
        });
        await conn.commit();
        throw Object.assign(new Error('微信支付 mchid 校验失败'), { code: ErrorCodes.WECHAT_MCHID_MISMATCH });
      }

      if (tradeState !== 'SUCCESS') {
        const mappedStatus = mapWechatTradeState(tradeState);
        await updateOrderByNo(conn, orderNo, {
          status: mappedStatus,
          pay_status: mappedStatus === 'closed' ? 'closed' : mappedStatus === 'expired' ? 'closed' : 'failed',
          wx_trade_state: tradeState,
          wx_transaction_id: transactionId,
        });
        await writePaymentLog(conn, {
          orderNo,
          userId: order.userId,
          channel: 'wechat_jsapi',
          eventType: 'failed',
          status: 'failed',
          message: `支付结果非 SUCCESS: ${tradeState}`,
          wxTransactionId: transactionId,
          wxTradeState: tradeState,
          rawSummary: { headerSummary, notify: summarizeNotifyData(notifyData) },
        });
        await conn.commit();
        return { success: true, message: `订单已更新为 ${mappedStatus}` };
      }

      // 先记录支付信息，但不标记为 paid——权益发放成功后再更新状态
      await updateOrderByNo(conn, orderNo, {
        pay_status: 'paid',
        wx_trade_state: tradeState,
        wx_transaction_id: transactionId,
        wx_payer_openid: String(notifyData?.payer?.openid || order.wxPayerOpenid || ''),
        wx_appid: String(notifyData.appid || cfg.appId),
        wx_mchid: String(notifyData.mchid || cfg.mchId),
        paid_at: order.paidAt || new Date(),
        paid_amount: order.amountTotal,
        grant_status: 'pending',
        grant_message: order.grantMessage || '',
        grant_at: order.grantAt || null,
      });
      await writePaymentLog(conn, {
        orderNo,
        userId: order.userId,
        channel: 'wechat_jsapi',
        eventType: 'paid',
        status: 'success',
        message: '微信支付成功',
        wxTransactionId: transactionId,
        wxTradeState: tradeState,
        rawSummary: { headerSummary, notify: summarizeNotifyData(notifyData) },
      });
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    const grantResult = await grantOrderBenefits(orderNo);

    // 使用独立事务更新权益发放结果，确保状态不丢失
    const statusConn = await getConnection();
    try {
      await statusConn.beginTransaction();
      if (!grantResult.success) {
        await updateOrderByNo(statusConn, orderNo, { status: 'paid', grant_status: 'failed', grant_message: grantResult.message });
        await writePaymentLog(statusConn, {
          orderNo,
          userId,
          channel: 'wechat_jsapi',
          eventType: 'grant_failed',
          status: 'failed',
          message: grantResult.message,
          wxTransactionId: transactionId,
          wxTradeState: tradeState,
          rawSummary: { headerSummary, notify: summarizeNotifyData(notifyData) },
        });
        await statusConn.commit();
        return { success: false, message: grantResult.message };
      }

      // 权益发放成功，标记订单完成
      await updateOrderByNo(statusConn, orderNo, { status: 'paid', grant_status: 'granted', grant_at: new Date(), grant_message: '发放成功' });
      await writePaymentLog(statusConn, {
        orderNo,
        userId,
        channel: 'wechat_jsapi',
        eventType: 'grant_success',
        status: 'success',
        message: '权益发放成功',
        wxTransactionId: transactionId,
        wxTradeState: tradeState,
        rawSummary: { headerSummary, notify: summarizeNotifyData(notifyData) },
      });
      await statusConn.commit();
      return { success: true, message: 'success' };
    } catch (statusErr: any) {
      try { await statusConn.rollback(); } catch {}
      // 状态更新失败但不影响主流程——grantOrderBenefits 已成功，recoverPendingGrants 会补标记
      console.error(`[Payment] Failed to update grant status for order ${orderNo}:`, statusErr?.message || statusErr);
      return { success: true, message: 'granted-but-status-update-failed' };
    } finally {
      statusConn.release();
    }
  } catch (error: any) {
    if (orderNo) {
      await writePaymentLog(null, {
        orderNo,
        userId,
        channel: 'wechat_jsapi',
        eventType: 'notify_received',
        status: 'failed',
        message: error?.message || '微信回调处理失败',
        wxTransactionId: transactionId,
        wxTradeState: tradeState,
        rawSummary: { headerSummary, payload: rawSummary },
      });
    }
    if (error?.code && Number(error.code) < 5000) {
      throw error;
    }
    throw Object.assign(new Error(error?.message || '微信回调处理失败'), { code: ErrorCodes.SERVER_ERROR });
  }
}

export async function queryAndSyncWechatOrder(orderNo: string, userId: number, isAdmin = false) {
  const order = isAdmin ? await getOrderByNo(orderNo) : await getOwnedOrder(orderNo, userId);
  if (!order) {
    throw Object.assign(new Error('订单不存在'), { code: ErrorCodes.ORDER_NOT_FOUND });
  }
  if (!isAdmin && order.userId !== userId) {
    throw Object.assign(new Error('订单不属于当前用户'), { code: ErrorCodes.ORDER_NOT_OWNED });
  }

  const cfg = await requireWechatPayConfig();
  const response = await queryJsapiOrder(orderNo, cfg);
  await writePaymentLog(null, {
    orderNo,
    userId: order.userId,
    channel: 'wechat_jsapi',
    eventType: 'query_order',
    status: 'success',
    message: '主动查单成功',
    wxTransactionId: String(response.transaction_id || ''),
    wxTradeState: String(response.trade_state || ''),
    rawSummary: summarizeNotifyData(response),
  });

  if (String(response.trade_state || '') !== 'SUCCESS') {
    const mappedStatus = mapWechatTradeState(String(response.trade_state || ''));
    await updateOrderByNo(null, orderNo, {
      status: mappedStatus,
      pay_status: mappedStatus === 'closed' ? 'closed' : mappedStatus === 'expired' ? 'closed' : 'failed',
      wx_trade_state: String(response.trade_state || ''),
      wx_transaction_id: String(response.transaction_id || order.wxTransactionId || ''),
    });
    return { order: await getOrderByNo(orderNo), response, granted: false };
  }

  validateWechatPaidResult(order, response, cfg);

  await updateOrderByNo(null, orderNo, {
    pay_status: 'paid',
    wx_trade_state: 'SUCCESS',
    wx_transaction_id: String(response.transaction_id || order.wxTransactionId || ''),
    wx_payer_openid: String(response?.payer?.openid || order.wxPayerOpenid || ''),
    wx_appid: String(response.appid || cfg.appId),
    wx_mchid: String(response.mchid || cfg.mchId),
    paid_at: order.paidAt || new Date(),
    paid_amount: order.amountTotal,
  });

  const grantResult = await grantOrderBenefits(orderNo);
  if (!grantResult.success) {
    await updateOrderByNo(null, orderNo, { status: 'paid', grant_status: 'failed', grant_message: grantResult.message });
    return { order: await getOrderByNo(orderNo), response, granted: false, grantMessage: grantResult.message };
  }

  await updateOrderByNo(null, orderNo, { status: 'paid', grant_status: 'granted', grant_at: new Date(), grant_message: '发放成功' });
  return { order: await getOrderByNo(orderNo), response, granted: true };
}

export async function cancelOrder(orderNo: string, userId: number) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [orderRow] = await conn.execute('SELECT * FROM member_orders WHERE order_no = ? AND user_id = ? FOR UPDATE', [orderNo, userId]) as any;
    const order = orderRow?.[0] ? normalizeOrderRow(orderRow[0]) : null;
    if (!order) {
      await conn.rollback();
      throw Object.assign(new Error('订单不存在'), { code: ErrorCodes.ORDER_NOT_FOUND });
    }
    if (order.status === 'paid' || order.payStatus === 'paid') {
      await conn.rollback();
      throw Object.assign(new Error('订单已支付，不能取消'), { code: ErrorCodes.ORDER_ALREADY_PAID });
    }
    if (['cancelled', 'closed', 'expired', 'failed'].includes(order.status)) {
      await conn.rollback();
      return { order: formatOrderForApi(order), cancelled: false };
    }
    await updateOrderByNo(conn, orderNo, {
      status: 'cancelled',
      pay_status: 'closed',
    });
    await writePaymentLog(conn, {
      orderNo,
      userId,
      channel: 'wechat_jsapi',
      eventType: 'failed',
      status: 'success',
      message: '订单已取消',
    });
    await conn.commit();
    const updated = await getOrderForUpdate(conn, orderNo);
    return { order: updated ? formatOrderForApi(updated) : formatOrderForApi(order), cancelled: true };
  } catch (error) {
    try { await conn.rollback(); } catch {}
    throw error;
  } finally {
    conn.release();
  }
}

export async function listPaymentLogs(orderNo: string, options: { page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, Math.trunc(options.page || 1));
  const pageSize = Math.min(Math.max(1, Math.trunc(options.pageSize || 20)), 100);
  const offset = (page - 1) * pageSize;
  const list = await query<any>(
    'SELECT * FROM payment_logs WHERE order_no = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [orderNo, pageSize, offset],
  );
  const countRow = await queryOne<any>('SELECT COUNT(*) AS total FROM payment_logs WHERE order_no = ?', [orderNo]);
  return {
    list,
    pagination: {
      page,
      pageSize,
      total: Number(countRow?.total || 0),
      totalPages: Math.ceil(Number(countRow?.total || 0) / pageSize),
    },
  };
}

export async function listAdminOrders(filters: {
  orderType?: string;
  status?: string;
  payStatus?: string;
  grantStatus?: string;
  keyword?: string;
  userId?: number;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, Math.trunc(filters.page || 1));
  const pageSize = Math.min(Math.max(1, Math.trunc(filters.pageSize || 20)), 100);
  const offset = (page - 1) * pageSize;
  let where = '1=1';
  const params: any[] = [];

  if (filters.orderType) {
    where += ' AND o.order_type = ?';
    params.push(filters.orderType);
  }
  if (filters.status) {
    where += ' AND o.status = ?';
    params.push(filters.status);
  }
  if (filters.payStatus) {
    where += ' AND o.pay_status = ?';
    params.push(filters.payStatus);
  }
  if (filters.grantStatus) {
    where += ' AND o.grant_status = ?';
    params.push(filters.grantStatus);
  }
  if (filters.userId) {
    where += ' AND o.user_id = ?';
    params.push(filters.userId);
  }
  if (filters.keyword) {
    where += ' AND (o.order_no LIKE ? OR o.product_name LIKE ? OR u.nickname LIKE ? OR o.wx_transaction_id LIKE ?)';
    const keyword = `%${filters.keyword}%`;
    params.push(keyword, keyword, keyword, keyword);
  }

  const rows = await query<any>(
    `SELECT o.*, u.nickname, u.openid, mp.name AS member_plan_name, pp.name AS point_package_name
       FROM member_orders o
       JOIN users u ON u.id = o.user_id
       LEFT JOIN member_plans mp ON mp.id = o.member_plan_id
       LEFT JOIN point_packages pp ON pp.id = o.product_id
      WHERE ${where}
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );
  const countRow = await queryOne<any>(`SELECT COUNT(*) AS total FROM member_orders o JOIN users u ON u.id = o.user_id WHERE ${where}`, params);
  const list = rows.map(row => {
    const order = normalizeOrderRow(row);
    return {
      ...formatOrderForApi(order, {
        nickname: row.nickname,
        openid: row.openid,
        memberPlanName: row.member_plan_name || '',
        pointPackageName: row.point_package_name || '',
      }),
      wxTransactionId: order.wxTransactionId,
    };
  });
  return {
    list,
    pagination: {
      page,
      pageSize,
      total: Number(countRow?.total || 0),
      totalPages: Math.ceil(Number(countRow?.total || 0) / pageSize),
    },
  };
}

export async function getAdminOrderDetail(orderNo: string) {
  const row = await queryOne<any>(
    `SELECT o.*, u.nickname, u.openid, u.phone, mp.name AS member_plan_name, pp.name AS point_package_name
       FROM member_orders o
       JOIN users u ON u.id = o.user_id
       LEFT JOIN member_plans mp ON mp.id = o.member_plan_id
       LEFT JOIN point_packages pp ON pp.id = o.product_id
      WHERE o.order_no = ?`,
    [orderNo],
  );
  if (!row) {
    throw Object.assign(new Error('订单不存在'), { code: ErrorCodes.ORDER_NOT_FOUND });
  }
  const order = normalizeOrderRow(row);
  const paymentLogs = await listPaymentLogs(orderNo, { page: 1, pageSize: 50 });
  const pointLogs = await query<any>(
    'SELECT * FROM point_logs WHERE source = ? AND ref_id = ? ORDER BY created_at DESC',
    ['wechat_pay', orderNo],
  );
  const memberships = await query<any>(
    `SELECT um.*, mp.name AS plan_name, mv.name AS version_name, mv.version_key
       FROM user_memberships um
       LEFT JOIN member_plans mp ON mp.id = um.plan_id
       LEFT JOIN member_versions mv ON mv.id = um.version_id
      WHERE um.order_id = ?
      ORDER BY um.created_at DESC`,
    [order.id],
  );
  return {
    order: {
      ...formatOrderForApi(order, {
        nickname: row.nickname,
        openid: row.openid,
        phone: row.phone,
        memberPlanName: row.member_plan_name || '',
        pointPackageName: row.point_package_name || '',
      }),
      wxTransactionId: order.wxTransactionId,
    },
    paymentLogs: paymentLogs.list,
    pointLogs,
    memberships,
  };
}

export async function regrantOrderBenefits(orderNo: string, adminUserId: number) {
  const order = await getOrderByNo(orderNo);
  if (!order) {
    throw Object.assign(new Error('订单不存在'), { code: ErrorCodes.ORDER_NOT_FOUND });
  }

  await writePaymentLog(null, {
    orderNo,
    userId: order.userId,
    channel: 'wechat_jsapi',
    eventType: 'regrant_attempt',
    status: 'success',
    message: '管理员尝试重新发放权益',
    wxTransactionId: order.wxTransactionId || '',
    wxTradeState: order.wxTradeState || '',
    rawSummary: { adminUserId, grantStatus: order.grantStatus, payStatus: order.payStatus },
  });

  if (order.payStatus !== 'paid') {
    const message = '订单未支付，不能重新发放权益';
    await writePaymentLog(null, {
      orderNo,
      userId: order.userId,
      channel: 'wechat_jsapi',
      eventType: 'regrant_failed',
      status: 'failed',
      message,
      wxTransactionId: order.wxTransactionId || '',
      wxTradeState: order.wxTradeState || '',
      rawSummary: { adminUserId, grantStatus: order.grantStatus, payStatus: order.payStatus },
    });
    throw Object.assign(new Error(message), { code: ErrorCodes.ORDER_STATUS_INVALID });
  }

  if (order.grantStatus === 'granted') {
    const message = '权益已发放，无需重复发放';
    await writePaymentLog(null, {
      orderNo,
      userId: order.userId,
      channel: 'wechat_jsapi',
      eventType: 'regrant_failed',
      status: 'failed',
      message,
      wxTransactionId: order.wxTransactionId || '',
      wxTradeState: order.wxTradeState || '',
      rawSummary: { adminUserId, grantStatus: order.grantStatus, payStatus: order.payStatus },
    });
    return { order: formatOrderForApi(order), regranted: false, message };
  }

  if (!['pending', 'failed'].includes(order.grantStatus)) {
    const message = `当前发放状态 ${order.grantStatus} 不允许重新发放`;
    await writePaymentLog(null, {
      orderNo,
      userId: order.userId,
      channel: 'wechat_jsapi',
      eventType: 'regrant_failed',
      status: 'failed',
      message,
      wxTransactionId: order.wxTransactionId || '',
      wxTradeState: order.wxTradeState || '',
      rawSummary: { adminUserId, grantStatus: order.grantStatus, payStatus: order.payStatus },
    });
    throw Object.assign(new Error(message), { code: ErrorCodes.ORDER_STATUS_INVALID });
  }

  const grantResult = await grantOrderBenefits(orderNo);
  if (!grantResult.success) {
    await updateOrderByNo(null, orderNo, { grant_status: 'failed', grant_message: grantResult.message });
    await writePaymentLog(null, {
      orderNo,
      userId: order.userId,
      channel: 'wechat_jsapi',
      eventType: 'regrant_failed',
      status: 'failed',
      message: grantResult.message,
      wxTransactionId: order.wxTransactionId || '',
      wxTradeState: order.wxTradeState || '',
      rawSummary: { adminUserId, grantStatus: order.grantStatus, payStatus: order.payStatus },
    });
    throw Object.assign(new Error(grantResult.message), { code: ErrorCodes.PAY_GRANT_FAILED });
  }

  const freshOrder = await getOrderByNo(orderNo);
  await writePaymentLog(null, {
    orderNo,
    userId: order.userId,
    channel: 'wechat_jsapi',
    eventType: 'regrant_success',
    status: 'success',
    message: '权益重新发放成功',
    wxTransactionId: order.wxTransactionId || '',
    wxTradeState: order.wxTradeState || '',
    rawSummary: { adminUserId, grantStatus: freshOrder?.grantStatus || 'granted', payStatus: freshOrder?.payStatus || order.payStatus },
  });

  return {
    order: freshOrder ? formatOrderForApi(freshOrder) : null,
    regranted: true,
    message: '权益重新发放成功',
  };
}

async function grantOrderBenefits(orderNo: string): Promise<{ success: boolean; message: string }> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const order = await getOrderForUpdate(conn, orderNo);
    if (!order) {
      await conn.rollback();
      return { success: false, message: '订单不存在' };
    }
    if (order.grantStatus === 'granted') {
      await conn.commit();
      return { success: true, message: 'already granted' };
    }
    if (order.status !== 'paid' && order.payStatus !== 'paid') {
      await conn.rollback();
      return { success: false, message: '订单尚未支付' };
    }

    if (order.orderType === 'points') {
      const baseAmount = Math.max(0, Number(order.basePointsAmount || order.pointsAmount || 0));
      let bonusAmount = 0;
      let bonusApplied = false;
      if (baseAmount > 0) {
        const account = await lockPointAccountTx(conn, order.userId);
        const isFirstPointPurchase = order.pointsBonusType !== 'none'
          ? !(await hasGrantedPointOrderBefore(conn, order.userId, order.id))
          : false;
        if (isFirstPointPurchase && order.pointsBonusType !== 'none') {
          bonusAmount = order.pointsBonusType === 'double'
            ? baseAmount
            : Math.max(0, Number(order.pointsBonusAmount || 0));
          bonusApplied = bonusAmount > 0;
        }
        const amount = baseAmount + bonusAmount;
        await applyPointChangeTx(conn, account, {
          userId: order.userId,
          amount,
          source: 'wechat_pay',
          refType: 'order_recharge',
          refId: order.orderNo,
          title: bonusApplied ? '购买积分套餐到账（含首充奖励）' : '购买积分套餐到账',
          remark: bonusApplied ? `${order.productName}，基础${baseAmount}积分，首充奖励${bonusAmount}积分` : order.productName,
        });
      }
      await conn.execute(
        `UPDATE member_orders
            SET points_amount = ?,
                base_points_amount = ?,
                points_bonus_amount = ?,
                points_bonus_applied = ?
          WHERE order_no = ?`,
        [baseAmount + bonusAmount, baseAmount, bonusAmount, bonusApplied ? 1 : 0, orderNo],
      );
    } else {
      const plan = await queryOne<any>(
        `SELECT p.*, v.version_key, v.id AS version_id
           FROM member_plans p
           JOIN member_versions v ON v.id = p.version_id
          WHERE p.id = ?`,
        [order.memberPlanId || order.planId || 0],
      );
      if (!plan) {
        await conn.rollback();
        return { success: false, message: '会员套餐不存在' };
      }

      const [membershipRows] = await conn.execute(
        `SELECT id, level_after, expire_at
           FROM user_memberships
          WHERE user_id = ? AND status = 'active' AND expire_at > NOW(3)
          ORDER BY expire_at DESC
          LIMIT 1
          FOR UPDATE`,
        [order.userId],
      ) as any;
      const currentMembership = membershipRows?.[0] || null;
      const startFrom = currentMembership?.expire_at && new Date(currentMembership.expire_at).getTime() > Date.now()
        ? new Date(currentMembership.expire_at)
        : new Date();
      const expireAt = addDays(startFrom, Number(order.memberDurationDays || plan.duration_days || 0));
      const levelAfter = String(plan.version_key || 'pro');
      const levelBefore = String(currentMembership?.level_after || 'free');

      const existingMembership = await queryOne<any>('SELECT id FROM user_memberships WHERE order_id = ?', [order.id]);
      let membershipId = Number(existingMembership?.id || 0);
      if (!existingMembership) {
        const [membershipResult] = await conn.execute(
          `INSERT INTO user_memberships
           (user_id, version_id, plan_id, order_id, level_before, level_after, status, started_at, expire_at, source, auto_renew, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'active', NOW(3), ?, 'purchase', 0, NOW(3))`,
          [order.userId, plan.version_id, plan.id, order.id, levelBefore, levelAfter, expireAt],
        );
        membershipId = Number((membershipResult as any).insertId || 0);
      }

      await conn.execute(
        `INSERT INTO user_assets
         (user_id, points_balance, total_points_earned, total_points_spent, membership_level, membership_expire_at, created_at, updated_at)
         VALUES (?, 0, 0, 0, ?, ?, NOW(3), NOW(3))
         ON DUPLICATE KEY UPDATE membership_level = VALUES(membership_level), membership_expire_at = VALUES(membership_expire_at), updated_at = NOW(3)`,
        [order.userId, levelAfter, expireAt],
      );

      const pointRule = await resolveMemberPlanPointRule(plan.id);
      const totalPoints = Number(pointRule?.immediate_points || 0) + Number(pointRule?.gift_points || 0);
      if (totalPoints > 0) {
        const account = await lockPointAccountTx(conn, order.userId);
        await applyPointChangeTx(conn, account, {
          userId: order.userId,
          amount: totalPoints,
          source: 'wechat_pay',
          refType: 'member_purchase_bonus',
          refId: order.orderNo,
          title: '购买会员套餐赠送积分',
          remark: order.productName,
        });
      }
      if (membershipId && Number(pointRule?.monthly_points || 0) > 0) {
        await grantDueMembershipMonthlyPointsTx(conn, {
          membershipId,
          userId: order.userId,
          orderNo: order.orderNo,
          planName: order.productName || plan.name,
          durationDays: Number(order.memberDurationDays || plan.duration_days || 0),
          totalPoints: Number(pointRule?.total_points || 0),
          immediatePoints: Number(pointRule?.immediate_points || 0),
          monthlyPoints: Number(pointRule?.monthly_points || 0),
          giftPoints: Number(pointRule?.gift_points || 0),
          grantMode: String(pointRule?.grant_mode || 'immediate'),
          startedAt: new Date(),
          expireAt,
        });
      }
    }

    await conn.execute(
      `UPDATE member_orders
          SET grant_status = 'granted',
              grant_message = '',
              grant_at = COALESCE(grant_at, NOW(3)),
              status = 'paid',
              pay_status = 'paid',
              paid_at = COALESCE(paid_at, NOW(3)),
              updated_at = NOW(3)
        WHERE order_no = ?`,
      [orderNo],
    );

    await conn.commit();

    if (order.orderType === 'membership') {
      try {
        await grantInviteMemberPurchaseReward(order.userId, order.id);
      } catch (error) {
        const errMsg = (error as any)?.message || '未知错误';
        console.error(`[payment-order] Invite reward failed for order ${order.orderNo}, user ${order.userId}:`, errMsg);
        // 记录失败日志，供后续人工或自动补发
        await writePaymentLog(null, {
          orderNo,
          userId: order.userId,
          channel: 'wechat_jsapi',
          eventType: 'invite_reward_failed',
          status: 'failed',
          message: `邀请奖励发放失败: ${errMsg}`,
          rawSummary: { orderId: order.id },
        });
      }
    }

    return { success: true, message: 'granted' };
  } catch (error: any) {
    try { await conn.rollback(); } catch {}
    return { success: false, message: error?.message || '权益发放失败' };
  } finally {
    conn.release();
  }
}

function summarizeNotifyPayload(payload: any): any {
  if (!payload || typeof payload !== 'object') return {};
  return {
    id: payload.id,
    create_time: payload.create_time,
    event_type: payload.event_type,
    resource_type: payload.resource_type,
  };
}

function summarizeNotifyData(data: any): any {
  if (!data || typeof data !== 'object') return {};
  return {
    appid: data.appid,
    mchid: data.mchid,
    out_trade_no: data.out_trade_no,
    transaction_id: data.transaction_id,
    trade_state: data.trade_state,
    amount: data.amount ? { total: data.amount.total, currency: data.amount.currency } : undefined,
    payer: data.payer ? { openid: data.payer.openid } : undefined,
    success_time: data.success_time,
  };
}

function summarizePrepayResponse(response: any): any {
  if (!response || typeof response !== 'object') return {};
  return {
    prepay_id: response.prepay_id,
    code_url: response.code_url,
  };
}

function validateWechatPaidResult(order: OrderRecord, response: any, cfg: { appId: string; mchId: string }) {
  const amountTotal = Number(response?.amount?.total || 0);
  if (amountTotal !== order.amountTotal) {
    throw Object.assign(new Error('微信支付金额校验失败'), { code: ErrorCodes.WECHAT_AMOUNT_MISMATCH });
  }
  if (String(response?.appid || '') !== cfg.appId) {
    throw Object.assign(new Error('微信支付 appid 校验失败'), { code: ErrorCodes.WECHAT_APPID_MISMATCH });
  }
  if (String(response?.mchid || '') !== cfg.mchId) {
    throw Object.assign(new Error('微信支付 mchid 校验失败'), { code: ErrorCodes.WECHAT_MCHID_MISMATCH });
  }
}

function mapWechatTradeState(tradeState: string): string {
  switch (tradeState) {
    case 'SUCCESS':
      return 'paid';
    case 'CLOSED':
      return 'closed';
    case 'REVOKED':
      return 'cancelled';
    case 'USERPAYING':
      return 'paying';
    case 'NOTPAY':
    case 'PAYERROR':
      return 'failed';
    default:
      return 'failed';
  }
}

/**
 * 启动时恢复：处理已支付但权益未发放的订单。
 * 这些订单可能在通知处理期间因进程崩溃而中断，需要补发权益。
 */
export async function recoverPendingGrants(): Promise<{ recovered: number; failed: number }> {
  // 注意：通知处理流程中 pay_status 先被设为 'paid'，status 在 grant 成功后才更新为 'paid'。
  // 如果在 pay_status 更新后、grant 执行前崩溃，status 可能仍是 'paying' 或 'created'。
  // 因此必须用 pay_status 而非 status 作为筛选条件。
  const orders = await query<{ order_no: string }>(
    "SELECT order_no FROM member_orders WHERE pay_status = 'paid' AND grant_status = 'pending'",
  );
  let recovered = 0;
  let failed = 0;
  for (const row of orders) {
    try {
      const result = await grantOrderBenefits(row.order_no);
      if (result.success) {
        recovered++;
      } else {
        failed++;
        console.error(`[PaymentRecovery] 订单 ${row.order_no} 权益补发失败: ${result.message}`);
      }
    } catch (err: any) {
      failed++;
      console.error(`[PaymentRecovery] 订单 ${row.order_no} 权益补发异常:`, err?.message || err);
    }
  }
  if (recovered > 0 || failed > 0) {
    console.log(`[PaymentRecovery] 启动恢复完成: ${recovered} 笔补发成功, ${failed} 笔失败`);
  }
  return { recovered, failed };
}
