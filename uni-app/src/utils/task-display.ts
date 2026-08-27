export type TaskLike = Record<string, unknown>;
export type TaskStatusKind = 'queued' | 'generating' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'unknown';

export interface TaskStatusView {
  kind: TaskStatusKind;
  label: string;
  title: string;
  desc: string;
  progress: number;
  active: boolean;
  terminal: boolean;
}

export function taskIdOf(task: TaskLike) {
  return Number(task.taskId || task.id || 0);
}

export function taskTypeOf(task: TaskLike) {
  return String(task.type || task.taskType || 'image');
}

export function taskTitleOf(task: TaskLike) {
  return String(task.title || task.prompt || 'AI艺术创作');
}

export function taskPromptOf(task: TaskLike) {
  return String(task.prompt || task.optimizedPrompt || '');
}

export function taskStatusOf(task: TaskLike) {
  return String(task.status || '').toLowerCase();
}

export function isTaskProcessing(task: TaskLike) {
  return ['pending', 'queued', 'processing', 'running', 'generating'].includes(taskStatusOf(task));
}

export function isTaskCompleted(task: TaskLike) {
  return ['completed', 'success', 'succeeded', 'done'].includes(taskStatusOf(task));
}

export function isTaskFailed(task: TaskLike) {
  return ['failed', 'error', 'timeout'].includes(taskStatusOf(task));
}

export function isTaskCancelled(task: TaskLike) {
  return ['cancelled', 'canceled', 'cancel'].includes(taskStatusOf(task));
}

export function isTaskEnded(task: TaskLike) {
  return isTaskCompleted(task) || isTaskFailed(task) || isTaskCancelled(task);
}

export function taskStatusKindOf(task: TaskLike): TaskStatusKind {
  const status = taskStatusOf(task);
  const progress = taskProgressOf(task);
  const message = String(task.message || task.providerStatusMessage || task.provider_status_message || '').toLowerCase();
  if (isTaskCompleted(task)) return 'completed';
  if (isTaskFailed(task)) return 'failed';
  if (isTaskCancelled(task)) return 'cancelled';
  if (['pending', 'queued'].includes(status)) return 'queued';
  if (['processing', 'running', 'generating'].includes(status)) {
    if (progress >= 82 || /保存|处理|查询|poll|transfer|save|process/.test(message)) return 'processing';
    return 'generating';
  }
  return status ? 'processing' : 'unknown';
}

export function taskProgressOf(task: TaskLike) {
  const raw = Number(task.progress || 0);
  if (Number.isFinite(raw) && raw > 0) return Math.max(0, Math.min(100, raw));
  const kind = taskStatusKindOfWithoutProgress(task);
  if (kind === 'completed') return 100;
  if (kind === 'queued') return 3;
  if (kind === 'processing') return 88;
  if (kind === 'failed' || kind === 'cancelled') return 0;
  return 8;
}

export function taskStatusViewOf(task: TaskLike): TaskStatusView {
  const kind = taskStatusKindOf(task);
  const progress = taskProgressOf(task);
  const fallbackMessage = String(task.message || '').trim();
  const reason = taskFailReasonOf(task);
  const map: Record<TaskStatusKind, Omit<TaskStatusView, 'progress'>> = {
    queued: {
      kind,
      label: '排队中',
      title: '任务排队中',
      desc: fallbackMessage || '正在为你分配生成资源，请稍候。',
      active: true,
      terminal: false
    },
    generating: {
      kind,
      label: '生成中',
      title: '正在生成作品',
      desc: fallbackMessage || 'AI 正在全力创作中，请耐心等待。',
      active: true,
      terminal: false
    },
    processing: {
      kind,
      label: '处理中',
      title: '作品处理中',
      desc: fallbackMessage || '正在保存作品并生成高清结果，马上就好。',
      active: true,
      terminal: false
    },
    completed: {
      kind,
      label: '已生成',
      title: '创作完成',
      desc: fallbackMessage || '作品已自动保存到你的作品库。',
      active: false,
      terminal: true
    },
    failed: {
      kind,
      label: '生成失败',
      title: '生成失败',
      desc: reason || fallbackMessage || '本次创作未成功，请调整描述后重试。',
      active: false,
      terminal: true
    },
    cancelled: {
      kind,
      label: '已取消',
      title: '任务已取消',
      desc: fallbackMessage || '本次生成已取消，未产出作品。',
      active: false,
      terminal: true
    },
    unknown: {
      kind,
      label: '待处理',
      title: '任务待处理',
      desc: fallbackMessage || '正在等待任务状态更新。',
      active: false,
      terminal: false
    }
  };
  return { ...map[kind], progress };
}

export function taskOutputList(task: TaskLike) {
  const rawList = firstOutputArray(task);
  const preferredType = taskTypeOf(task);
  const list = rawList.length ? rawList : [task];
  return list
    .map((item, index) => normalizeTaskOutput(item, preferredType, index))
    .filter(hasOutputMedia);
}

export function taskThumbnailOf(task: TaskLike) {
  const output = taskOutputList(task)[0] || {};
  return firstText(
    task.thumbnail,
    task.thumbnailUrl,
    task.thumbnail_url,
    task.coverUrl,
    task.cover_url,
    task.cover,
    task.poster,
    task.previewUrl,
    task.preview_url,
    output.thumbnail,
    output.image,
    output.url
  );
}

