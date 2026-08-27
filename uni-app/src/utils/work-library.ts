import {
  isTaskCompleted,
  isTaskFailed,
  isTaskProcessing,
  taskCreatedAtOf,
  taskFailReasonOf,
  formatUserDateTime,
  taskIdOf,
  taskOutputList,
  taskProgressOf,
  taskPromptOf,
  taskStatusViewOf,
  taskThumbnailOf,
  taskTitleOf,
  taskTypeOf,
  type TaskLike,
} from './task-display';

export type WorkLibraryAssetKey = '图片' | '视频' | '漫剧' | '角色' | '场景' | '道具' | '声音' | '剧本';
export type WorkLibraryStatusFilter = '生成中' | '已完成' | '失败';
export type WorkLibraryFilter = '全部' | WorkLibraryAssetKey | WorkLibraryStatusFilter;

export interface WorkLibraryStats {
  total: number;
  month: number;
  active: number;
  completed: number;
  failed: number;
}

export interface WorkLibraryCategorySummary {
  key: WorkLibraryAssetKey;
  label: WorkLibraryAssetKey;
  icon: string;
  hint: string;
  count: number;
}

export interface WorkLibraryOverview {
  stats: WorkLibraryStats;
  categories: WorkLibraryCategorySummary[];
  recent: WorkLibraryItem[];
}

export interface WorkLibraryItem {
  id: number;
  raw: TaskLike;
  type: string;
  typeLabel: string;
  mediaKind: WorkLibraryAssetKey;
  assetKind: WorkLibraryAssetKey;
  categoryLabel: WorkLibraryAssetKey;
  title: string;
  prompt: string;
  createdAt: string;
  displayDate: string;
  meta: string;
  thumbnail: string;
  ratioClass: string;
  statusKind: string;
  statusLabel: string;
  statusTitle: string;
  statusDesc: string;
  statusHint: string;
  displayResolution: string;
  displayFileSize: string;
  resultMeta: string;
  progress: number;
  failReason: string;
  outputCount: number;
  isActive: boolean;
  isCompleted: boolean;
  isFailed: boolean;
}

export const WORK_LIBRARY_ASSET_CATEGORIES: Omit<WorkLibraryCategorySummary, 'count'>[] = [
  { key: '图片', label: '图片', icon: '图', hint: '海报、插画、封面' },
  { key: '视频', label: '视频', icon: '视', hint: '短片、广告、动态素材' },
  { key: '漫剧', label: '漫剧', icon: '漫', hint: '分镜、剧情作品' },
  { key: '角色', label: '角色', icon: '角', hint: '人物、主角、头像' },
  { key: '场景', label: '场景', icon: '景', hint: '空间、背景、环境' },
  { key: '道具', label: '道具', icon: '道', hint: '物件、产品、装备' },
  { key: '声音', label: '声音', icon: '声', hint: '配音、音频、旁白' },
  { key: '剧本', label: '剧本', icon: '剧', hint: '脚本、文案、分镜' },
];

export const WORK_LIBRARY_FILTERS: WorkLibraryFilter[] = [
  '全部',
  ...WORK_LIBRARY_ASSET_CATEGORIES.map((item) => item.key),
  '生成中',
  '已完成',
  '失败',
];

export function buildWorkLibraryStats(tasks: TaskLike[], now: Date = new Date()): WorkLibraryStats {
  const currentMonth = monthKeyOf(now);
  return tasks.reduce<WorkLibraryStats>((stats, task) => {
    stats.total += 1;
    if (monthKeyOfDateText(taskCreatedAtOf(task)) === currentMonth) stats.month += 1;
    if (isTaskProcessing(task)) stats.active += 1;
    if (isTaskCompleted(task)) stats.completed += 1;
    if (isTaskFailed(task)) stats.failed += 1;
    return stats;
  }, { total: 0, month: 0, active: 0, completed: 0, failed: 0 });
}

