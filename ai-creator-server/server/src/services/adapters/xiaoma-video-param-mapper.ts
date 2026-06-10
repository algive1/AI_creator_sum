type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export function applyXiaomaVideoParams(body: Record<string, JsonValue>, input: Record<string, any>, modelName: string): void {
  const model = String(modelName || '').toLowerCase();
  const images = stringList(body.images || input.images || input.uploadKeys);
  const ratio = normalizeRatio(input.ratio || input.aspect_ratio || input.aspectRatio);
  const duration = normalizeDuration(input.durationText || input.durationRaw || input.duration);
  const resolution = trimString(input.resolution || input.quality || input.size);
  const audioMode = normalizeAudioMode(input.audioMode || input.audio_mode);
  const videoMode = String(input.videoMode || '').trim();
  const seed = input.seed ?? body.seed;
  const audioUrl = trimString(input.audioUrl ?? input.audio_url ?? body.audioUrl ?? body.audio_url);
  const audioFileId = input.audioFileId ?? input.audio_file_id ?? body.audioFileId ?? body.audio_file_id;

  delete body.ratio;
  delete body.aspect_ratio;
  delete body.aspectRatio;
  delete body.durationText;
  delete body.durationRaw;
  delete body.durationSeconds;
  delete body.resolution;
  delete body.quality;
  delete body.audioMode;
  delete body.audio_mode;
  delete body.preserveAudio;
  delete body.preserve_audio;
  delete body.videoMode;
  delete body.audioUrl;
  delete body.audioFileId;

  if (seed !== undefined && seed !== null && String(seed).trim() !== '') {
    body.seed = typeof seed === 'number' ? seed : trimString(seed);
  }
  if (audioUrl) body.audio_url = audioUrl;
  if (audioFileId !== undefined && audioFileId !== null && String(audioFileId).trim() !== '') {
    body.audio_file_id = typeof audioFileId === 'number' ? audioFileId : trimString(audioFileId);
  }

  if (model.includes('sora-2')) {
    if (duration) body.duration = secondsValue(duration, '4');
    if (ratio) body.orientation = ratio === '9:16' ? 'portrait' : 'landscape';
    if (images.length) body.input_reference = images[0];
    body.watermark = false;
    return;
  }

  if (model.includes('grok-video-3')) {
    if (images.length) body.images = images.slice(0, 1);
    if (ratio) body.aspect_ratio = ratio;
    if (resolution) body.size = resolution;
    if (duration) body.duration = secondsValue(duration, '6');
    return;
  }

  if (model.includes('grok-imagine-video-1.5-preview')) {
    if (images.length) body.images = images.slice(0, 1);
    if (ratio) body.aspect_ratio = ratio;
    if (resolution) body.resolution = resolution;
    if (duration) body.duration = secondsValue(duration, '5');
    return;
  }

  if (model.includes('doubao-seedance-1-5-pro-251215')) {
    if (images.length) body.images = images.slice(0, 2);
    if (duration) body.audio_duration = secondsValue(duration, '4');
    if (resolution) body.resolution = resolution;
    if (ratio) body.ratio = ratio;
    if (audioMode) body.generate_audio = audioMode === 'audio';
    return;
  }

  if (model.includes('kling-v3-video') || model.includes('kling-v3-omni-cankao') || model.includes('kling-v3-omni-shouweizhen')) {
    if (images.length) body.images = model.includes('cankao') ? images.slice(0, 7) : images.slice(0, 2);
    if (duration) body.duration = secondsValue(duration, '5');
    if (ratio && !model.includes('shouweizhen')) body.aspect_ratio = ratio;
    body.mode = trimString(input.mode || input.generationMode || input.generation_mode) || 'std';
    return;
  }

  if (model.includes('veo3.1-lite')) {
    if (images.length) body.images = images.slice(0, 2);
    if (ratio) body.aspect_ratio = ratio;
    if (resolution) body.quality = resolution;
    body.enhance_prompt = boolParam(input.enhancePrompt ?? input.enhance_prompt, true);
    return;
  }

  if (model.includes('veo3.1')) {
    if (images.length) body.images = images.slice(0, 2);
    if (ratio) body.aspect_ratio = ratio;
    body.duration = '8';
    body.generation_mode = trimString(input.generationMode || input.generation_mode) || 'fast';
    body.generation_type = veoGenerationType(videoMode, images.length);
    if (resolution) body.quality = resolution;
    body.enhance_prompt = boolParam(input.enhancePrompt ?? input.enhance_prompt, true);
    body.enable_upsample = boolParam(input.enableUpsample ?? input.enable_upsample, false);
    return;
  }

  if (model.includes('omni-flash')) {
    if (images.length) body.images = images.slice(0, 3);
    if (ratio) body.aspect_ratio = ratio;
    if (duration) body.duration = secondsValue(duration, '8');
    body.enhance_prompt = boolParam(input.enhancePrompt ?? input.enhance_prompt, false);
    body.enable_upsample = boolParam(input.enableUpsample ?? input.enable_upsample, false);
    return;
  }

  if (model.includes('happyhorse-video-edit')) {
    const videoUrl = trimString(input.videoUrl || input.video_url || body.video_url);
    if (videoUrl) body.video_url = videoUrl;
    if (duration) body.duration = secondsValue(duration, '5');
    if (resolution) body.resolution = resolution;
    return;
  }

  if (model.includes('kwvideo-v2')) {
    const usesReferenceImages = model.includes('ref') || model.includes('quannengcankao');
    if (images.length) body.images = usesReferenceImages ? images.slice(0, 9) : images.slice(0, 2);
    if (duration) body.duration = duration === 'auto' ? 'auto' : secondsValue(duration, '5');
    if (ratio) body.aspect_ratio = ratio;
    if (resolution) body.resolution = resolution;
    body.version = trimString(input.version) || '标准';
    return;
  }

  if (images.length) body.images = images;
  if (ratio) body.aspect_ratio = ratio;
  if (duration) body.duration = duration === 'auto' ? 'auto' : secondsValue(duration, '5');
  if (resolution) body.resolution = resolution;
}

