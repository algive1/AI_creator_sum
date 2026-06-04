// services/storage/qiniu.adapter.ts
// 七牛云 Kodo 存储适配器

import * as crypto from 'crypto';
import { IStorageAdapter, UploadResult, CredentialOptions, CredentialResult } from './adapter.interface';
import { streamToBuffer } from './stream-helpers';

interface QiniuConfig {
  accessKey: string;
  secretKey: string;
  bucket: string;
  zone: string;
  cdnDomain: string;
  callbackUrl: string;
  callbackBody: string;
  tokenExpireSeconds: number;
}

// Zone -> upload host mapping
const ZONE_UPLOAD_HOSTS: Record<string, string> = {
  z0: 'https://upload-z0.qiniup.com',
  z1: 'https://upload-z1.qiniup.com',
  z2: 'https://upload-z2.qiniup.com',
  na0: 'https://upload-na0.qiniup.com',
  as0: 'https://upload-as0.qiniup.com',
};

function getConfig(): QiniuConfig {
  return {
    accessKey: process.env.QINIU_ACCESS_KEY || '',
    secretKey: process.env.QINIU_SECRET_KEY || '',
    bucket: process.env.QINIU_BUCKET || '',
    zone: process.env.QINIU_ZONE || 'z0',
    cdnDomain: process.env.QINIU_CDN_DOMAIN || '',
    callbackUrl: process.env.QINIU_CALLBACK_URL || '',
    callbackBody: process.env.QINIU_CALLBACK_BODY || 'key=$(key)&etag=$(etag)&fsize=$(fsize)&mimeType=$(mimeType)',
    tokenExpireSeconds: parseInt(process.env.QINIU_TOKEN_EXPIRE_SECONDS || '3600', 10),
  };
}

function btoaSafe(str: string): string {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// 七牛云管理 API 签名 (用于 delete 等)
function qiniuMacToken(cfg: QiniuConfig, method: string, path: string, body: string = ''): string {
  const signingStr = `${method} ${path}\nHost: rs.qiniuapi.com\nContent-Type: application/json\n\n${body}`;
  const sign = btoaSafe(crypto.createHmac('sha1', cfg.secretKey).update(signingStr).digest().toString('base64'));
  return `Qiniu ${cfg.accessKey}:${sign}`;
}

export class QiniuAdapter implements IStorageAdapter {
  readonly provider = 'qiniu_kodo';

  private get cfg(): QiniuConfig {
    return getConfig();
  }

  private getUploadHost(): string {
    return ZONE_UPLOAD_HOSTS[this.cfg.zone] || 'https://upload.qiniup.com';
  }

  /** 生成 Upload Token */
  private generateUploadToken(key: string, expireSeconds?: number): string {
    const cfg = this.cfg;
    const deadline = Math.floor(Date.now() / 1000) + (expireSeconds ?? cfg.tokenExpireSeconds);
    const policy: any = {
      scope: `${cfg.bucket}:${key}`,
      deadline,
    };
    if (cfg.callbackUrl) {
      policy.callbackUrl = cfg.callbackUrl;
      policy.callbackBody = cfg.callbackBody;
    }
    const encodedPutPolicy = btoaSafe(JSON.stringify(policy));
    const sign = btoaSafe(crypto.createHmac('sha1', cfg.secretKey).update(encodedPutPolicy).digest().toString('base64'));
    return `${cfg.accessKey}:${sign}:${encodedPutPolicy}`;
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<UploadResult> {
    const cfg = this.cfg;
    const uploadToken = this.generateUploadToken(key);
    const form = new FormData();
    form.append('token', uploadToken);
    form.append('key', key);
    form.append('file', new Blob([body], { type: contentType }), key.split('/').pop() || 'file');

    const resp = await fetch(this.getUploadHost(), { method: 'POST', body: form });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Qiniu upload failed: ${resp.status} ${text}`);
    }

    const result = await resp.json() as any;
    const cdnHost = cfg.cdnDomain || `https://${cfg.bucket}.qiniucdn.com`;
    return {
      url: `${cdnHost}/${key}`,
      cdnUrl: `${cdnHost.replace(/\/$/, '')}/${key}`,
      etag: result.etag || result.hash || '',
    };
  }

  async uploadLarge(key: string, stream: NodeJS.ReadableStream, contentType: string, _size: number): Promise<UploadResult> {
    const buffer = await streamToBuffer(stream, contentType);
    return this.upload(key, buffer, contentType);
  }

  async delete(key: string): Promise<void> {
    const cfg = this.cfg;
    const entry = btoaSafe(`${cfg.bucket}:${key}`);
    const path = `/delete/${entry}`;
    const token = qiniuMacToken(cfg, 'POST', path);

    const resp = await fetch(`https://rs.qiniuapi.com${path}`, {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
      },
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Qiniu delete failed: ${resp.status} ${text}`);
    }
  }

  getAccessUrl(key: string): string {
    const cdn = this.cfg.cdnDomain || `https://${this.cfg.bucket}.qiniucdn.com`;
    return `${cdn.replace(/\/$/, '')}/${key}`;
  }

  getCdnUrl(key: string): string {
    return this.getAccessUrl(key);
  }

  async generateCredential(options: CredentialOptions): Promise<CredentialResult> {
    const cfg = this.cfg;
    const expireSeconds = options.expireSeconds ?? cfg.tokenExpireSeconds;
    const uploadToken = this.generateUploadToken(options.storageKey, expireSeconds);

    // 从 token 中解析 deadline
    const parts = uploadToken.split(':');
    const policyJson = parts.length >= 3 ? Buffer.from(parts[2], 'base64').toString('utf8') : '{}';
    let deadline = 0;
    try { deadline = JSON.parse(policyJson).deadline; } catch { /* ignore */ }

    return {
      provider: 'qiniu_kodo',
      storageKey: options.storageKey,
      uploadUrl: this.getUploadHost(),
      cdnUrl: this.getCdnUrl(options.storageKey),
      credential: {
        uploadToken,
        domain: cfg.cdnDomain || `https://${cfg.bucket}.qiniucdn.com`,
      },
      expireAt: deadline || Math.floor(Date.now() / 1000) + expireSeconds,
    };
  }
}
