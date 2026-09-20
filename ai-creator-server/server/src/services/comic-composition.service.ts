import crypto from 'crypto';
import { query, queryOne } from '../utils/db';
import { assertActiveProject } from './project.service';

export type ComicCompositionShot = { index: number; title?: string; url: string };

function normalizeShots(value: unknown): ComicCompositionShot[] {
  if (!Array.isArray(value) || value.length === 0) throw Object.assign(new Error('成片至少需要一个已完成镜头'), { code: 1001 });
  if (value.length > 200) throw Object.assign(new Error('单个成片最多支持 200 个镜头'), { code: 1001 });
  return value.map((raw: any, index) => {
    const url = String(raw?.url || raw?.outputUrl || '').trim();
    if (!/^https?:\/\//i.test(url)) throw Object.assign(new Error('第 ' + (index + 1) + ' 个镜头缺少有效视频地址'), { code: 1001 });
    return { index, title: String(raw?.title || '').slice(0, 160), url };
  });
}

export async function createComicCompositionJob(userId: number, payload: any) {
  const projectId = await assertActiveProject(userId, Number(payload?.projectId || 0) || null);
  const shots = normalizeShots(payload?.shots);
  const jobNo = 'CMP' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(5).toString('hex').toUpperCase();
  const [result] = await query<any>(
    "INSERT INTO comic_composition_jobs (job_no,user_id,project_id,status,shots,created_at,updated_at) VALUES (?,?,?,'pending',?,NOW(3),NOW(3))",
    [jobNo, userId, projectId, JSON.stringify(shots)],
  );
  return getComicCompositionJob(userId, Number(result.insertId));
}

export async function getComicCompositionJob(userId: number, id: number) {
  const row = await queryOne<any>('SELECT * FROM comic_composition_jobs WHERE id = ? AND user_id = ? LIMIT 1', [id, userId]);
  if (!row) return null;
  let shots: ComicCompositionShot[] = [];
  try { shots = typeof row.shots === 'string' ? JSON.parse(row.shots) : row.shots || []; } catch {}
  return { id: Number(row.id), jobNo: row.job_no, projectId: Number(row.project_id), status: row.status, shots, outputFileId: row.output_file_id ? Number(row.output_file_id) : null, outputUrl: row.output_url || '', errorMessage: row.error_message || '', createdAt: row.created_at, updatedAt: row.updated_at };
}
