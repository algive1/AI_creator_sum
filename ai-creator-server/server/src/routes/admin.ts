// src/routes/admin.ts
import rateLimit from 'express-rate-limit';
import { Router, Request, Response } from 'express';
import { adminAuthMiddleware } from '../middleware/auth';
import { queryOne, query, getConnection } from '../utils/db';
import { preloadStorageConfigs } from '../services/storage/storage-config-loader';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';

const router = Router();
const loginLimiter = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false, message: { code: 429, message: '登录尝试过于频繁，请稍后重试', data: null } });

// ===== 认证 =====
router.post('/auth/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    const bcrypt = require('bcryptjs');
    const user = await queryOne<any>('SELECT * FROM admin_users WHERE username = ? AND status = ?', [username, 'active']);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) { error(res, 401, '用户名或密码错误', 401); return; }
    if (user.role_key !== 'super_admin') { error(res, ErrorCodes.FORBIDDEN, '仅超级管理员可登录后台', 403); return; }
    const jwt = require('jsonwebtoken');
    const cfg = require('../utils/config').config;
    const token = jwt.sign({ userId: user.id, role: 'super_admin' }, cfg.jwt.secret, { expiresIn: cfg.jwt.expiresIn });
    await query('UPDATE admin_users SET last_login_at = NOW(3), last_login_ip = ? WHERE id = ?', [req.ip || '', user.id]);
    success(res, { token, adminUser: { id: user.id, nickname: user.nickname, roleKey: user.role_key } });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '登录失败'); }
});

// ===== 数据看板 =====
router.get('/stats/dashboard', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [newUsers] = await query<any>('SELECT COUNT(*) as cnt FROM users WHERE DATE(created_at) = ?', [today]);
    const [totalUsers] = await query<any>('SELECT COUNT(*) as cnt FROM users');
    const [payingMembers] = await query<any>("SELECT COUNT(DISTINCT user_id) as cnt FROM user_memberships WHERE status = 'active' AND expire_at > NOW(3)");
    const [revenue] = await query<any>("SELECT COALESCE(SUM(paid_amount),0) as total FROM member_orders WHERE status='paid' AND DATE(paid_at) = ?", [today]);
    const [queuedTasks] = await query<any>("SELECT COUNT(*) as cnt FROM ai_tasks WHERE status IN ('queued','processing')");
    const [todaySuccess] = await query<any>("SELECT COUNT(*) as cnt FROM ai_tasks WHERE status = 'completed' AND DATE(created_at) = ?", [today]);
    const [todayFailed] = await query<any>("SELECT COUNT(*) as cnt FROM ai_tasks WHERE status = 'failed' AND DATE(created_at) = ?", [today]);
    const [todayPoints] = await query<any>("SELECT COALESCE(SUM(ABS(amount)),0) as total FROM point_logs WHERE type = 'spend' AND DATE(created_at) = ?", [today]);
    const [pendingAudit] = await query<any>('SELECT COUNT(*) as cnt FROM audit_logs WHERE audit_result = ?', ['pending']);
    success(res, {
      totalUsers: totalUsers?.cnt || 0,
      todayNewUsers: newUsers?.cnt || 0,
      payingMembers: payingMembers?.cnt || 0,
      todayRevenue: revenue?.total || 0,
      queuedTasks: queuedTasks?.cnt || 0,
      todaySuccess: todaySuccess?.cnt || 0,
      todayFailed: todayFailed?.cnt || 0,
      todayPointsSpent: todayPoints?.total || 0,
      pendingAudits: pendingAudit?.cnt || 0,
    });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取看板失败'); }
});

