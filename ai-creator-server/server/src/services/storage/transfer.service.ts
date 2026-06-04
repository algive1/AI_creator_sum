import * as crypto from 'crypto';
import { StorageService } from './storage.service';
import { getImageDimensions } from './upload-validator';
import { query, queryOne } from '../../utils/db';
import { FileCategory } from './adapter.interface';
import { addPlatformWatermark } from '../image-postprocess.service';

interface TransferParams {
  taskId: number;
  userId: number;
  sourceUrl: string;
  outputName: string;
  outputIndex: number;
  outputType: 'image' | 'video';
  metadata?: any;
}

interface TransferResult {
  fileNo: string;
  storageKey: string;
  cdnUrl: string;
  width: number;
  height: number;
  fileSize: number;
  mimeType: string;
}

async function readSource(source: string, outputType: 'image' | 'video'): Promise<{ buffer: Buffer; contentType: string }> {
  if (!source) throw new Error('模型没有返回可转存的图片地址或图片内容');

  if (source.startsWith('data:')) {
    const match = source.match(/^data:([^;,]+)?;base64,(.+)$/);
    if (!match) throw new Error('模型返回的 base64 图片格式不正确');
    return {
      buffer: Buffer.from(match[2], 'base64'),
      contentType: match[1] || (outputType === 'image' ? 'image/png' : 'application/octet-stream'),
    };
  }

  if (isProbablyBase64(source)) {
    return {
      buffer: Buffer.from(source, 'base64'),
      contentType: outputType === 'image' ? 'image/png' : 'application/octet-stream',
    };
  }

  if (!/^https?:\/\//i.test(source)) {
    throw new Error('模型返回的结果不是可下载 URL，也不是 base64 图片内容');
  }

  const resp = await fetch(source);
  if (!resp.ok) {
    throw new Error(`下载模型结果失败: ${resp.status} ${resp.statusText}`);
  }
  const contentType = resp.headers.get('content-type') || (outputType === 'image' ? 'image/png' : 'application/octet-stream');
  const arrayBuffer = await resp.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

export async function transferFromUrl(params: TransferParams): Promise<TransferResult> {
  const { buffer, contentType } = await readSource(params.sourceUrl, params.outputType);
  return transferFromBuffer({ ...params, buffer, contentType });
}

export async function transferFromBuffer(params: Omit<TransferParams, 'sourceUrl'> & { buffer: Buffer; contentType: string }): Promise<TransferResult> {
  const { taskId, userId, outputName, outputType } = params;
  let { buffer, contentType } = params;
  if (!buffer.length) throw new Error('模型返回的图片内容为空');
  if (outputType === 'image' && params.metadata?.platformWatermarkEnabled === true) {
    const watermarked = await addPlatformWatermark(buffer);
    buffer = watermarked.buffer;
    contentType = watermarked.contentType;
  }

  const adapter = StorageService.getActiveAdapter();
  const md5Hash = crypto.createHash('md5').update(buffer).digest('hex');
  const category: FileCategory = outputType === 'video' ? 'ai_video' : 'ai_output';
  const platformWatermarkRemoved = params.metadata?.platformWatermarkRemoved ? 1 : 0;

  const existing = await queryOne<{ storageKey: string; cdnUrl: string; width: number; height: number; fileSize: number; mimeType: string }>(
    'SELECT storage_key as storageKey, cdn_url as cdnUrl, width, height, file_size as fileSize, mime_type as mimeType FROM files WHERE md5_hash = ? AND is_deleted = 0 LIMIT 1',
    [md5Hash],
  );

  if (existing) {
    const fileNo = StorageService.genFileNo();
    await query(
      `INSERT INTO files
       (file_no, user_id, provider, storage_key, original_name, mime_type, file_size, width, height, duration, md5_hash, etag, access_url, cdn_url, file_category, visibility, ref_type, ref_id, platform_watermark_removed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, '', ?, ?, ?, 'private', 'task_output', ?, ?, NOW(3))`,
      [
        fileNo,
        userId,
        adapter.provider,
        existing.storageKey,
        outputName,
        existing.mimeType,
        existing.fileSize,
        existing.width,
        existing.height,
        md5Hash,
        existing.cdnUrl,
        existing.cdnUrl,
        category,
        String(taskId),
        platformWatermarkRemoved,
      ],
    );
    return { fileNo, ...existing };
  }

  const extension = extensionFromContentType(contentType, outputType);
  const storageKey = StorageService.genStorageKey(category, ensureExtension(outputName, extension));
  const result = await adapter.upload(storageKey, buffer, contentType);

  let width = 0;
  let height = 0;
  if (outputType === 'image') {
    const dims = getImageDimensions(buffer);
    width = dims.width;
    height = dims.height;
  }

  const fileNo = StorageService.genFileNo();
  await query(
    `INSERT INTO files
     (file_no, user_id, provider, storage_key, original_name, mime_type, file_size, width, height, duration, md5_hash, etag, access_url, cdn_url, file_category, visibility, ref_type, ref_id, platform_watermark_removed, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'private', 'task_output', ?, ?, NOW(3))`,
    [
      fileNo,
      userId,
      adapter.provider,
      storageKey,
      outputName,
      contentType,
      buffer.length,
      width,
      height,
      md5Hash,
      result.etag || '',
      result.url,
      result.cdnUrl,
      category,
      String(taskId),
      platformWatermarkRemoved,
    ],
  );

  return {
    fileNo,
    storageKey,
    cdnUrl: result.cdnUrl,
    width,
    height,
    fileSize: buffer.length,
    mimeType: contentType,
  };
}

export async function batchTransferFromUrl(paramsList: TransferParams[]): Promise<TransferResult[]> {
  const results: TransferResult[] = [];
  for (const params of paramsList) {
    results.push(await transferFromUrl(params));
  }
  return results;
}

function isProbablyBase64(value: string): boolean {
  const text = value.trim();
  if (text.length < 80 || text.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(text);
}

function extensionFromContentType(contentType: string, outputType: 'image' | 'video'): string {
  const lower = (contentType || '').toLowerCase();
  if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpg';
  if (lower.includes('webp')) return 'webp';
  if (lower.includes('gif')) return 'gif';
  if (lower.includes('mp4')) return 'mp4';
  if (lower.includes('png')) return 'png';
  return outputType === 'video' ? 'mp4' : 'png';
}

function ensureExtension(name: string, extension: string): string {
  return /\.[a-z0-9]{2,8}$/i.test(name) ? name : `${name}.${extension}`;
}
