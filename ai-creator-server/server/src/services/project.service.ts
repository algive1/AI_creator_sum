import { getConnection, query, queryOne } from '../utils/db';

export type ProjectStatus = 'active' | 'archived';

function cleanProjectName(value: unknown): string {
  const name = String(value || '').trim();
  if (!name) throw Object.assign(new Error('请输入项目名称'), { code: 1001 });
  if (name.length > 80) throw Object.assign(new Error('项目名称最多 80 个字符'), { code: 1001 });
  return name;
}

function mapProject(row: any) {
  return {
    id: Number(row.id),
    name: String(row.name || ''),
    coverAssetId: row.cover_asset_id ? Number(row.cover_asset_id) : null,
    isDefault: Boolean(row.is_default),
    status: row.status as ProjectStatus,
    taskCount: Number(row.task_count || 0),
    assetCount: Number(row.asset_count || 0),
    archivedAt: row.archived_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getOrCreateDefaultProject(userId: number): Promise<number> {
  const existing = await queryOne<any>('SELECT id FROM creation_projects WHERE user_id = ? AND is_default = 1 LIMIT 1', [userId]);
  if (existing?.id) return Number(existing.id);
  await query(
    `INSERT IGNORE INTO creation_projects (user_id, name, is_default, status, created_at, updated_at)
     VALUES (?, '未归类项目', 1, 'active', NOW(3), NOW(3))`,
    [userId],
  );
  const created = await queryOne<any>('SELECT id FROM creation_projects WHERE user_id = ? AND is_default = 1 LIMIT 1', [userId]);
  if (!created?.id) throw new Error('默认项目创建失败');
  return Number(created.id);
}

export async function assertActiveProject(userId: number, projectId?: number | null): Promise<number> {
  const resolvedId = projectId ? Number(projectId) : await getOrCreateDefaultProject(userId);
  const project = await queryOne<any>(
    "SELECT id FROM creation_projects WHERE id = ? AND user_id = ? AND status = 'active' LIMIT 1",
    [resolvedId, userId],
  );
  if (!project) throw Object.assign(new Error('项目不存在或已归档'), { code: 1001 });
  return Number(project.id);
}

export async function listProjects(userId: number, status: ProjectStatus = 'active') {
  const rows = await query<any>(
    `SELECT p.*,
            (SELECT COUNT(*) FROM ai_tasks t WHERE t.project_id = p.id) AS task_count,
            (SELECT COUNT(*) FROM media_assets a WHERE a.project_id = p.id AND a.status = 'active') AS asset_count
       FROM creation_projects p
      WHERE p.user_id = ? AND p.status = ?
      ORDER BY p.is_default DESC, p.updated_at DESC, p.id DESC`,
    [userId, status],
  );
  return rows.map(mapProject);
}

export async function createProject(userId: number, nameValue: unknown) {
  const name = cleanProjectName(nameValue);
  const [result] = await query<any>(
    `INSERT INTO creation_projects (user_id, name, is_default, status, created_at, updated_at)
     VALUES (?, ?, 0, 'active', NOW(3), NOW(3))`,
    [userId, name],
  );
  return getProject(userId, Number(result.insertId));
}

export async function getProject(userId: number, projectId: number) {
  const row = await queryOne<any>(
    `SELECT p.*,
            (SELECT COUNT(*) FROM ai_tasks t WHERE t.project_id = p.id) AS task_count,
            (SELECT COUNT(*) FROM media_assets a WHERE a.project_id = p.id AND a.status = 'active') AS asset_count
       FROM creation_projects p
      WHERE p.id = ? AND p.user_id = ?`,
    [projectId, userId],
  );
  return row ? mapProject(row) : null;
}

export async function renameProject(userId: number, projectId: number, nameValue: unknown) {
  const name = cleanProjectName(nameValue);
  const result = await query<any>(
    "UPDATE creation_projects SET name = ?, updated_at = NOW(3) WHERE id = ? AND user_id = ? AND status = 'active'",
    [name, projectId, userId],
  );
  if (Number(result[0]?.affectedRows || 0) === 0) return null;
  return getProject(userId, projectId);
}

export async function archiveProject(userId: number, projectId: number): Promise<boolean> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      'SELECT id, is_default, status FROM creation_projects WHERE id = ? AND user_id = ? FOR UPDATE',
      [projectId, userId],
    ) as any;
    const project = rows?.[0];
    if (!project || project.status !== 'active') {
      await conn.rollback();
      return false;
    }
    if (project.is_default) throw Object.assign(new Error('未归类项目不能归档'), { code: 1001 });
    const [runningRows] = await conn.execute(
      "SELECT COUNT(*) AS count FROM ai_tasks WHERE project_id = ? AND status IN ('pending', 'queued', 'processing')",
      [projectId],
    ) as any;
    if (Number(runningRows?.[0]?.count || 0) > 0) throw Object.assign(new Error('项目仍有运行中的任务，暂不能归档'), { code: 1001 });
    await conn.execute(
      "UPDATE creation_projects SET status = 'archived', archived_at = NOW(3), updated_at = NOW(3) WHERE id = ?",
      [projectId],
    );
    await conn.commit();
    return true;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function restoreProject(userId: number, projectId: number): Promise<boolean> {
  const result = await query<any>(
    "UPDATE creation_projects SET status = 'active', archived_at = NULL, updated_at = NOW(3) WHERE id = ? AND user_id = ? AND status = 'archived'",
    [projectId, userId],
  );
  return Number(result[0]?.affectedRows || 0) > 0;
}