// ===== 用户管理 =====
router.get('/users', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { keyword, status, page, pageSize } = req.query as any;
    const pg = page ? parseInt(page) : 1; const ps = Math.min(pageSize ? parseInt(pageSize) : 20, 100); const off = (pg - 1) * ps;
    let where = 'u.deleted_at IS NULL'; const p: any[] = [];
    if (status) { where += ' AND u.status = ?'; p.push(status); }
    if (keyword) { where += ' AND (u.nickname LIKE ? OR u.id = ?)'; p.push('%' + keyword + '%', isNaN(parseInt(keyword)) ? 0 : parseInt(keyword)); }
    const list = await query<any>(
      `SELECT u.id, u.nickname, u.avatar_url, u.openid, u.phone, u.status, u.created_at, u.last_login_at,
              COALESCE(pa.balance,0) as points,
              COALESCE(ua.total_creations,0) as creations,
              COALESCE(um.level_after, ua.membership_level, 'free') as member_level,
              ua.membership_expire_at as member_expire_at,
              COALESCE(tc.image_creations, 0) as image_creations,
              COALESCE(tc.video_creations, 0) as video_creations,
              COALESCE(pp.paid_points, 0) as paid_points,
              COALESCE(fp.free_points, 0) as free_points
         FROM users u
         LEFT JOIN point_accounts pa ON pa.user_id = u.id
         LEFT JOIN user_assets ua ON ua.user_id = u.id
         LEFT JOIN (
           SELECT m.user_id, m.level_after
             FROM user_memberships m
             JOIN (
               SELECT user_id, MAX(expire_at) AS expire_at
                 FROM user_memberships
                WHERE status='active' AND expire_at > NOW(3)
                GROUP BY user_id
             ) latest ON latest.user_id = m.user_id AND latest.expire_at = m.expire_at
            WHERE m.status='active'
         ) um ON um.user_id = u.id
         LEFT JOIN (
           SELECT user_id,
                  SUM(CASE WHEN task_type = 'image' THEN 1 ELSE 0 END) as image_creations,
                  SUM(CASE WHEN task_type = 'video' THEN 1 ELSE 0 END) as video_creations
             FROM ai_tasks
            WHERE status = 'completed'
            GROUP BY user_id
         ) tc ON tc.user_id = u.id
         LEFT JOIN (
           SELECT user_id, COALESCE(SUM(amount),0) as paid_points
             FROM point_logs WHERE type='earn' AND source IN ('wechat_pay','admin') GROUP BY user_id
         ) pp ON pp.user_id = u.id
         LEFT JOIN (
           SELECT user_id, COALESCE(SUM(amount),0) as free_points
             FROM point_logs WHERE type='earn' AND source IN ('signin_normal','signin_super','signin_makeup','ad_reward','invite_use_reward','invite_member_purchase_reward','register') GROUP BY user_id
         ) fp ON fp.user_id = u.id
        WHERE ${where}
        ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      [...p, ps, off],
    );
    const [cnt] = await query<any>('SELECT COUNT(*) as total FROM users u WHERE ' + where, p);
    const today = new Date().toISOString().split('T')[0];
    const [todayNew] = await query<any>('SELECT COUNT(*) as cnt FROM users WHERE DATE(created_at) = ?', [today]);
    const [memberCnt] = await query<any>("SELECT COUNT(DISTINCT user_id) as cnt FROM user_memberships WHERE status = 'active' AND expire_at > NOW(3)");
    const [bannedCnt] = await query<any>("SELECT COUNT(*) as cnt FROM users WHERE status = 'banned'");
    success(res, { stats: { totalUsers: cnt?.total || 0, todayNew: todayNew?.cnt || 0, memberUsers: memberCnt?.cnt || 0, bannedUsers: bannedCnt?.cnt || 0 }, list: list.map((u: any) => ({ userId: u.id, nickname: u.nickname, avatarUrl: u.avatar_url, openid: u.openid, phone: u.phone, points: u.points, paidPoints: u.paid_points, freePoints: u.free_points, memberLevel: u.member_level, memberExpireAt: u.member_expire_at, creations: u.creations, imageCreations: u.image_creations, videoCreations: u.video_creations, lastLoginAt: u.last_login_at, status: u.status, createdAt: u.created_at })), pagination: { page: pg, pageSize: ps, total: cnt?.total || 0, totalPages: Math.ceil((cnt?.total || 0) / ps) } });
  } catch (e: any) { console.error('[admin] users list failed:', e?.message || e); error(res, ErrorCodes.SERVER_ERROR, '获取用户列表失败'); }
});

router.put('/users/:id(\\d+)/status', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    if (!['normal', 'banned'].includes(status)) { error(res, ErrorCodes.PARAM_ERROR, 'Invalid status'); return; }
    await query('UPDATE users SET status = ?, updated_at = NOW(3) WHERE id = ?', [status, parseInt(req.params.id)]);
    await query('INSERT INTO admin_operation_logs (admin_user_id, action, target_type, target_id, created_at) VALUES (?, ?, ?, ?, NOW(3))', [req.user!.userId, status === 'banned' ? 'user.ban' : 'user.unban', 'user', req.params.id]);
    success(res, { userId: parseInt(req.params.id), status });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '操作失败'); }
});

// ===== 任务管理 =====
router.get('/tasks', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { taskType, status, keyword, page, pageSize } = req.query as any;
    const pg = page ? parseInt(page) : 1; const ps = Math.min(pageSize ? parseInt(pageSize) : 20, 100); const off = (pg - 1) * ps;
    let where = '1=1'; const p: any[] = [];
    if (taskType) { where += ' AND t.task_type = ?'; p.push(taskType); }
    if (status) { where += ' AND t.status = ?'; p.push(status); }
    if (keyword) { where += ' AND (t.title LIKE ? OR t.task_no LIKE ?)'; p.push('%' + keyword + '%', '%' + keyword + '%'); }
    const list = await query<any>(
      `SELECT t.id, t.task_no, t.user_id, t.task_type, t.title, t.status, t.progress, t.points_cost, t.points_refunded,
              t.fail_reason, t.created_at, t.completed_at, t.failed_at, t.actual_model_id,
              u.nickname, mt.tier_name, m.name AS model_name, p.name AS provider_name
         FROM ai_tasks t
         JOIN users u ON u.id = t.user_id
         LEFT JOIN model_tiers mt ON mt.id = t.tier_id
         LEFT JOIN ai_models m ON m.id = t.actual_model_id
         LEFT JOIN ai_model_providers p ON p.id = m.provider_id
        WHERE ${where}
        ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
      [...p, ps, off],
    );
    const [cnt] = await query<any>('SELECT COUNT(*) as total FROM ai_tasks t WHERE ' + where, p);
    success(res, { list: list.map((t: any) => ({ taskId: t.id, taskNo: t.task_no, userId: t.user_id, userNickname: t.nickname, taskType: t.task_type, title: t.title, status: t.status, progress: t.progress, pointsCost: t.points_cost, pointsRefunded: t.points_refunded, tierName: t.tier_name, modelName: t.model_name, providerName: t.provider_name, failReason: t.fail_reason, createdAt: t.created_at, completedAt: t.completed_at, failedAt: t.failed_at })), pagination: { page: pg, pageSize: ps, total: cnt?.total || 0, totalPages: Math.ceil((cnt?.total || 0) / ps) } });
  } catch (e: any) { console.error('[admin] tasks list failed:', e?.message || e); error(res, ErrorCodes.SERVER_ERROR, '获取任务列表失败'); }
});


