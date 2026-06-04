import { query } from '../utils/db';

export async function resolveTaskSystemPrompt(taskType: 'image' | 'video', subType?: string): Promise<string> {
  const targetFeature = resolveTargetFeature(taskType, subType);
  return resolveSystemPromptByFeature(targetFeature);
}

export async function resolveSystemPromptByFeature(targetFeature: string): Promise<string> {
  const rows = await query<any>(
    `SELECT prompt_type, content
       FROM system_prompts
      WHERE enabled = 1 AND target_feature = ?
      ORDER BY FIELD(prompt_type, 'system', 'optimize', 'safety', 'negative', 'template'), version DESC, id DESC`,
    [targetFeature],
  );
  const primary = pickContent(rows, 'system');
  const optimize = pickContent(rows, 'optimize');
  const safety = pickContent(rows, 'safety');
  const negative = pickContent(rows, 'negative');
  const template = pickContent(rows, 'template');
  return [primary, optimize, safety, negative, template].filter(Boolean).join('\n\n');
}

function pickContent(rows: any[], type: string): string {
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