export function taskCreatedAtOf(task: TaskLike) {
  return firstText(task.createdAt, task.created_at, task.createTime, task.create_time, task.time);
}

export function formatUserDateTime(value: unknown, fallback = '') {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'number') {
    const time = value > 0 && value < 100000000000 ? value * 1000 : value;
    return formatDateObject(new Date(time), fallback);
  }

  const raw = String(value).trim();
  if (!raw) return fallback;
  const normalized = raw.replace(/\//g, '-');
  const hasTimeZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const plain = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?/);
  if (plain && !hasTimeZone) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = plain;
    return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
  }
  return formatDateObject(new Date(raw), raw);
}

export function taskFailReasonOf(task: TaskLike) {
  return String(task.failReason || task.errorMessage || task.auditReason || '');
}

function firstOutputArray(task: TaskLike): TaskLike[] {
  const direct = [
    task.outputs,
    task.outputList,
    task.output_list,
    task.results,
    task.resultList,
    task.result_list,
    task.files,
    task.assets,
  ];
  for (const value of direct) {
    const parsed = parseMaybeJson(value);
    if (Array.isArray(parsed)) return parsed as TaskLike[];
  }

  const nested = [task.output, task.result, task.data];
  for (const value of nested) {
    const parsed = parseMaybeJson(value);
    if (Array.isArray(parsed)) return parsed as TaskLike[];
    if (parsed && typeof parsed === 'object') {
      const nestedList = firstOutputArray(parsed as TaskLike);
      if (nestedList.length) return nestedList;
      if (hasAnyMediaField(parsed as TaskLike)) return [parsed as TaskLike];
    }
    if (typeof parsed === 'string' && parsed.trim()) return [{ url: parsed }];
  }
  return [];
}

function normalizeTaskOutput(value: unknown, preferredType: string, index: number): TaskLike {
  if (typeof value === 'string') return normalizeTaskOutput({ url: value }, preferredType, index);
  const raw = value && typeof value === 'object' ? value as TaskLike : {};
  const nested = objectValue(raw.media) || objectValue(raw.output) || objectValue(raw.result) || objectValue(raw.file);
  const source = nested ? { ...nested, ...raw } : raw;
  const type = firstText(source.type, source.mediaType, source.media_type, preferredType).toLowerCase();
  const rawUrl = firstText(source.url, source.fileUrl, source.file_url, source.resultUrl, source.result_url, source.mediaUrl, source.media_url, source.src, source.path);
  const imageCandidate = firstText(
    source.image,
    source.imageUrl,
    source.image_url,
    source.picture,
    source.pictureUrl,
    source.picture_url,
    source.previewUrl,
    source.preview_url
  );
  const videoCandidate = firstText(source.video, source.videoUrl, source.video_url);
  const video = firstText(videoCandidate, type.includes('video') || isVideoUrl(rawUrl) ? rawUrl : '');
  const image = firstText(imageCandidate, !video && !isVideoUrl(rawUrl) ? rawUrl : '');
  const thumbnail = firstText(
    source.thumbnail,
    source.thumbnailUrl,
    source.thumbnail_url,
    source.cover,
    source.coverUrl,
    source.cover_url,
    source.poster,
    source.posterUrl,
    source.poster_url,
    source.preview,
    image
  );
  const url = firstText(rawUrl, video, image, thumbnail);
  return {
    ...source,
    id: source.id || source.outputId || source.output_id || index + 1,
    name: source.name || source.title || `结果${index + 1}`,
    type: type || (video ? 'video' : 'image'),
    url,
    image,
    video,
    thumbnail,
  };
}

function hasOutputMedia(output: TaskLike) {
  return Boolean(firstText(output.url, output.image, output.video, output.thumbnail));
}

function hasAnyMediaField(source: TaskLike) {
  return Boolean(firstText(
    source.url,
    source.fileUrl,
    source.file_url,
    source.resultUrl,
    source.result_url,
    source.mediaUrl,
    source.media_url,
    source.image,
    source.imageUrl,
    source.image_url,
    source.video,
    source.videoUrl,
    source.video_url,
    source.thumbnail,
    source.coverUrl,
    source.cover_url,
    source.cover,
    source.poster
  ));
}

function parseMaybeJson(value: unknown) {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text) return value;
  if (!/^[{[]/.test(text)) return value;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

function objectValue(value: unknown): TaskLike | null {
  const parsed = parseMaybeJson(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as TaskLike : null;
}

function firstText(...values: unknown[]) {
  return values.map((value) => String(value || '').trim()).find(Boolean) || '';
}

function isVideoUrl(value: string) {
  return /\.(mp4|mov|m4v|webm|avi)(?:[?#].*)?$/i.test(value);
}

function formatDateObject(date: Date, fallback: string) {
  if (!Number.isFinite(date.getTime())) return fallback;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function pad(value: string | number) {
  return String(value).padStart(2, '0');
}

function taskStatusKindOfWithoutProgress(task: TaskLike): TaskStatusKind {
  const status = taskStatusOf(task);
  if (['completed', 'success', 'succeeded', 'done'].includes(status)) return 'completed';
  if (['failed', 'error', 'timeout'].includes(status)) return 'failed';
  if (['cancelled', 'canceled', 'cancel'].includes(status)) return 'cancelled';
  if (['pending', 'queued'].includes(status)) return 'queued';
  if (['processing', 'running', 'generating'].includes(status)) return 'generating';
  return status ? 'processing' : 'unknown';
}
