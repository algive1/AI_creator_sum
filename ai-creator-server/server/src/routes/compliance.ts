import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { query, queryOne } from '../utils/db';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';

const router = Router();
const REQUIRED_TEXT = '我确认';

router.post('/confirm', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { scene, taskId, fileId, templateId, confirmationText } = req.body;
    if (!['export_save', 'share', 'public_template', 'platform_watermark_off'].includes(scene)) {
      error(res, ErrorCodes.PARAM_ERROR, '确认场景无效');
      return;
    }
    const requiredText = ['public_template', 'platform_watermark_off'].includes(scene) ? 'checked' : REQUIRED_TEXT;
    const text = String(confirmationText || '').trim();
    if (['public_template', 'platform_watermark_off'].includes(scene)) {
      if (!['checked', 'true', '1'].includes(text)) {
        error(res, ErrorCodes.PARAM_ERROR, scene === 'platform_watermark_off' ? '请确认关闭平台水印责任提示' : '请勾选公开分享协议');
        return;
      }
    } else if (text !== REQUIRED_TEXT) {
      error(res, ErrorCodes.COMPLIANCE_CONFIRM_REQUIRED, '请输入“我确认”后继续');
      return;
    }

    await query(
      `INSERT INTO user_compliance_confirmations
       (user_id, scene, task_id, file_id, template_id, confirmation_text, required_text, policy_version, confirmed_at, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3), ?, ?)`,
      [
        userId,
        scene,
        taskId ? Number(taskId) : null,
        fileId ? Number(fileId) : null,
        templateId ? Number(templateId) : null,
        text,
        requiredText,
        await getPolicyVersion(scene),
        req.ip || '',
        String(req.headers['user-agent'] || '').substring(0, 512),
      ],
    );
    success(res, { confirmed: true, scene });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '保存合规确认失败');
  }
});

router.get('/confirmations', authMiddleware, async (req: Request, res: Response) => {
  try {
    success(res, { list: await getUserComplianceConfirmations(req.user!.userId) });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取合规确认记录失败');
  }
});

export async function hasComplianceConfirmation(userId: number, scene: string): Promise<boolean> {
  const row = await queryOne<any>(
    'SELECT id FROM user_compliance_confirmations WHERE user_id = ? AND scene = ? LIMIT 1',
    [userId, scene],
  );
  return !!row;
}

export async function getUserComplianceConfirmations(userId: number) {
  const rows = await query<any>(
    `SELECT id, scene, task_id, file_id, template_id, confirmation_text, required_text, policy_version, confirmed_at
       FROM user_compliance_confirmations
      WHERE user_id = ?
      ORDER BY confirmed_at DESC
      LIMIT 100`,
    [userId],
  );
  return rows.map(toPublicConfirmation);
}

async function getPolicyVersion(scene: string): Promise<string> {
  const docType = scene === 'public_template' ? 'public_template_rules' : 'ai_content_rules';
  const row = await queryOne<any>(
    'SELECT version FROM legal_documents WHERE doc_type = ? AND enabled = 1 ORDER BY effective_at DESC, id DESC LIMIT 1',
    [docType],
  );
  return row?.version || 'v1';
}

function toPublicConfirmation(row: any) {
  return {
    id: row.id,
    scene: row.scene,
    taskId: row.task_id,
    fileId: row.file_id,
    templateId: row.template_id,
    confirmationText: row.confirmation_text,
    requiredText: row.required_text,
    policyVersion: row.policy_version,
    confirmedAt: row.confirmed_at,
  };
}

export default router;
