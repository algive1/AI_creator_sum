import crypto from 'node:crypto';
import { query, queryOne } from '../utils/db';
import { assertActiveProject } from './project.service';
import { selectTierModel } from './tier-router.service';

const QUOTE_TTL_SECONDS = Math.min(900, Math.max(60, Number(process.env.TASK_QUOTE_TTL_SECONDS || 300)));

type QuoteTaskType = 'image' | 'video';

function stableValue(value: any): any {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result: Record<string, any>, key) => {
      if (value[key] !== undefined && key !== 'quoteId') result[key] = stableValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

function requestHash(value: any): string {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

function quoteRequestShape(taskType: QuoteTaskType, body: any, projectId: number) {
  return {
    taskType,
    projectId,
    featureKey: body.featureKey ? String(body.featureKey) : null,
    subType: String(body.subType || body.videoMode || (taskType === 'image' ? 'text2img' : 'text_to_video')),
    prompt: String(body.prompt || '').trim(),
    tierKey: body.tierKey ? String(body.tierKey) : null,
    tierId: body.tierId ? Number(body.tierId) : null,
    ratio: body.ratio || body.params?.ratio || null,
    duration: body.duration || body.params?.duration || null,
    quality: body.quality || body.resolution || body.params?.quality || body.params?.resolution || null,
    sizeMode: body.sizeMode || body.params?.sizeMode || null,
    customWidth: Number(body.customWidth || body.params?.customWidth || 0) || null,
    customHeight: Number(body.customHeight || body.params?.customHeight || 0) || null,
    resolutionPreset: body.resolutionPreset || body.resolution_preset || body.params?.resolutionPreset || null,
    sizeKey: body.sizeKey || body.size_key || body.params?.sizeKey || null,
    postprocessMode: body.postprocessMode || body.params?.postprocessMode || null,
    imageCount: Number(body.imageCount || body.params?.imageCount || 1),
    inputAssetIds: Array.isArray(body.inputAssetIds) ? body.inputAssetIds.map(Number).filter(Boolean) : [],
    uploadKeys: Array.isArray(body.uploadKeys) ? body.uploadKeys.map((value: any) => String(value)).sort() : [],
    referenceKeys: Array.isArray(body.referenceKeys) ? body.referenceKeys.map((value: any) => String(value)).sort() : [],
    inputAssets: stableValue(Array.isArray(body.inputAssets) ? body.inputAssets : []),
    params: stableValue(body.params || {}),
  };
}

async function validateQuoteAssets(userId: number, body: any): Promise<void> {
  const assetIds = [...new Set((Array.isArray(body?.inputAssetIds) ? body.inputAssetIds : [])
    .map(Number).filter((id: number) => Number.isInteger(id) && id > 0))].slice(0, 20);
  if (assetIds.length) {
    const row = await queryOne<any>(
      `SELECT COUNT(*) AS count FROM media_assets
        WHERE user_id = ? AND status = 'active' AND id IN (${assetIds.map(() => '?').join(',')})`,
      [userId, ...assetIds],
    );
    if (Number(row?.count || 0) !== assetIds.length) {
      throw Object.assign(new Error('部分输入资产不存在或已进入回收站'), { code: 1001 });
    }
  }

  const fileIds = [...new Set((Array.isArray(body?.uploadKeys) ? body.uploadKeys : [])
    .map((value: any) => typeof value === 'number' ? value : /^\d+$/.test(String(value || '').trim()) ? Number(value) : 0)
    .filter((id: number) => Number.isInteger(id) && id > 0))].slice(0, 20);
  if (fileIds.length) {
    const row = await queryOne<any>(
      `SELECT COUNT(*) AS count FROM files
        WHERE user_id = ? AND is_deleted = 0 AND id IN (${fileIds.map(() => '?').join(',')})`,
      [userId, ...fileIds],
    );
    if (Number(row?.count || 0) !== fileIds.length) {
      throw Object.assign(new Error('部分上传素材不存在或无权使用'), { code: 1001 });
    }
  }
}

export async function createTaskQuote(userId: number, body: any) {
  const taskType: QuoteTaskType = body?.taskType === 'video' ? 'video' : body?.taskType === 'image' ? 'image' : null as any;
  if (!taskType) throw Object.assign(new Error('taskType 必须为 image 或 video'), { code: 1001 });
  const prompt = String(body?.prompt || '').trim();
  if (!prompt) throw Object.assign(new Error('请输入提示词'), { code: 1001 });
  if (prompt.length > 2000) throw Object.assign(new Error('提示词最多 2000 字'), { code: 1001 });
  const tierKeyOrId = body?.tierId || body?.tierKey;
  if (!tierKeyOrId) throw Object.assign(new Error('请先选择模型档位'), { code: 1001 });
  const projectId = await assertActiveProject(userId, body?.projectId ? Number(body.projectId) : undefined);
  await validateQuoteAssets(userId, body);
  const subType = String(body.subType || body.videoMode || (taskType === 'image' ? 'text2img' : 'text_to_video'));
  const featureKey = String(body.featureKey || (taskType === 'image'
    ? subType === 'img2img' ? 'image_to_image' : subType === 'edit' ? 'image_edit' : 'image_create'
    : subType === 'image_to_video' ? 'image_to_video' : subType === 'video_edit' ? 'video_edit' : 'text_to_video'));
  const tier = await selectTierModel(featureKey, tierKeyOrId, userId, {
    ratio: body.ratio || body.params?.ratio,
    duration: body.duration || body.params?.duration,
    quality: body.quality || body.resolution || body.params?.quality || body.params?.resolution,
    imageCount: body.imageCount || body.params?.imageCount,
    sizeMode: body.sizeMode || body.params?.sizeMode,
    targetWidth: Number(body.customWidth || body.params?.customWidth || 0) || undefined,
    targetHeight: Number(body.customHeight || body.params?.customHeight || 0) || undefined,
    fromCustomPixels: Number(body.customWidth || body.params?.customWidth || 0) > 0 && Number(body.customHeight || body.params?.customHeight || 0) > 0,
    postprocessMode: body.postprocessMode || body.params?.postprocessMode,
    style: body.style || body.params?.style,
    cameraMove: body.cameraMove || body.params?.cameraMove,
    audioMode: body.audioMode || body.params?.audioMode,
    referenceImageCount: Array.isArray(body.uploadKeys) ? body.uploadKeys.length : 0,
  });
  const imageCount = taskType === 'image'
    ? Math.min(Math.max(1, Math.floor(Number(body.imageCount || body.params?.imageCount || 1))), Math.max(1, tier.capabilities.maxImages || 1))
    : 1;
  const pointsCost = Math.max(0, Math.floor(tier.pointsCost * imageCount));
  const account = await queryOne<any>('SELECT balance, frozen_balance FROM point_accounts WHERE user_id = ?', [userId]);
  if (!account) throw Object.assign(new Error('积分账户不存在'), { code: 1005 });
  const balance = Number(account.balance || 0);
  if (balance < pointsCost) {
    throw Object.assign(new Error('积分余额不足'), { code: 1002, data: { pointsCost, balance } });
  }
  const normalizedRequest = quoteRequestShape(taskType, body, projectId);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + QUOTE_TTL_SECONDS * 1000);
  const snapshot = {
    request: normalizedRequest,
    tierId: tier.tierId,
    tierKey: tier.tierKey,
    tierName: tier.tierName,
    basePointsCost: tier.basePointsCost,
    memberDiscountPercent: tier.memberDiscountPercent,
    memberDiscountApplied: tier.memberDiscountApplied,
    estimatedSeconds: taskType === 'video' ? 45 : 15,
  };
  await query(
    `INSERT INTO task_quotes (id, user_id, task_type, request_hash, points_cost, quote_snapshot, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3))`,
    [id, userId, taskType, requestHash(normalizedRequest), pointsCost, JSON.stringify(snapshot), expiresAt],
  );
  return { quoteId: id, projectId, taskType, pointsCost, pointsBalance: balance, expiresAt, ...snapshot };
}

export async function validateTaskQuote(userId: number, quoteId: string, taskType: QuoteTaskType, body: any) {
  const row = await queryOne<any>(
    'SELECT * FROM task_quotes WHERE id = ? AND user_id = ? AND task_type = ? LIMIT 1',
    [quoteId, userId, taskType],
  );
  if (!row) throw Object.assign(new Error('报价不存在，请重新获取'), { code: 1001 });
  if (row.consumed_task_id) throw Object.assign(new Error('报价已使用，请重新获取'), { code: 1001 });
  if (new Date(row.expires_at).getTime() <= Date.now()) throw Object.assign(new Error('报价已过期，请重新获取'), { code: 1001 });
  const snapshot = typeof row.quote_snapshot === 'string' ? JSON.parse(row.quote_snapshot) : row.quote_snapshot;
  const projectId = Number(body.projectId || snapshot?.request?.projectId || 0);
  const normalizedRequest = quoteRequestShape(taskType, body, projectId);
  if (requestHash(normalizedRequest) !== row.request_hash) throw Object.assign(new Error('生成参数已变化，请重新获取报价'), { code: 1001 });
  return { quoteId: row.id, projectId, pointsCost: Number(row.points_cost || 0), snapshot };
}

export async function consumeTaskQuote(userId: number, quoteId: string, taskId: number): Promise<void> {
  const result = await query<any>(
    `UPDATE task_quotes SET consumed_task_id = ?
      WHERE id = ? AND user_id = ? AND consumed_task_id IS NULL AND expires_at > NOW(3)`,
    [taskId, quoteId, userId],
  );
  if (Number(result[0]?.affectedRows || 0) === 0) {
    const existing = await queryOne<any>('SELECT consumed_task_id FROM task_quotes WHERE id = ? AND user_id = ?', [quoteId, userId]);
    if (Number(existing?.consumed_task_id || 0) !== taskId) throw new Error('报价消费状态写入失败');
  }
}