export function buildWorkLibraryOverview(tasks: TaskLike[], now: Date = new Date()): WorkLibraryOverview {
  const items = tasks.map(toWorkLibraryItem);
  return {
    stats: buildWorkLibraryStats(tasks, now),
    categories: WORK_LIBRARY_ASSET_CATEGORIES.map((category) => ({
      ...category,
      count: items.filter((item) => matchesAssetCategory(item, category.key)).length,
    })),
    recent: items
      .filter((item) => item.isCompleted)
      .sort((left, right) => timestampOf(right.createdAt) - timestampOf(left.createdAt))
      .slice(0, 4),
  };
}

export function buildWorkLibraryItems(tasks: TaskLike[], filter: WorkLibraryFilter, query = ''): WorkLibraryItem[] {
  const keyword = query.trim().toLowerCase();
  return tasks
    .map(toWorkLibraryItem)
    .filter((item) => matchesFilter(item, filter))
    .filter((item) => {
      if (!keyword) return true;
      return `${item.title} ${item.prompt} ${item.categoryLabel}`.toLowerCase().includes(keyword);
    })
    .sort((left, right) => {
      const activeDelta = Number(right.isActive) - Number(left.isActive);
      if (activeDelta) return activeDelta;
      return timestampOf(right.createdAt) - timestampOf(left.createdAt);
    });
}

export function toWorkLibraryItem(task: TaskLike): WorkLibraryItem {
  const type = taskTypeOf(task);
  const status = taskStatusViewOf(task);
  const mediaKind = mediaKindOf(type);
  const assetKind = assetKindOf(task, mediaKind);
  const outputs = taskOutputList(task);
  const firstOutput = outputs[0] || {};
  const displayResolution = resolutionLabelOf(task, firstOutput);
  const displayFileSize = fileSizeLabelOf(task, firstOutput);
  const meta = compactText([
    formatUserDateTime(taskCreatedAtOf(task)),
    String(task.ratio || task.duration || task.size || '自动'),
    String(task.style || task.generationMode || task.tierName || '默认'),
  ]);
  return {
    id: taskIdOf(task),
    raw: task,
    type,
    typeLabel: mediaKind,
    mediaKind,
    assetKind,
    categoryLabel: assetKind,
    title: taskTitleOf(task),
    prompt: taskPromptOf(task),
    createdAt: taskCreatedAtOf(task),
    displayDate: formatUserDateTime(taskCreatedAtOf(task)),
    meta,
    thumbnail: taskThumbnailOf(task),
    ratioClass: ratioClassOf(task.ratio),
    statusKind: status.kind,
    statusLabel: status.label,
    statusTitle: status.title,
    statusDesc: status.desc,
    statusHint: statusHintOf(task, status.kind),
    displayResolution,
    displayFileSize,
    resultMeta: compactText([displayResolution, displayFileSize]),
    progress: taskProgressOf(task),
    failReason: taskFailReasonOf(task),
    outputCount: outputs.length,
    isActive: isTaskProcessing(task),
    isCompleted: isTaskCompleted(task),
    isFailed: isTaskFailed(task),
  };
}

function statusHintOf(task: TaskLike, kind: string) {
  if (isTaskProcessing(task)) return '后台会继续处理';
  if (kind === 'failed') return taskFailReasonOf(task) || '可调整描述后重试';
  return '';
}

function resolutionLabelOf(task: TaskLike, output: TaskLike) {
  const direct = firstText(output.resolution, output.sizeLabel, output.size_label, task.resolution, task.sizeLabel, task.size_label);
  const normalized = normalizeResolutionText(direct);
  if (normalized) return normalized;
  const width = firstPositiveNumber(output.width, output.w, output.imageWidth, output.image_width, task.width, task.w, task.imageWidth, task.image_width);
  const height = firstPositiveNumber(output.height, output.h, output.imageHeight, output.image_height, task.height, task.h, task.imageHeight, task.image_height);
  if (width && height) return `${width} x ${height}`;
  return '';
}

function fileSizeLabelOf(task: TaskLike, output: TaskLike) {
  const direct = firstText(output.fileSizeLabel, output.file_size_label, task.fileSizeLabel, task.file_size_label);
  if (/^\d+(?:\.\d+)?\s*(?:kb|mb|gb)$/i.test(direct)) return direct.replace(/\s+/g, '').toUpperCase();
  const bytes = firstPositiveNumber(
    output.fileSize,
    output.file_size,
    output.sizeBytes,
    output.size_bytes,
    output.bytes,
    task.fileSize,
    task.file_size,
    task.sizeBytes,
    task.size_bytes,
    task.bytes
  );
  return formatBytes(bytes);
}