// ===== 内容审核 =====
router.get('/audits', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { status, page, pageSize } = req.query as any;
    const pg = page ? parseInt(page) : 1; const ps = Math.min(pageSize ? parseInt(pageSize) : 20, 100); const off = (pg - 1) * ps;
    let where = '1=1'; const p: any[] = [];
    if (status) { where += ' AND a.audit_result = ?'; p.push(status); } else { where += " AND a.audit_result = 'pending'"; }
    const list = await query<any>(
      `SELECT a.id, a.task_id, a.audit_type, a.audit_result, a.risk_level, a.risk_label, a.created_at,
              t.title, u.nickname,
              (SELECT thumbnail_key FROM ai_task_outputs WHERE task_id = a.task_id ORDER BY id LIMIT 1) as thumbnail_url,
              (SELECT cos_key FROM ai_task_outputs WHERE task_id = a.task_id ORDER BY id LIMIT 1) as cdn_url
         FROM audit_logs a
         JOIN ai_tasks t ON t.id = a.task_id
         JOIN users u ON u.id = t.user_id
        WHERE ${where}
        ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      [...p, ps, off],
    );
    const [cnt] = await query<any>('SELECT COUNT(*) as total FROM audit_logs a WHERE ' + where, p);
    success(res, { list, pagination: { page: pg, pageSize: ps, total: cnt?.total || 0, totalPages: Math.ceil((cnt?.total || 0) / ps) } });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取审核列表失败'); }
});

router.post('/audits/:taskId(\\d+)/action', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { action, reason } = req.body;
    if (!['pass', 'reject'].includes(action)) { error(res, ErrorCodes.PARAM_ERROR, '无效操作'); return; }
    const taskId = parseInt(req.params.taskId);
    if (action === 'pass') {
      await query("UPDATE ai_tasks SET audit_status = 'passed', updated_at = NOW(3) WHERE id = ?", [taskId]);
      await query("INSERT INTO audit_logs (task_id, audit_type, audit_result, risk_level, reviewed_by, reviewed_at, created_at) VALUES (?, 'text', 'pass', 'low', ?, NOW(3), NOW(3))", [taskId, req.user!.userId]);
    } else {
      await query("UPDATE ai_tasks SET audit_status = 'rejected', audit_reason = ?, status = 'failed', updated_at = NOW(3) WHERE id = ?", [reason || '', taskId]);
      await query("INSERT INTO audit_logs (task_id, audit_type, audit_result, risk_label, reviewed_by, reviewed_at, created_at) VALUES (?, 'text', 'reject', ?, ?, NOW(3), NOW(3))", [taskId, reason || '违规', req.user!.userId]);
    }
    await query('INSERT INTO admin_operation_logs (admin_user_id, action, target_type, target_id, created_at) VALUES (?, ?, ?, ?, NOW(3))', [req.user!.userId, 'audit.' + action, 'audit', taskId.toString()]);
    success(res, { taskId, action });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '审核操作失败'); }
});


// GET /admin/users/:id detail
router.get('/users/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const uid = parseInt(req.params.id);
    const u = await queryOne<any>('SELECT * FROM users WHERE id = ?', [uid]);
    if (!u) { error(res, ErrorCodes.NOT_FOUND, 'User not found', 404); return; }
    const points = await queryOne<any>('SELECT * FROM point_accounts WHERE user_id = ?', [uid]);
    const memberships = await query<any>('SELECT um.*, mp.name as plan_name FROM user_memberships um JOIN member_plans mp ON mp.id = um.plan_id WHERE um.user_id = ? ORDER BY um.created_at DESC', [uid]);
    const pointLogs = await query<any>('SELECT * FROM point_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [uid]);
    const tasks = await query<any>('SELECT id, task_no, task_type, title, status, points_cost, created_at FROM ai_tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [uid]);
    success(res, { user: { id: u.id, nickname: u.nickname, avatarUrl: u.avatar_url, openid: u.openid, phone: u.phone, status: u.status, createdAt: u.created_at, lastLoginAt: u.last_login_at }, points, memberships, pointLogs, tasks });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取用户详情失败'); }
});

// PUT /admin/users/:id/points
router.put('/users/:id(\\d+)/points', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const uid = parseInt(req.params.id);
    const { amount, reason, remark } = req.body;
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount === 0) { error(res, ErrorCodes.PARAM_ERROR, '积分数量无效，请输入非零整数'); return; }
    const conn = await getConnection();
    try {
      await conn.beginTransaction();
      const [acc] = await conn.execute('SELECT balance, version FROM point_accounts WHERE user_id = ? FOR UPDATE', [uid]) as any;
      if (!acc[0]) { await conn.rollback(); error(res, 1005, 'Account not found'); return; }
      const balBefore = acc[0].balance; const balAfter = balBefore + amount;
      if (balAfter < 0) { await conn.rollback(); error(res, ErrorCodes.PARAM_ERROR, '余额不足扣减'); return; }
      const upd = amount > 0
        ? await conn.execute('UPDATE point_accounts SET balance = ?, total_earned = total_earned + ?, version = version + 1 WHERE user_id = ? AND version = ?', [balAfter, amount, uid, acc[0].version])
        : await conn.execute('UPDATE point_accounts SET balance = ?, total_spent = total_spent + ?, version = version + 1 WHERE user_id = ? AND version = ?', [balAfter, -amount, uid, acc[0].version]);
      if ((upd as any)?.affectedRows === 0) { await conn.rollback(); error(res, 429, '操作繁忙'); return; }
      await conn.execute('INSERT INTO point_logs (user_id, type, amount, balance_before, balance_after, source, ref_type, ref_id, title, remark, operator_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))', [uid, amount > 0 ? 'earn' : 'spend', amount, balBefore, balAfter, 'admin', 'admin_operation', 'adj_' + Date.now(), reason || 'Admin adjustment', remark || '', req.user!.userId]);
      await conn.execute('UPDATE user_assets SET points_balance = ?, updated_at = NOW(3) WHERE user_id = ?', [balAfter, uid]);
      await conn.execute('INSERT INTO admin_operation_logs (admin_user_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, NOW(3))', [req.user!.userId, 'user.adjust_points', 'user', uid.toString(), JSON.stringify({ amount, reason, remark })]);
      await conn.commit();
      success(res, { userId: uid, balanceAfter: balAfter });
    } catch { await conn.rollback(); throw new Error('adjust failed'); }
  } catch { error(res, ErrorCodes.SERVER_ERROR, '调整积分失败'); }
});

// GET /admin/tasks/:id detail
router.get('/tasks/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const tid = parseInt(req.params.id);
    const t = await queryOne<any>(
      `SELECT t.*, u.nickname, mt.tier_name, mt.tier_key, m.name AS actual_model_name,
              m.api_model_name, p.name AS provider_name, p.provider_type
         FROM ai_tasks t
         JOIN users u ON u.id = t.user_id
         LEFT JOIN model_tiers mt ON mt.id = t.tier_id
         LEFT JOIN ai_models m ON m.id = t.actual_model_id
         LEFT JOIN ai_model_providers p ON p.id = m.provider_id
        WHERE t.id = ?`,
      [tid],
    );
    if (!t) { error(res, ErrorCodes.NOT_FOUND, 'Task not found', 404); return; }
    const input = await queryOne<any>('SELECT * FROM ai_task_inputs WHERE task_id = ?', [tid]);
    const outputs = await query<any>(
      `SELECT o.*, f.file_no, f.provider, f.cdn_url, f.file_size, f.mime_type
         FROM ai_task_outputs o
         LEFT JOIN files f ON f.ref_type = 'task_output' AND CAST(f.ref_id AS UNSIGNED) = o.task_id AND f.storage_key = o.cos_key AND f.is_deleted = 0
        WHERE o.task_id = ?
        ORDER BY o.output_index`,
      [tid],
    );
    const logs = await query<any>('SELECT * FROM ai_task_logs WHERE task_id = ? ORDER BY created_at', [tid]);
    const callLogs = await query<any>(
      `SELECT l.id, l.task_id, l.model_id, l.provider_id, l.user_id, l.call_type, l.attempt_number,
              l.status_code, l.is_success, l.error_type, l.error_message, l.latency_ms, l.created_at,
              m.name AS model_name, p.name AS provider_name, p.provider_type
         FROM ai_model_call_logs l
         LEFT JOIN ai_models m ON m.id = l.model_id
         LEFT JOIN ai_model_providers p ON p.id = l.provider_id
        WHERE l.task_id = ?
        ORDER BY l.created_at`,
      [tid],
    );
    const audit = await query<any>('SELECT * FROM audit_logs WHERE task_id = ? ORDER BY created_at DESC', [tid]);
    const pointLogs = await query<any>(
      "SELECT type, amount, balance_before, balance_after, frozen_before, frozen_after, source, ref_type, title, created_at FROM point_logs WHERE ref_id = ? AND ref_type IN ('ai_task_freeze','ai_task_settle','ai_task_refund') ORDER BY created_at",
      [String(tid)],
    );
    success(res, { task: t, input, outputs, logs, callLogs, audits: audit, pointLogs, pointStatus: buildTaskPointStatus(t, pointLogs, logs) });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取任务详情失败'); }
});

// ===== 文件管理 =====

// GET /admin/files - 文件列表
router.get('/files', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { fileCategory, visibility, keyword, page, pageSize } = req.query as any;
    const pg = page ? parseInt(page) : 1; const ps = Math.min(pageSize ? parseInt(pageSize) : 20, 100); const off = (pg - 1) * ps;
    let where = 'f.is_deleted = 0'; const p: any[] = [];
    if (fileCategory) { where += ' AND f.file_category = ?'; p.push(fileCategory); }
    if (visibility) { where += ' AND f.visibility = ?'; p.push(visibility); }
    if (keyword) { where += ' AND (f.original_name LIKE ? OR f.file_no LIKE ?)'; p.push('%' + keyword + '%', '%' + keyword + '%'); }
    const list = await query<any>(`SELECT f.id, f.file_no, f.user_id, f.provider, f.original_name, f.mime_type, f.file_size, f.width, f.height, f.cdn_url, f.file_category, f.visibility, f.is_deleted, f.created_at, COALESCE(u.nickname, '') as nickname, (CASE WHEN f.ref_type = 'task_output' THEN CAST(f.ref_id AS UNSIGNED) ELSE NULL END) as task_id FROM files f LEFT JOIN users u ON u.id = f.user_id WHERE ${where} ORDER BY f.created_at DESC LIMIT ? OFFSET ?`, [...p, ps, off]);
    const [cnt] = await query<any>('SELECT COUNT(*) as total FROM files f WHERE ' + where, p);
    success(res, { list: list.map((f: any) => ({ id: f.id, fileNo: f.file_no, userId: f.user_id, nickname: f.nickname, provider: f.provider, originalName: f.original_name, mimeType: f.mime_type, fileSize: f.file_size, width: f.width, height: f.height, cdnUrl: f.cdn_url, fileCategory: f.file_category, visibility: f.visibility, isDeleted: f.is_deleted, taskId: f.task_id, createdAt: f.created_at })), pagination: { page: pg, pageSize: ps, total: cnt?.total || 0, totalPages: Math.ceil((cnt?.total || 0) / ps) } });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取文件列表失败'); }
});

// GET /admin/files/stats - 文件统计
router.get('/files/stats', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    const [total] = await query<any>('SELECT COUNT(*) as cnt FROM files WHERE is_deleted = 0');
    const [totalSize] = await query<any>('SELECT COALESCE(SUM(file_size),0) as total FROM files WHERE is_deleted = 0');
    const byCategory = await query<any>('SELECT file_category, COUNT(*) as cnt FROM files WHERE is_deleted = 0 GROUP BY file_category');
    const byProvider = await query<any>('SELECT provider, COUNT(*) as cnt FROM files WHERE is_deleted = 0 GROUP BY provider');
    success(res, { totalFiles: total?.cnt || 0, totalSize: totalSize?.total || 0, byCategory, byProvider });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取文件统计失败'); }
});

// DELETE /admin/files/:id
router.delete('/files/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const fid = parseInt(req.params.id);
    const file = await queryOne<any>('SELECT * FROM files WHERE id = ?', [fid]);
    if (!file) { error(res, ErrorCodes.NOT_FOUND, 'File not found', 404); return; }
    await query('UPDATE files SET is_deleted = 1, deleted_at = NOW(3), updated_at = NOW(3) WHERE id = ?', [fid]);
    await query('INSERT INTO file_delete_logs (file_id, user_id, operator_type, delete_type, storage_key, created_at) VALUES (?, ?, ?, ?, ?, NOW(3))', [fid, req.user!.userId, 'admin', 'soft', file.storage_key]);
    await query('INSERT INTO admin_operation_logs (admin_user_id, action, target_type, target_id, created_at) VALUES (?, ?, ?, ?, NOW(3))', [req.user!.userId, 'file.delete', 'file', fid.toString()]);
    success(res, { fileId: fid, deleted: true });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '删除文件失败'); }
});

// POST /admin/files/batch-delete
router.post('/files/batch-delete', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const ids: number[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (ids.length === 0) { error(res, ErrorCodes.PARAM_ERROR, 'ids 不能为空'); return; }
    if (ids.length > 100) { error(res, ErrorCodes.PARAM_ERROR, '单次最多删除 100 个文件'); return; }
    const files = await query<any>('SELECT id, storage_key FROM files WHERE id IN (' + ids.map(() => '?').join(',') + ') AND is_deleted = 0', ids);
    const pl = ids.map(() => '?').join(',');
    await query(`UPDATE files SET is_deleted = 1, deleted_at = NOW(3), updated_at = NOW(3) WHERE id IN (${pl}) AND is_deleted = 0`, ids);
    for (const f of files) {
      await query('INSERT INTO file_delete_logs (file_id, user_id, operator_type, delete_type, storage_key, created_at) VALUES (?, ?, ?, ?, ?, NOW(3))', [f.id, req.user!.userId, 'admin', 'soft', f.storage_key]);
    }
    await query('INSERT INTO admin_operation_logs (admin_user_id, action, target_type, target_id, created_at) VALUES (?, ?, ?, ?, NOW(3))', [req.user!.userId, 'file.batch_delete', 'file', ids.join(',')]);
    success(res, { deleted: ids.length });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '批量删除文件失败'); }
});

// PUT /admin/files/:id/visibility
router.put('/files/:id(\\d+)/visibility', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const fid = parseInt(req.params.id);
    const { visibility } = req.body;
    if (!['public', 'private'].includes(visibility)) { error(res, ErrorCodes.PARAM_ERROR, 'Invalid visibility'); return; }
    await query('UPDATE files SET visibility = ?, updated_at = NOW(3) WHERE id = ?', [visibility, fid]);
    await query('INSERT INTO admin_operation_logs (admin_user_id, action, target_type, target_id, created_at) VALUES (?, ?, ?, ?, NOW(3))', [req.user!.userId, 'file.update_visibility', 'file', fid.toString()]);
    success(res, { fileId: fid, visibility });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '操作失败'); }
});



// ===== System Configuration =====

function weightedLength(value: string): number {
  return Array.from(value).reduce((total, char) => total + (char.charCodeAt(0) > 127 ? 2 : 1), 0);
}

function parseConfigBoolean(value: any, key: string): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const text = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(text)) return 'true';
  if (['false', '0', 'no', 'off'].includes(text)) return 'false';
  throw new Error(`${key} 必须为 boolean`);
}

function assertWeightedMax(value: string, max: number, label: string): void {
  if (weightedLength(value) > max) {
    throw new Error(`${label}长度超出限制`);
  }
}

function validateCustomerServiceSettings(body: Record<string, any>): Record<string, string> {
  const allowedKeys = new Set([
    'customer_service.enabled',
    'customer_service.title',
    'customer_service.subtitle',
    'customer_service.icon',
    'customer_service.show_in_profile',
    'customer_service.session_from',
    'customer_service.show_message_card',
    'customer_service.send_message_title',
    'customer_service.send_message_path',
    'customer_service.send_message_img',
  ]);
  const sanitized: Record<string, string> = {};
  for (const key of Object.keys(body || {})) {
    if (/token|secret|api_key|apikey|private/i.test(key)) {
      throw new Error('Customer service settings cannot save sensitive fields');
    }
    if (!allowedKeys.has(key)) {
      throw new Error(`不支持的客服入口配置项 ${key}`);
    }
  }

  for (const key of ['customer_service.enabled', 'customer_service.show_in_profile', 'customer_service.show_message_card']) {
    if (body[key] !== undefined) sanitized[key] = parseConfigBoolean(body[key], key);
  }

  if (body['customer_service.title'] !== undefined) {
    const value = String(body['customer_service.title'] || '').trim();
    if (!value) throw new Error('入口名称不能为空');
    assertWeightedMax(value, 24, '入口名称');
    sanitized['customer_service.title'] = value;
  }

  if (body['customer_service.subtitle'] !== undefined) {
    const value = String(body['customer_service.subtitle'] || '').trim();
    assertWeightedMax(value, 80, '入口描述');
    sanitized['customer_service.subtitle'] = value;
  }

  if (body['customer_service.icon'] !== undefined) {
    const value = String(body['customer_service.icon'] || '').trim();
    if (!value) throw new Error('图标不能为空');
    if (value.length > 64) throw new Error('Icon is too long');
    sanitized['customer_service.icon'] = value;
  }

  if (body['customer_service.session_from'] !== undefined) {
    const value = String(body['customer_service.session_from'] || '').trim();
    if (value.length > 1024) throw new Error('sessionFrom is too long');
    if (/<\s*script/i.test(value)) throw new Error('sessionFrom 包含危险字符');
    sanitized['customer_service.session_from'] = value;
  }

  if (body['customer_service.send_message_title'] !== undefined) {
    const value = String(body['customer_service.send_message_title'] || '').trim();
    assertWeightedMax(value, 64, '卡片标题');
    sanitized['customer_service.send_message_title'] = value;
  }

  if (body['customer_service.send_message_path'] !== undefined) {
    const value = String(body['customer_service.send_message_path'] || '').trim();
    if (value && !value.startsWith('/')) throw new Error('Card path must start with /');
    sanitized['customer_service.send_message_path'] = value;
  }

  if (body['customer_service.send_message_img'] !== undefined) {
    const value = String(body['customer_service.send_message_img'] || '').trim();
    if (value && !/^https:\/\//i.test(value)) throw new Error('卡片图片必须是 https:// 开头的 URL');
    sanitized['customer_service.send_message_img'] = value;
  }

  return sanitized;
}

function validateMiniappHelpSettings(body: Record<string, any>): Record<string, string> {
  const allowedKeys = new Set([
    'miniapp_help.enabled',
    'miniapp_help.title',
    'miniapp_help.content_html',
  ]);
  const sanitized: Record<string, string> = {};
  for (const key of Object.keys(body || {})) {
    if (/token|secret|api_key|apikey|private/i.test(key)) {
      throw new Error('Help settings cannot save sensitive fields');
    }
    if (!allowedKeys.has(key)) {
      throw new Error(`不支持的使用帮助配置项 ${key}`);
    }
  }

  if (body['miniapp_help.enabled'] !== undefined) {
    sanitized['miniapp_help.enabled'] = parseConfigBoolean(body['miniapp_help.enabled'], 'miniapp_help.enabled');
  }

  if (body['miniapp_help.title'] !== undefined) {
    const value = String(body['miniapp_help.title'] || '').trim();
    if (!value) throw new Error('使用帮助标题不能为空');
    assertWeightedMax(value, 40, '使用帮助标题');
    sanitized['miniapp_help.title'] = value;
  }

  if (body['miniapp_help.content_html'] !== undefined) {
    const value = String(body['miniapp_help.content_html'] || '').trim();
    if (value.length > 50000) throw new Error('使用帮助内容超出长度限制');
    if (/<\s*script/i.test(value) || /javascript\s*:/i.test(value)) throw new Error('使用帮助内容包含危险脚本');
    sanitized['miniapp_help.content_html'] = value;
  }

  return sanitized;
}

function validateMiniappVisualAssetSettings(body: Record<string, any>): Record<string, string> {
  const allowedKeys = new Set([
    'miniapp_visual_assets.home_banner_url',
    'miniapp_visual_assets.home_member_upsell_url',
    'miniapp_visual_assets.inspiration_banner_url',
    'miniapp_visual_assets.comic_banner_url',
    'miniapp_visual_assets.profile_member_offer_banner_url',
  ]);
  const sanitized: Record<string, string> = {};

  for (const key of Object.keys(body || {})) {
    if (/token|secret|api_key|apikey|private/i.test(key)) {
      throw new Error('Miniapp visual asset settings cannot save sensitive fields');
    }
    if (!allowedKeys.has(key)) {
      throw new Error(`不支持的小程序素材配置项 ${key}`);
    }
    const value = String(body[key] || '').trim();
    if (value && !/^https:\/\//i.test(value)) {
      throw new Error('小程序素材图片必须是 https:// 开头的 URL');
    }
    if (value.length > 1024) {
      throw new Error('小程序素材图片 URL 过长');
    }
    sanitized[key] = value;
  }

  return sanitized;
}

router.get('/settings/groups', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    const rows = await query<any>("SELECT config_group, COUNT(*) as total, SUM(is_secret) as secrets FROM system_configs WHERE config_group != 'payment' AND config_key != 'storage.type' GROUP BY config_group ORDER BY config_group");
    success(res, rows.map((r: any) => ({ group: r.config_group, total: r.total, secrets: r.secrets })));
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取分组失败'); }
});

router.put('/users/:id(\\d+)/membership', adminAuthMiddleware, async (req: Request, res: Response) => {
  const conn = await getConnection();
  try {
    const uid = parseInt(req.params.id);
    const { planId, durationDays, level } = req.body || {};
    const user = await queryOne<any>('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [uid]);
    if (!user) { error(res, ErrorCodes.NOT_FOUND, '用户不存在', 404); return; }

    await conn.beginTransaction();
    const current = await queryOne<any>(
      `SELECT ua.membership_level, um.level_after
         FROM users u
         LEFT JOIN user_assets ua ON ua.user_id = u.id
         LEFT JOIN user_memberships um ON um.user_id = u.id AND um.status = 'active' AND um.expire_at > NOW(3)
        WHERE u.id = ?
        ORDER BY um.expire_at DESC
        LIMIT 1`,
      [uid],
    );
    const levelBefore = String(current?.level_after || current?.membership_level || 'free');

    if (!planId || level === 'free') {
      await conn.execute("UPDATE user_memberships SET status = 'cancelled' WHERE user_id = ? AND status = 'active'", [uid]);
      await conn.execute(
        `INSERT INTO user_assets
         (user_id, points_balance, total_points_earned, total_points_spent, membership_level, membership_expire_at, created_at, updated_at)
         VALUES (?, 0, 0, 0, 'free', NULL, NOW(3), NOW(3))
         ON DUPLICATE KEY UPDATE membership_level = 'free', membership_expire_at = NULL, updated_at = NOW(3)`,
        [uid],
      );
      await conn.execute('INSERT INTO admin_operation_logs (admin_user_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, NOW(3))', [req.user!.userId, 'user.membership_free', 'user', String(uid), JSON.stringify({ levelBefore })]);
      await conn.commit();
      success(res, { userId: uid, memberLevel: 'free' });
      return;
    }

    const plan = await queryOne<any>(
      `SELECT p.*, v.version_key, v.id AS version_id
         FROM member_plans p
         JOIN member_versions v ON v.id = p.version_id
        WHERE p.id = ?`,
      [Number(planId)],
    );
    if (!plan) {
      await conn.rollback();
      error(res, ErrorCodes.NOT_FOUND, '会员套餐不存在', 404);
      return;
    }

    const days = Math.max(1, Math.min(Number(durationDays || plan.duration_days || 30), 3650));
    const expireAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const levelAfter = String(plan.version_key || 'pro');
    const orderNo = `ADM${Date.now()}${uid}`.slice(0, 32);
    const [orderResult] = await conn.execute(
      `INSERT INTO member_orders
       (order_no, user_id, order_type, plan_id, subject, amount, paid_amount, status, paid_at, expire_at, created_at, updated_at)
       VALUES (?, ?, 'membership', ?, ?, 0, 0, 'paid', NOW(3), ?, NOW(3), NOW(3))`,
      [orderNo, uid, plan.id, '管理员调整会员', expireAt],
    ) as any;
    const orderId = Number((orderResult as any)?.insertId || 0);

    await conn.execute("UPDATE user_memberships SET status = 'replaced' WHERE user_id = ? AND status = 'active'", [uid]);
    await conn.execute(
      `INSERT INTO user_memberships
       (user_id, version_id, plan_id, order_id, level_before, level_after, status, started_at, expire_at, source, auto_renew, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', NOW(3), ?, 'admin', 0, NOW(3))`,
      [uid, plan.version_id, plan.id, orderId, levelBefore, levelAfter, expireAt],
    );
    await conn.execute(
      `INSERT INTO user_assets
       (user_id, points_balance, total_points_earned, total_points_spent, membership_level, membership_expire_at, created_at, updated_at)
       VALUES (?, 0, 0, 0, ?, ?, NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE membership_level = VALUES(membership_level), membership_expire_at = VALUES(membership_expire_at), updated_at = NOW(3)`,
      [uid, levelAfter, expireAt],
    );
    await conn.execute('INSERT INTO admin_operation_logs (admin_user_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, NOW(3))', [req.user!.userId, 'user.adjust_membership', 'user', String(uid), JSON.stringify({ planId: plan.id, durationDays: days, levelBefore, levelAfter, orderNo })]);
    await conn.commit();
    success(res, { userId: uid, memberLevel: levelAfter, expireAt, planId: plan.id });
  } catch (err: any) {
    try { await conn.rollback(); } catch {}
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '调整会员失败');
  } finally {
    conn.release();
  }
});

