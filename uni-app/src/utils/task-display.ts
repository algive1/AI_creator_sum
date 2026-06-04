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
  return String(task.title || task.prompt || 'AI创作任务');
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
      desc: fallbackMessage || '作品已自动保存到你的记录。',
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
  return Array.isArray(task.outputs) ? task.outputs as TaskLike[] : [];
}

export function taskThumbnailOf(task: TaskLike) {
  const output = taskOutputList(task)[0] || {};
  return String(task.thumbnail || task.coverUrl || output.thumbnail || output.image || output.url || '');
}

export function taskOutputUrl(output: TaskLike) {
  return String(output.url || output.image || output.video || output.thumbnail || '');
}

export function taskCreatedAtOf(task: TaskLike) {
  return String(task.createdAt || task.created_at || '');
}

export function taskFailReasonOf(task: TaskLike) {
  return String(task.failReason || task.errorMessage || task.auditReason || '');
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