export function isXiaomaVideoTaskType(taskType: unknown): boolean {
  return ['text_to_video', 'image_to_video', 'first_last_frame_video', 'video_edit'].includes(String(taskType || '').trim());
}

function veoGenerationType(videoMode: string, imageCount: number): string {
  if (videoMode === 'first_last_frame_video' || imageCount >= 2) return 'FIRST&LAST';
  if (videoMode === 'image_to_video' || imageCount >= 1) return 'REFERENCE';
  return 'TEXT';
}

function normalizeRatio(value: unknown): string {
  const text = trimString(value);
  if (!text) return '';
  if (text.toLowerCase() === 'auto') return '';
  if (text.toLowerCase() === 'adaptive') return 'adaptive';
  return text;
}

function normalizeDuration(value: unknown): string {
  const text = trimString(value);
  if (!text) return '';
  if (text.toLowerCase() === 'auto') return 'auto';
  const match = text.match(/^(\d+)\s*(?:s|秒)?$/i);
  return match ? match[1] : text;
}

function secondsValue(value: string, fallback: string): string {
  const normalized = normalizeDuration(value);
  if (!normalized || normalized === 'auto') return fallback;
  return normalized;
}

function normalizeAudioMode(value: unknown): string {
  const text = trimString(value).toLowerCase();
  if (['audio', 'sound', 'with_audio', 'with-audio', 'on'].includes(text)) return 'audio';
  if (['silent', 'mute', 'muted', 'no_audio', 'no-audio', 'off'].includes(text)) return 'silent';
  return '';
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return value ? [String(value)] : [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function boolParam(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'on', 'enabled'].includes(String(value).trim().toLowerCase());
}

function trimString(value: unknown): string {
  return String(value || '').trim();
}
