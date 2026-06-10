import * as crypto from 'crypto';
import axios from 'axios';
import { PassThrough } from 'stream';
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
  directUrl?: boolean;
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
  assertTaskOutputStorageReady();
  if (shouldSkipTransferForCdnUrl(params.sourceUrl)) {
    return recordExternalCdnUrl(params);
  }
  if (isHttpUrl(params.sourceUrl)) {
    return transferFromHttpStream(params);
  }
  const { buffer, contentType } = await readSource(params.sourceUrl, params.outputType);
  return transferFromBuffer({ ...params, buffer, contentType });
}

export async function transferFromBuffer(params: Omit<TransferParams, 'sourceUrl'> & { buffer: Buffer; contentType: string }): Promise<TransferResult> {
  assertTaskOutputStorageReady();
  const { taskId, userId, outputName, outputType } = params;
  let { buffer, contentType } = params;
  if (!buffer.length) throw new Error('模型返回的图片内容为空');
  contentType = validateOutputContent(buffer, contentType, outputType);
  if (outputType === 'image' && params.metadata?.platformWatermarkEnabled === true) {
    const watermarked = await addPlatformWatermark(buffer);
    buffer = watermarked.buffer;
    contentType = validateOutputContent(buffer, watermarked.contentType, outputType);
  }

  const adapter = StorageService.getActiveAdapter();
  const md5Hash = crypto.createHash('md5').update(buffer).digest('hex');
  const category: FileCategory = outputType === 'video' ? 'ai_video' : 'ai_output';
  const platformWatermarkRemoved = params.metadata?.platformWatermarkRemoved ? 1 : 0;
  const extension = extensionFromContentType(contentType, outputType);
  const originalName = ensureExtension(outputName || defaultOutputName(outputType, params.outputIndex), extension);

  const existing = await queryOne<{ storageKey: string; cdnUrl: string; width: number; height: number; fileSize: number; mimeType: string }>(
    'SELECT storage_key as storageKey, cdn_url as cdnUrl, width, height, file_size as fileSize, mime_type as mimeType FROM files WHERE md5_hash = ? AND is_deleted = 0 LIMIT 1',
    [md5Hash],
  );

  if (existing) {
    const deliveryUrl = requireMiniProgramDeliveryUrl(existing.cdnUrl || adapter.getCdnUrl(existing.storageKey) || adapter.getAccessUrl(existing.storageKey));
    await verifyTaskOutputDeliveryUrl(deliveryUrl, outputType);
    const fileNo = StorageService.genFileNo();
    await query(
      `INSERT INTO files
       (file_no, user_id, provider, storage_key, original_name, mime_type, file_size, width, height, duration, md5_hash, etag, access_url, cdn_url, file_category, visibility, ref_type, ref_id, platform_watermark_removed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, '', ?, ?, ?, 'public', 'task_output', ?, ?, NOW(3))`,
      [
        fileNo,
        userId,
        adapter.provider,
        existing.storageKey,
        originalName,
        existing.mimeType,
        existing.fileSize,
        existing.width,
        existing.height,
        md5Hash,
        deliveryUrl,
        deliveryUrl,
        category,
        String(taskId),
        platformWatermarkRemoved,
      ],
    );
    return { fileNo, ...existing, cdnUrl: deliveryUrl };
  }

  const storageKey = StorageService.genStorageKey(category, originalName);
  const result = await uploadWithRetry(() => adapter.upload(storageKey, buffer, contentType));
  const deliveryUrl = requireMiniProgramDeliveryUrl(result.cdnUrl || result.url);
  await verifyTaskOutputDeliveryUrl(deliveryUrl, outputType);

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
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'public', 'task_output', ?, ?, NOW(3))`,
    [
      fileNo,
      userId,
      adapter.provider,
      storageKey,
      originalName,
      contentType,
      buffer.length,
      width,
      height,
      md5Hash,
      result.etag || '',
      result.url,
      deliveryUrl,
      category,
      String(taskId),
      platformWatermarkRemoved,
    ],
  );

  return {
    fileNo,
    storageKey,
    cdnUrl: deliveryUrl,
    width,
    height,
    fileSize: buffer.length,
    mimeType: contentType,
  };
}

export async function batchTransferFromUrl(paramsList: TransferParams[]): Promise<TransferResult[]> {
  const concurrency = Math.min(3, Math.max(1, positiveInt(process.env.TASK_OUTPUT_TRANSFER_CONCURRENCY, 3)));
  const results: TransferResult[] = [];
  for (let index = 0; index < paramsList.length; index += concurrency) {
    const settled = await Promise.allSettled(paramsList.slice(index, index + concurrency).map(params => transferFromUrl(params)));
    for (const item of settled) {
      if (item.status === 'fulfilled') results.push(item.value);
      else throw item.reason;
    }
  }
  return results;
}

async function transferFromHttpStream(params: TransferParams): Promise<TransferResult> {
  const { taskId, userId, outputName, outputType } = params;
  const adapter = StorageService.getActiveAdapter();
  const category: FileCategory = outputType === 'video' ? 'ai_video' : 'ai_output';
  const extensionFromName = extensionFromUrl(params.sourceUrl) || (outputType === 'video' ? 'mp4' : 'jpg');
  const originalName = ensureExtension(outputName || defaultOutputName(outputType, params.outputIndex), extensionFromName);
  const storageKey = StorageService.genStorageKey(category, originalName);
  const timeout = positiveInt(process.env.TASK_OUTPUT_DOWNLOAD_TIMEOUT_SECONDS, outputType === 'video' ? 180 : 60) * 1000;
  const maxBytes = positiveInt(
    outputType === 'video' ? process.env.VIDEO_TASK_MAX_FILE_MB : process.env.IMAGE_TASK_MAX_FILE_MB,
    outputType === 'video' ? 500 : 50,
  ) * 1024 * 1024;
  const platformWatermarkRemoved = params.metadata?.platformWatermarkRemoved ? 1 : 0;

  if (outputType === 'image' && params.metadata?.platformWatermarkEnabled === true) {
    const { buffer, contentType: downloadedType } = await readSource(params.sourceUrl, params.outputType);
    return transferFromBuffer({ ...params, buffer, contentType: downloadedType });
  }
  const uploaded = await uploadHttpStreamWithRetry({
    sourceUrl: params.sourceUrl,
    outputType,
    timeout,
    maxBytes,
    storageKey,
  });
  const deliveryUrl = requireMiniProgramDeliveryUrl(uploaded.result.cdnUrl || uploaded.result.url);
  await verifyTaskOutputDeliveryUrl(deliveryUrl, outputType);
  const fileNo = StorageService.genFileNo();

  await query(
    `INSERT INTO files
     (file_no, user_id, provider, storage_key, original_name, mime_type, file_size, width, height, duration, md5_hash, etag, access_url, cdn_url, file_category, visibility, ref_type, ref_id, platform_watermark_removed, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, 'public', 'task_output', ?, ?, NOW(3))`,
    [
      fileNo,
      userId,
      adapter.provider,
      storageKey,
      originalName,
      uploaded.contentType,
      uploaded.fileSize,
      uploaded.md5Hash,
      uploaded.result.etag || '',
      uploaded.result.url,
      deliveryUrl,
      category,
      String(taskId),
      platformWatermarkRemoved,
    ],
  );

  return {
    fileNo,
    storageKey,
    cdnUrl: deliveryUrl,
    width: 0,
    height: 0,
    fileSize: uploaded.fileSize,
    mimeType: uploaded.contentType,
  };
}

async function uploadHttpStreamWithRetry(input: {
  sourceUrl: string;
  outputType: 'image' | 'video';
  timeout: number;
  maxBytes: number;
  storageKey: string;
}): Promise<{ result: any; contentType: string; fileSize: number; md5Hash: string }> {
  const maxAttempts = 3;
  let lastError: any = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await uploadHttpStreamOnce(input);
    } catch (err: any) {
      lastError = err;
      if (attempt >= maxAttempts) break;
      await sleep(Math.min(1000 * 2 ** (attempt - 1), 5000));
    }
  }
  throw lastError;
}

async function uploadHttpStreamOnce(input: {
  sourceUrl: string;
  outputType: 'image' | 'video';
  timeout: number;
  maxBytes: number;
  storageKey: string;
}): Promise<{ result: any; contentType: string; fileSize: number; md5Hash: string }> {
  const adapter = StorageService.getActiveAdapter();
  const response = await axios.get(input.sourceUrl, {
    responseType: 'stream',
    timeout: input.timeout,
    maxRedirects: 5,
    validateStatus: status => status >= 200 && status < 300,
  });
  const contentLength = Number(response.headers['content-length'] || 0);
  if (contentLength > input.maxBytes) {
    response.data.destroy();
    throw new Error(`${input.outputType === 'video' ? '视频' : '图片'}文件超过大小限制 ${Math.floor(input.maxBytes / 1024 / 1024)} MB`);
  }
  const contentType = normalizeContentType(String(response.headers['content-type'] || ''), input.outputType);
  validateStreamContentType(contentType, input.outputType);

  let streamedBytes = 0;
  const hash = crypto.createHash('md5');
  const passThrough = new PassThrough();
  response.data.on('data', (chunk: Buffer) => {
    streamedBytes += chunk.length;
    if (streamedBytes > input.maxBytes) {
      response.data.destroy(new Error(`${input.outputType === 'video' ? '视频' : '图片'}文件超过大小限制 ${Math.floor(input.maxBytes / 1024 / 1024)} MB`));
      return;
    }
    hash.update(chunk);
  });
  response.data.pipe(passThrough);

  const result = await adapter.uploadLarge(input.storageKey, passThrough, contentType, contentLength || 0);
  return {
    result,
    contentType,
    fileSize: contentLength || streamedBytes,
    md5Hash: streamedBytes > 0 ? hash.digest('hex') : '',
  };
}

async function recordExternalCdnUrl(params: TransferParams): Promise<TransferResult> {
  const adapter = StorageService.getActiveAdapter();
  const deliveryUrl = requireMiniProgramDeliveryUrl(params.sourceUrl);
  await verifyTaskOutputDeliveryUrl(deliveryUrl, params.outputType);
  const category: FileCategory = params.outputType === 'video' ? 'ai_video' : 'ai_output';
  const extension = extensionFromUrl(deliveryUrl) || (params.outputType === 'video' ? 'mp4' : 'jpg');
  const originalName = ensureExtension(params.outputName || defaultOutputName(params.outputType, params.outputIndex), extension);
  const fileNo = StorageService.genFileNo();
  const storageKey = `external/${fileNo}.${extension}`;
  const mimeType = params.outputType === 'video' ? 'video/mp4' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
  await query(
    `INSERT INTO files
     (file_no, user_id, provider, storage_key, original_name, mime_type, file_size, width, height, duration, md5_hash, etag, access_url, cdn_url, file_category, visibility, ref_type, ref_id, platform_watermark_removed, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, '', '', ?, ?, ?, 'public', 'task_output', ?, ?, NOW(3))`,
    [
      fileNo,
      params.userId,
      adapter.provider,
      storageKey,
      originalName,
      mimeType,
      deliveryUrl,
      deliveryUrl,
      category,
      String(params.taskId),
      params.metadata?.platformWatermarkRemoved ? 1 : 0,
    ],
  );
  return {
    fileNo,
    storageKey,
    cdnUrl: deliveryUrl,
    width: 0,
    height: 0,
    fileSize: 0,
    mimeType,
    directUrl: true,
  };
}

function assertTaskOutputStorageReady(): void {
  const provider = StorageService.getActiveProvider();
  if (process.env.NODE_ENV === 'production' && provider === 'local') {
    throw new Error('生产环境禁止使用 local 存储保存 AI 生成结果；请切换为 COS/OSS/七牛/又拍云/移动云 EOS，并配置公网 HTTPS CDN 域名。');
  }
}

function requireMiniProgramDeliveryUrl(value: string): string {
  const text = String(value || '').trim();
  if (!text) throw new Error('对象存储没有返回可访问的 CDN URL');
  if (process.env.NODE_ENV !== 'production' && text.startsWith('/')) return text;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`对象存储返回的结果 URL 不是完整 HTTPS 地址：${text.slice(0, 120)}`);
  }
  const host = parsed.hostname.toLowerCase();
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local');
  if (parsed.protocol !== 'https:' || isLocalHost) {
    if (process.env.NODE_ENV !== 'production') return text;
    throw new Error(`AI 生成结果 URL 必须是公网 HTTPS 地址，不能使用相对路径、localhost 或 HTTP：${text.slice(0, 120)}`);
  }
  return parsed.toString();
}

async function verifyTaskOutputDeliveryUrl(url: string, outputType: 'image' | 'video'): Promise<void> {
  const enabled = booleanFlag(process.env.TASK_OUTPUT_VERIFY_DELIVERY, process.env.NODE_ENV === 'production');
  if (!enabled) return;
  const timeout = positiveInt(process.env.TASK_OUTPUT_VERIFY_TIMEOUT_SECONDS, 10) * 1000;
  try {
    const head = await axios.head(url, {
      timeout,
      maxRedirects: 5,
      validateStatus: status => (status >= 200 && status < 300) || status === 405,
    });
    if (head.status >= 200 && head.status < 300) return;
  } catch {
    // Some object stores or signed URLs reject HEAD; try a byte-range GET below.
  }

  try {
    const resp = await axios.get(url, {
      responseType: 'stream',
      timeout,
      maxRedirects: 5,
      headers: { Range: 'bytes=0-0' },
      validateStatus: status => status >= 200 && status < 300,
    });
    const stream = resp.data as NodeJS.ReadableStream & { destroy?: () => void };
    stream.destroy?.();
  } catch (err: any) {
    throw new Error(`${outputType === 'video' ? '视频' : '图片'}结果已上传但公网 URL 无法下载：${err?.message || String(err)}`);
  }
}

function isProbablyBase64(value: string): boolean {
  const text = value.trim();
  if (text.length < 80 || text.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(text);
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(String(value || ''));
}

function shouldSkipTransferForCdnUrl(value: string): boolean {
  if (!booleanFlag(process.env.SKIP_TRANSFER_FOR_CDN_URLS, false)) return false;
  if (!isHttpUrl(value)) return false;
  const lower = value.toLowerCase();
  return /cdn|oss|cos|qiniu|kodo|upaiyun|myqcloud|aliyuncs|qiniucdn|cloudfront|static|assets/.test(lower);
}

function extensionFromUrl(value: string): string {
  try {
    const pathname = new URL(value).pathname;
    const match = pathname.match(/\.([a-z0-9]{2,8})$/i);
    return match ? match[1].toLowerCase() : '';
  } catch {
    return '';
  }
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

function defaultOutputName(outputType: 'image' | 'video', index: number): string {
  return outputType === 'video' ? `video${index + 1}` : `image${index + 1}`;
}

function normalizeContentType(contentType: string, outputType: 'image' | 'video'): string {
  const fallback = outputType === 'video' ? 'application/octet-stream' : 'image/png';
  return String(contentType || fallback).split(';')[0].trim().toLowerCase() || fallback;
}

function validateOutputContent(buffer: Buffer, contentType: string, outputType: 'image' | 'video'): string {
  const declared = normalizeContentType(contentType, outputType);
  if (outputType === 'image') {
    const detected = detectImageMime(buffer);
    if (!detected) {
      throw new Error(`模型返回内容不是有效图片，可能是错误页或 JSON 响应（content-type: ${declared}，开头: ${contentPreview(buffer)}）`);
    }
    return detected;
  }

  if (isMp4Like(buffer)) return 'video/mp4';
  if (declared.startsWith('video/')) return declared;
  if (declared.includes('json') || declared.includes('html') || declared.startsWith('text/')) {
    throw new Error(`模型返回内容不是有效视频，可能是错误页或 JSON 响应（content-type: ${declared}，开头: ${contentPreview(buffer)}）`);
  }
  return declared;
}

function validateStreamContentType(contentType: string, outputType: 'image' | 'video'): void {
  if (outputType === 'image' && !contentType.startsWith('image/')) {
    throw new Error(`模型返回内容不是有效图片（content-type: ${contentType}）`);
  }
  if (outputType === 'video' && (contentType.includes('json') || contentType.includes('html') || contentType.startsWith('text/'))) {
    throw new Error(`模型返回内容不是有效视频（content-type: ${contentType}）`);
  }
}

async function uploadWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  let lastError: any = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (attempt >= maxAttempts) break;
      await sleep(Math.min(1000 * 2 ** (attempt - 1), 5000));
    }
  }
  throw lastError;
}

function positiveInt(value: any, fallback: number): number {
  const parsed = parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function booleanFlag(value: any, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function detectImageMime(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buffer.length >= 6 && (buffer.toString('ascii', 0, 6) === 'GIF87a' || buffer.toString('ascii', 0, 6) === 'GIF89a')) return 'image/gif';
  return null;
}

function isMp4Like(buffer: Buffer): boolean {
  return buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp';
}

function contentPreview(buffer: Buffer): string {
  return buffer
    .subarray(0, 120)
    .toString('utf8')
    .replace(/[^\x20-\x7E\u4e00-\u9fa5]+/g, ' ')
    .trim()
    .slice(0, 120) || '[binary]';
}
