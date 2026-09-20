import crypto from 'crypto';
import { query, queryOne } from '../utils/db';
import { assertActiveProject } from './project.service';
import { enqueueComicCompositionJob } from './comic-composition-queue.service';

export type ComicCompositionShot = { index: number; taskId: number; title?: string; url: string };
type RequestedShot = { index: number; taskId: number; title?: string };

function normalizeRequestedShots(value: unknown): RequestedShot[] {
  if (!Array.isArray(value) || value.length === 0) throw Object.assign(new Error('成片至少需要一个已完成镜头'), { code: 1001 });
  if (value.length > 200) throw Object.assign(new Error('单个成片最多支持 200 个镜头'), { code: 1001 });
  return value.map((raw: any, index) => {
    const taskId = Number(raw?.taskId || 0);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      throw Object.assign(new Error('第 ' + (index + 1) + ' 个镜头缺少有效生成任务'), { code: 1001 });
    }
    return { index, taskId, title: String(raw?.title || '').slice(0, 160) };
  });
}

async function resolveOwnedShotOutputs(userId: number, requested: RequestedShot[]) {
  const taskIds = [...new Set(requested.map(item => item.taskId))];
  const rows = await query<any>(
    `SELECT t.id AS task_id, t.project_id, t.status, t.audit_status,
            o.id AS output_id, o.output_type,
            f.cdn_url, f.access_url
       FROM ai_tasks t
       LEFT JOIN ai_task_outputs o
         ON o.task_id = t.id AND o.output_index = 0 AND o.output_type = 'video'
       LEFT JOIN media_assets a
         ON a.source_output_id = o.id AND a.user_id = t.user_id AND a.status = 'active'
       LEFT JOIN files f
         ON f.id = a.file_id AND f.user_id = t.user_id AND f.is_deleted = 0
      WHERE t.user_id = ?
        AND t.id IN (${taskIds.map(() => '?').join(',')})`,
    [userId, ...taskIds],
  );
  const byTaskId = new Map(rows.map((row: any) => [Number(row.task_id || 0), row]));
  const shots: ComicCompositionShot[] = [];
  let projectId = 0;
  for (const item of requested) {
    const row = byTaskId.get(item.taskId) as any;
    if (!row || row.status !== 'completed' || row.output_type !== 'video') {
      throw Object.assign(new Error('第 ' + (item.index + 1) + ' 个镜头尚未生成可用视频'), { code: 1001 });
    }
    if (['rejected', 'blocked'].includes(String(row.audit_status || '').trim().toLowerCase())) {
      throw Object.assign(new Error('第 ' + (item.index + 1) + ' 个镜头未通过内容审核，不能进入成片'), { code: 1001 });
    }
    const rowProjectId = Number(row.project_id || 0);
    if (!rowProjectId) throw Object.assign(new Error('镜头缺少项目归属'), { code: 1001 });
    if (!projectId) projectId = rowProjectId;
    if (rowProjectId !== projectId) throw Object.assign(new Error('一次成片只能合成同一项目中的镜头'), { code: 1001 });
    const url = String(row.cdn_url || row.access_url || '').trim();
    if (!/^https?:\/\//i.test(url)) {
      throw Object.assign(new Error('第 ' + (item.index + 1) + ' 个镜头没有可供服务器合成的视频资产'), { code: 1001 });
    }
    shots.push({ ...item, url });
  }
  return { projectId: await assertActiveProject(userId, projectId), shots };
}

export async function createComicCompositionJob(userId: number, payload: any) {
  const requested = normalizeRequestedShots(payload?.shots);
  const resolved = await resolveOwnedShotOutputs(userId, requested);
  const jobNo = 'CMP' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(5).toString('hex').toUpperCase();
  const [result] = await query<any>(
    "INSERT INTO comic_composition_jobs (job_no,user_id,project_id,status,shots,created_at,updated_at) VALUES (?,?,?,'pending',?,NOW(3),NOW(3))",
    [jobNo, userId, resolved.projectId, JSON.stringify(resolved.shots)],
  );
  const jobId = Number(result.insertId);
  const queued = await enqueueComicCompositionJob(jobId);
  if (!queued) {
    await query("UPDATE comic_composition_jobs SET status = 'failed', error_message = '合成任务队列繁忙，请稍后重试' WHERE id = ?", [jobId]);
  }
  return getComicCompositionJob(userId, jobId);
}

export async function getComicCompositionJob(userId: number, id: number) {
  const row = await queryOne<any>('SELECT * FROM comic_composition_jobs WHERE id = ? AND user_id = ? LIMIT 1', [id, userId]);
  if (!row) return null;
  let shots: ComicCompositionShot[] = [];
  try { shots = typeof row.shots === 'string' ? JSON.parse(row.shots) : row.shots || []; } catch {}
  return {
    id: Number(row.id),
    jobNo: row.job_no,
    projectId: Number(row.project_id),
    status: row.status,
    shots,
    outputFileId: row.output_file_id ? Number(row.output_file_id) : null,
    outputUrl: row.output_url || '',
    errorMessage: row.error_message || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
