import { query, queryOne } from '../utils/db';
import { parseJson } from '../utils/content-helpers';

const CAPABILITY_ALIASES: Record<string, string> = {
  image_create: 'text_to_image',
  text_to_image: 'text_to_image',
  image_generate: 'text_to_image',
  image_to_image: 'image_to_image',
  image_edit: 'image_edit',
  text_chat: 'text_chat',
  video_create: 'text_to_video',
  text_to_video: 'text_to_video',
  image_to_video: 'image_to_video',
  first_last_frame: 'first_last_frame_video',
  first_last_frame_video: 'first_last_frame_video',
  video_edit: 'video_edit',
  comic_storyboard: 'storyboard_generate',
  'prompt-optimize': 'prompt_optimize',
  prompt_optimize: 'prompt_optimize',
  text_generation: 'text_generation',
  script_generate: 'script_generate',
  prompt_generate: 'prompt_generate',
  storyboard_generate: 'storyboard_generate',
};

export function normalizeCapabilityKey(key: string): string {
  const normalized = String(key || '').trim().toLowerCase();
  return CAPABILITY_ALIASES[normalized] || normalized;
}

export async function getModelCapabilitySet(modelId: number): Promise<{ explicit: boolean; capabilities: Set<string>; modelType: string; subType: string; }> {
  const rows = await query<any>(
    'SELECT capability_key, is_supported FROM ai_model_capabilities WHERE model_id = ?',
    [modelId],
  );
  const explicit = rows.length > 0;
  const capabilities = new Set<string>();

  for (const row of rows) {
    if (!isEnabled(row.is_supported)) continue;
    const capabilityKey = normalizeCapabilityKey(row.capability_key);
    if (capabilityKey) capabilities.add(capabilityKey);
  }

  if (capabilities.size > 0) {
    return { explicit, capabilities, modelType: '', subType: '' };
  }
  if (explicit) {
    return { explicit: true, capabilities, modelType: '', subType: '' };
  }

  const model = await queryOne<any>(
    'SELECT model_type, sub_type, config FROM ai_models WHERE id = ? AND status = ?',
    [modelId, 'active'],
  );
  const configCapabilities = normalizeConfigCapabilities(parseJson(model?.config, {})?.capabilities);
  if (configCapabilities.size > 0) {
    return {
      explicit: true,
      capabilities: configCapabilities,
      modelType: String(model?.model_type || ''),
      subType: String(model?.sub_type || ''),
    };
  }
  const fallback = inferCapabilitiesFromModel(model?.model_type, model?.sub_type);
  return {
    explicit,
    capabilities: fallback,
    modelType: String(model?.model_type || ''),
    subType: String(model?.sub_type || ''),
  };
}

export async function modelHasCapability(modelId: number, expected: string | string[]): Promise<boolean> {
  const capabilitySet = await getModelCapabilitySet(modelId);
  return hasAnyCapability(capabilitySet.capabilities, expected);
}

export function hasAnyCapability(capabilities: Set<string>, expected: string | string[]): boolean {
  const list = Array.isArray(expected) ? expected : [expected];
  for (const item of list) {
    if (capabilities.has(normalizeCapabilityKey(item))) return true;
  }
  return false;
}

export function inferCapabilitiesFromModel(modelType: string, subType: string): Set<string> {
  const capabilities = new Set<string>();
  const type = String(modelType || '').trim().toLowerCase();
  const sub = String(subType || '').trim().toLowerCase();

  if (type === 'image') {
    if (sub.includes('image_to_image') || sub.includes('img2img')) capabilities.add('image_to_image');
    else if (sub.includes('edit')) capabilities.add('image_edit');
    else capabilities.add('text_to_image');
  } else if (type === 'video') {
    if (sub.includes('first_last_frame')) capabilities.add('first_last_frame_video');
    else if (sub.includes('image_to_video') || sub.includes('img2video') || sub.includes('image2video')) capabilities.add('image_to_video');
    else if (sub.includes('edit')) capabilities.add('video_edit');
    else capabilities.add('text_to_video');
  } else if (type === 'text') {
    capabilities.add('text_chat');
    capabilities.add('text_generation');
    if (sub.includes('prompt')) capabilities.add('prompt_optimize');
  }

  return capabilities;
}

function normalizeConfigCapabilities(value: any): Set<string> {
  const items = Array.isArray(value) ? value : [];
  const capabilities = new Set<string>();
  for (const item of items) {
    const capability = normalizeCapabilityKey(String(item || ''));
    if (capability) capabilities.add(capability);
  }
  return capabilities;
}

function isEnabled(value: any): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on' || normalized === 'active' || normalized === 'enabled';
}