router.get('/settings/logs', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { page, pageSize } = req.query as any;
    const pg = page ? parseInt(page) : 1; const ps = Math.min(pageSize ? parseInt(pageSize) : 20, 100); const off = (pg - 1) * ps;
    const list = await query<any>('SELECT l.id, l.config_group, l.config_key, l.action, l.old_value_masked, l.new_value_masked, l.ip_address, l.created_at, COALESCE(u.nickname, "") as admin_name FROM config_change_logs l LEFT JOIN admin_users u ON u.id = l.admin_user_id ORDER BY l.created_at DESC LIMIT ? OFFSET ?', [ps, off]);
    const [cnt] = await query<any>('SELECT COUNT(*) as total FROM config_change_logs');
    success(res, { list, pagination: { page: pg, pageSize: ps, total: cnt?.total || 0, totalPages: Math.ceil((cnt?.total || 0) / ps) } });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取日志失败'); }
});
router.get('/settings/status', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    const [total] = await query<any>('SELECT COUNT(*) as cnt FROM system_configs');
    const [secrets] = await query<any>('SELECT COUNT(*) as cnt FROM system_configs WHERE is_secret = 1');
    const groups = await query<any>("SELECT config_group, COUNT(*) as cnt FROM system_configs WHERE config_group != 'payment' AND config_key != 'storage.type' GROUP BY config_group");
    const wechatRow = await queryOne<any>("SELECT 1 FROM system_configs WHERE config_group = 'wechat' AND is_secret = 1 AND masked_value IS NOT NULL AND masked_value != '' LIMIT 1");
    const paymentRow = await queryOne<any>("SELECT 1 FROM system_configs WHERE config_group = 'wechat_pay' AND config_value != '' LIMIT 1");
    const storageRow = await queryOne<any>("SELECT 1 FROM system_configs WHERE config_key = 'storage.provider' AND config_value != '' LIMIT 1");
    success(res, {
      totalConfigs: total?.cnt || 0, secretConfigs: secrets?.cnt || 0,
      groups: groups.map((g: any) => ({ group: g.config_group, count: g.cnt })),
      wechatConfigured: !!wechatRow, paymentConfigured: !!paymentRow, storageConfigured: !!storageRow,
    });
  } catch { error(res, ErrorCodes.SERVER_ERROR, 'Failed to get settings status'); }
});
router.get('/settings/:group', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    if (req.params.group === 'payment') {
      error(res, ErrorCodes.NOT_FOUND, 'payment.* settings have been removed', 404);
      return;
    }
    const rows = await query<any>("SELECT config_key, config_value, value_type, is_secret, masked_value, description, sort_order FROM system_configs WHERE config_group = ? AND config_key != 'storage.type' ORDER BY sort_order", [req.params.group]);
    success(res, rows.map((r: any) => ({ key: r.config_key, value: r.is_secret ? '' : r.config_value, type: r.value_type, isSecret: !!r.is_secret, maskedValue: r.is_secret ? (r.masked_value || '****已配置****') : r.config_value, description: r.description })));
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取配置失败'); }
});

