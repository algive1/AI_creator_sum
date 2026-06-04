import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { query, queryOne } from '../utils/db';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';

const router = Router();
const REQUIRED_DOC_TYPES = ['user_agreement', 'privacy_policy', 'ai_content_rules'];

router.get('/documents', async (_req: Request, res: Response) => {
  try {
    const rows = await query<any>(
      `SELECT id, doc_type, title, version, content, effective_at, updated_at
         FROM legal_documents
        WHERE enabled = 1 AND (effective_at IS NULL OR effective_at <= NOW(3))
        ORDER BY doc_type, effective_at DESC, id DESC`,
    );
    const latest = new Map<string, any>();
    for (const row of rows) {
      if (!latest.has(row.doc_type)) latest.set(row.doc_type, row);
    }
    success(res, { list: Array.from(latest.values()).map(toPublicDocument), requiredDocTypes: REQUIRED_DOC_TYPES });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取协议失败');
  }
});

router.post('/accept', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { documents, scene } = req.body;
    const items = Array.isArray(documents) ? documents : [];
    if (!items.length) {
      error(res, ErrorCodes.PARAM_ERROR, '缺少协议确认信息');
      return;
    }

    for (const item of items) {
      if (!item.docType || !item.version) {
        error(res, ErrorCodes.PARAM_ERROR, '协议类型和版本不能为空');
        return;
      }
      const doc = await queryOne<any>(
        'SELECT id FROM legal_documents WHERE doc_type = ? AND version = ? AND enabled = 1 LIMIT 1',
        [item.docType, item.version],
      );
      if (!doc) {
        error(res, ErrorCodes.PARAM_ERROR, '协议版本不存在或未启用');
        return;
      }
      await query(
        `INSERT INTO user_legal_acceptances
         (user_id, doc_type, doc_version, accepted_at, scene, ip, user_agent)
         VALUES (?, ?, ?, NOW(3), ?, ?, ?)
         ON DUPLICATE KEY UPDATE accepted_at = VALUES(accepted_at), scene = VALUES(scene),
           ip = VALUES(ip), user_agent = VALUES(user_agent)`,
        [
          userId,
          item.docType,
          item.version,
          scene || 'first_open',
          req.ip || '',
          String(req.headers['user-agent'] || '').substring(0, 512),
        ],
      );
    }
    success(res, { accepted: true });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '保存协议确认失败');
  }
});

router.get('/required-status', authMiddleware, async (req: Request, res: Response) => {
  try {
    success(res, await getLegalRequiredStatus(req.user!.userId));
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取协议确认状态失败');
  }
});

export async function getLegalRequiredStatus(userId: number) {
  const docs = await query<any>(
    `SELECT doc_type, version, title
       FROM legal_documents
      WHERE enabled = 1 AND doc_type IN (?, ?, ?) AND (effective_at IS NULL OR effective_at <= NOW(3))
      ORDER BY doc_type, effective_at DESC, id DESC`,
    REQUIRED_DOC_TYPES,
  );
  const latest = new Map<string, any>();
  for (const doc of docs) {
    if (!latest.has(doc.doc_type)) latest.set(doc.doc_type, doc);
  }

  const missing: any[] = [];
  for (const doc of latest.values()) {
    const accepted = await queryOne<any>(
      'SELECT id FROM user_legal_acceptances WHERE user_id = ? AND doc_type = ? AND doc_version = ? LIMIT 1',
      [userId, doc.doc_type, doc.version],
    );
    if (!accepted) {
      missing.push({ docType: doc.doc_type, version: doc.version, title: doc.title });
    }
  }
  return { required: missing.length > 0, missing };
}

function toPublicDocument(row: any) {
  return {
    id: row.id,
    docType: row.doc_type,
    title: row.title,
    version: row.version,
    content: row.content,
    effectiveAt: row.effective_at,
    updatedAt: row.updated_at,
  };
}

export default router;