function normalizeResolutionText(value: string) {
  const match = String(value || '').match(/(\d{2,5})\s*[xX*×]\s*(\d{2,5})/);
  if (!match) return '';
  return `${Number(match[1])} x ${Number(match[2])}`;
}

function firstPositiveNumber(...values: unknown[]) {
  for (const value of values) {
    const number = Number(value || 0);
    if (Number.isFinite(number) && number > 0) return Math.round(number);
  }
  return 0;
}

function formatBytes(bytes: number) {
  if (!bytes) return '';
  if (bytes >= 1024 * 1024 * 1024) return `${trimNumber(bytes / 1024 / 1024 / 1024)}GB`;
  if (bytes >= 1024 * 1024) return `${trimNumber(bytes / 1024 / 1024)}MB`;
  if (bytes >= 1024) return `${trimNumber(bytes / 1024)}KB`;
  return `${bytes}B`;
}

function trimNumber(value: number) {
  return value >= 10 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, '');
}

function matchesFilter(item: WorkLibraryItem, filter: WorkLibraryFilter) {
  if (filter === '生成中') return item.isActive;
  if (filter === '已完成') return item.isCompleted;
  if (filter === '失败') return item.isFailed;
  if (isAssetFilter(filter)) return matchesAssetCategory(item, filter);
  return true;
}

function matchesAssetCategory(item: WorkLibraryItem, key: WorkLibraryAssetKey) {
  return item.mediaKind === key || item.assetKind === key;
}

function isAssetFilter(value: WorkLibraryFilter): value is WorkLibraryAssetKey {
  return WORK_LIBRARY_ASSET_CATEGORIES.some((item) => item.key === value);
}

function mediaKindOf(type: string): WorkLibraryAssetKey {
  const value = type.toLowerCase();
  if (value.includes('video')) return '视频';
  if (value.includes('comic') || value.includes('manga') || value.includes('storyboard')) return '漫剧';
  if (value.includes('audio') || value.includes('voice') || value.includes('sound')) return '声音';
  if (value.includes('script') || value.includes('text')) return '剧本';
  return '图片';
}

function assetKindOf(task: TaskLike, mediaKind: WorkLibraryAssetKey): WorkLibraryAssetKey {
  if (mediaKind !== '图片') return mediaKind;
  const text = [
    taskTitleOf(task),
    taskPromptOf(task),
    task.category,
    task.categoryName,
    task.assetType,
    task.asset_type,
    task.scene,
    task.style,
    task.generationMode,
    task.subType,
  ].map((item) => String(item || '').toLowerCase()).join(' ');

  if (/角色|人物|主角|头像|人设|character|avatar|person/.test(text)) return '角色';
  if (/场景|背景|空间|房间|室内|庭院|街道|风景|环境|scene|background|room|street/.test(text)) return '场景';
  if (/道具|物件|物品|产品|装备|权杖|工具|prop|item|product/.test(text)) return '道具';
  if (/声音|音频|配音|旁白|voice|audio|sound|dub/.test(text)) return '声音';
  if (/剧本|脚本|文案|分镜|台词|story|script|copy/.test(text)) return '剧本';
  return mediaKind;
}

function ratioClassOf(ratio: unknown) {
  const map: Record<string, string> = {
    '1:1': 'square',
    '16:9': 'landscape',
    '4:3': 'landscape',
    '9:16': 'story',
    '4:5': 'portrait',
    '3:4': 'portrait',
    '2:3': 'portrait-tall',
  };
  return map[String(ratio || '')] || 'landscape';
}

function compactText(values: string[]) {
  return values.map((item) => item.trim()).filter(Boolean).join(' · ');
}

function firstText(...values: unknown[]) {
  return values.map((value) => String(value || '').trim()).find(Boolean) || '';
}

function timestampOf(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function monthKeyOf(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
}

function monthKeyOfDateText(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return monthKeyOf(date);
}
