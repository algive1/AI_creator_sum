export type InputMediaType = 'image' | 'video' | 'audio';

export interface VideoInputAssetRef {
  mediaType: InputMediaType;
  sourceType?: 'upload' | 'url' | string;
  path?: string;
  url?: string;
  uploadKey?: unknown;
  fileId?: number;
  fileNo?: string;
  storageKey?: string;
  typeLabel?: string;
  [key: string]: unknown;
}

export interface SplitVideoInputAssetsResult {
  imageRefs: VideoInputAssetRef[];
  videoRefs: VideoInputAssetRef[];
  audioRefs: VideoInputAssetRef[];
}

export function splitVideoInputAssets(inputAssets: unknown): SplitVideoInputAssetsResult {
  const result: SplitVideoInputAssetsResult = {
    imageRefs: [],
    videoRefs: [],
    audioRefs: [],
  };
  const items = Array.isArray(inputAssets) ? inputAssets : [];

  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const asset = raw as Record<string, unknown>;
    const mediaType = normalizeMediaType(asset.mediaType || asset.media_type || asset.type);
    if (!mediaType) continue;
    const normalized = compactAsset({
      ...asset,
      mediaType,
      sourceType: asset.sourceType || asset.source_type ? String(asset.sourceType || asset.source_type) : undefined,
      path: cleanString(asset.path),
      url: cleanString(asset.url),
      uploadKey: asset.uploadKey ?? asset.upload_key,
      fileId: positiveInt(asset.fileId ?? asset.file_id),
      fileNo: cleanString(asset.fileNo ?? asset.file_no),
      storageKey: cleanString(asset.storageKey ?? asset.storage_key),
      typeLabel: cleanString(asset.typeLabel ?? asset.type_label),
    });
    if (normalized.url) assertHttpUrl(normalized.url);
    if (mediaType === 'image') result.imageRefs.push(normalized);
    else if (mediaType === 'video') result.videoRefs.push(normalized);
    else result.audioRefs.push(normalized);
  }

  return result;
}

function normalizeMediaType(value: unknown): InputMediaType | '' {
  const text = String(value || '').trim().toLowerCase();
  if (['image', 'ref_image', 'reference_image', 'start_frame', 'end_frame'].includes(text)) return 'image';
  if (['video', 'ref_video', 'source_video', 'reference_video'].includes(text)) return 'video';
  if (['audio', 'ref_audio', 'reference_audio'].includes(text)) return 'audio';
  return '';
}

function assertHttpUrl(url: string): void {
  if (!/^https?:\/\//i.test(url)) {
    throw Object.assign(new Error('素材链接必须以 http 或 https 开头'), { code: 400 });
  }
}

function cleanString(value: unknown): string | undefined {
  const text = String(value || '').trim();
  return text || undefined;
}

function positiveInt(value: unknown): number | undefined {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function compactAsset(value: VideoInputAssetRef): VideoInputAssetRef {
  const clean: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (fieldValue === undefined || fieldValue === null || fieldValue === '') continue;
    clean[key] = fieldValue;
  }
  return clean as VideoInputAssetRef;
}
