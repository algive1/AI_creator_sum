import { query } from '../utils/db';

const SYSTEM_PROMPT_CACHE_TTL_MS = 60_000;

type SystemPromptRow = {
  prompt_type: string;
  content?: string | null;
};

type SystemPromptLoader = (targetFeature: string) => Promise<SystemPromptRow[]>;

const systemPromptCache = new Map<string, { value: string; expiresAt: number }>();

export async function resolveTaskSystemPrompt(taskType: 'image' | 'video', subType?: string): Promise<string> {
  const targetFeature = resolveTargetFeature(taskType, subType);
  return resolveSystemPromptByFeature(targetFeature);
}

export async function resolveSystemPromptByFeature(targetFeature: string): Promise<string> {
  return resolveSystemPromptByFeatureWithCache(targetFeature);
}

export function clearSystemPromptCache(targetFeature?: string): void {
  if (targetFeature) {
    systemPromptCache.delete(targetFeature);
    return;
  }
  systemPromptCache.clear();
}

export async function resolveSystemPromptByFeatureWithCache(
  targetFeature: string,
  loader: SystemPromptLoader = loadSystemPromptRows,
  now = Date.now(),
): Promise<string> {
  const cached = systemPromptCache.get(targetFeature);
  if (cached && cached.expiresAt > now) return cached.value;

  const rows = await loader(targetFeature);
  const value = buildSystemPromptContent(rows);
  systemPromptCache.set(targetFeature, { value, expiresAt: now + SYSTEM_PROMPT_CACHE_TTL_MS });
  return value;
}

async function loadSystemPromptRows(targetFeature: string): Promise<SystemPromptRow[]> {
  return query<SystemPromptRow>(
    `SELECT prompt_type, content
       FROM system_prompts
      WHERE enabled = 1 AND target_feature = ?
      ORDER BY FIELD(prompt_type, 'system', 'optimize', 'safety', 'negative', 'template'), version DESC, id DESC`,
    [targetFeature],
  );
}

function buildSystemPromptContent(rows: SystemPromptRow[]): string {
  const primary = pickContent(rows, 'system');
  const optimize = pickContent(rows, 'optimize');
  const safety = pickContent(rows, 'safety');
  const negative = pickContent(rows, 'negative');
  const template = pickContent(rows, 'template');
  return [primary, optimize, safety, negative, template].filter(Boolean).join('\n\n');
}

function pickContent(rows: SystemPromptRow[], type: string): string {
  const row = rows.find(item => item.prompt_type === type);
  return row?.content ? String(row.content).trim() : '';
}

function resolveTargetFeature(taskType: 'image' | 'video', subType?: string): string {
  if (taskType === 'image') {
    if (subType === 'img2img') return 'image_to_image';
    if (subType === 'edit') return 'image_edit';
    return 'text_to_image';
  }
  if (subType === 'image_to_video') return 'image_to_video';
  if (subType === 'first_last_frame_video') return 'first_last_frame_video';
  return 'text_to_video';
}
