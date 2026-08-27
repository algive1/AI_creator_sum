// services/storage/adapter.interface.ts
// 存储适配器统一接口 + 类型定义

import crypto from 'crypto';

export interface UploadResult {
  url: string;
  cdnUrl: string;
  etag?: string;
}

export interface UploadOptions {
  publicRead?: boolean;
}

export interface CredentialOptions {
  storageKey: string;
  contentType: string;
  maxFileSize: number;
  expireSeconds?: number;
}

export interface CredentialResult {
  provider: string;
  storageKey: string;
  uploadUrl: string;
  cdnUrl: string;
  credential: Record<string, string>;
  expireAt: number; // Unix timestamp (seconds)
}

export interface IStorageAdapter {
  readonly provider: string;

  /** 后端中转上传 (Buffer) */
  upload(key: string, body: Buffer, contentType: string, options?: UploadOptions): Promise<UploadResult>;

  /** 后端中转上传 (Stream, 大文件) */
  uploadLarge(
    key: string,
    stream: NodeJS.ReadableStream,
    contentType: string,
    size: number,
    options?: UploadOptions,
  ): Promise<UploadResult>;

  /** 删除对象存储中的文件 */
  delete(key: string): Promise<void>;

  setVisibility?(key: string, visibility: FileVisibility): Promise<void>;

  /** 获取原始访问地址 */
  getAccessUrl(key: string): string;

  /** 获取 CDN 加速地址 */
  getCdnUrl(key: string): string;

  /** 生成前端直传凭证 (各提供商实现不同) */
  generateCredential(options: CredentialOptions): Promise<CredentialResult>;
}

/** 文件类别枚举 */
export type FileCategory =
  | 'avatar'
  | 'ref_image'
  | 'ref_video'
  | 'ref_audio'
  | 'template_cover'
  | 'ai_output'
  | 'ai_video'
  | 'general';

/** 文件可见性 */
export type FileVisibility = 'private' | 'public';

/** 存储提供商枚举 */
export const SUPPORTED_STORAGE_PROVIDERS = [
  'local',
  'tencent_cos',
  'aliyun_oss',
  'qiniu_kodo',
  'upyun_uss',
  'chinamobile_eos',
] as const;

export type StorageProvider = typeof SUPPORTED_STORAGE_PROVIDERS[number];

export function isSupportedStorageProvider(provider: string): provider is StorageProvider {
  return (SUPPORTED_STORAGE_PROVIDERS as readonly string[]).includes(provider);
}

/** files 表记录 */
export interface FileRecord {
  id: number;
  fileNo: string;
  userId: number | null;
  provider: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  width: number;
  height: number;
  duration: number;
  md5Hash: string;
  etag: string;
  accessUrl: string;
  cdnUrl: string;
  fileCategory: FileCategory;
  visibility: FileVisibility;
  refType: string | null;
  refId: string | null;
  isDeleted: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 生成存储 key: {category}/{YYYY-MM}/{randomId}.{ext} */
export function genStorageKey(category: FileCategory, originalName: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const ext = originalName.includes('.')
    ? originalName.split('.').pop() || 'bin'
    : 'bin';
  const id = crypto.randomBytes(9).toString('base64url').substring(0, 12);
  const sanitizedExt = ext.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10) || 'bin';
  return `${category}/${yyyy}-${mm}/${id}.${sanitizedExt}`;
}

/** 生成文件编号 (12位，密码学安全随机) */
export function genFileNo(): string {
  return crypto.randomBytes(9).toString('base64url').substring(0, 12).toUpperCase();
}