function rejectRemovedConfigKeys(group: string, values: Record<string, string>): void {
  if (group === 'payment') throw new Error('payment.* settings have been removed; use wechat_pay.*');
  for (const key of Object.keys(values || {})) {
    if (key.startsWith('payment.') || key === 'storage.type') {
      throw new Error(`${key} has been removed`);
    }
  }
}

router.post('/settings/:group', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { SettingsService } = require('../services/settings.service');
    const values = req.params.group === 'customer_service'
      ? validateCustomerServiceSettings(req.body as Record<string, any>)
      : req.params.group === 'miniapp_help'
        ? validateMiniappHelpSettings(req.body as Record<string, any>)
        : req.params.group === 'miniapp_visual_assets'
          ? validateMiniappVisualAssetSettings(req.body as Record<string, any>)
          : req.body as Record<string, string>;
    rejectRemovedConfigKeys(req.params.group, values);
    await SettingsService.setGroup(req.params.group, values, false, req.user!.userId);
    await preloadStorageConfigs();
    success(res, { saved: true });
  } catch (err: any) { error(res, ErrorCodes.PARAM_ERROR, err?.message || '保存失败'); }
});

router.post('/settings/:group/secure', adminAuthMiddleware, async (req: Request, res: Response) => {
    if (req.user!.role !== 'super_admin') { error(res, ErrorCodes.FORBIDDEN, 'Super admin only', 403); return; }
  try {
    const { SettingsService } = require('../services/settings.service');
    rejectRemovedConfigKeys(req.params.group, req.body as Record<string, string>);
    await SettingsService.setGroup(req.params.group, req.body as Record<string, string>, true, req.user!.userId);
    await preloadStorageConfigs();
    success(res, { saved: true });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '保存失败'); }
});



function buildTaskPointStatus(task: any, pointLogs: any[], taskLogs: any[]) {
  const hasFreeze = pointLogs.some(log => log.ref_type === 'ai_task_freeze');
  const hasSettle = pointLogs.some(log => log.ref_type === 'ai_task_settle');
  const hasRefund = pointLogs.some(log => log.ref_type === 'ai_task_refund') || Number(task.points_refunded || 0) > 0;
  const refundFailed = taskLogs.some(log => log.event === 'refund_failed');

  if (refundFailed) {
    return { key: 'refund_failed', label: '退款失败需人工处理', color: 'red' };
  }
  if (hasRefund || Number(task.points_refunded || 0) > 0) {
    return { key: 'refunded', label: '已退款', color: 'orange' };
  }
  if (task.status === 'completed' || hasSettle) {
    return { key: 'settled', label: '已结算', color: 'green' };
  }
  if (hasFreeze && ['pending', 'queued', 'processing'].includes(task.status)) {
    return { key: 'frozen', label: '已冻结', color: 'blue' };
  }
  return { key: 'unknown', label: '未知', color: 'default' };
}

export default router;
