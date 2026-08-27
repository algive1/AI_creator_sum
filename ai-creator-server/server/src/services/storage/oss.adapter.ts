// services/storage/oss.adapter.ts
// 阿里云 OSS 存储适配器

import * as crypto from 'crypto';
import { IStorageAdapter, UploadResult, CredentialOptions, CredentialResult, UploadOptions } from './adapter.interface';

interface OssConfig {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  endpoint: string;
  region: string;
  cdnDomain: string;
  ramRoleArn: string;
  stsEndpoint: string;
  stsDurationSeconds: number;
}

function getConfig(): OssConfig {
  return {
    accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
    bucket: process.env.OSS_BUCKET || '',
    endpoint: process.env.OSS_ENDPOINT || 'https://oss-cn-hangzhou.aliyuncs.com',
    region: process.env.OSS_REGION || 'oss-cn-hangzhou',
    cdnDomain: process.env.OSS_CDN_DOMAIN || '',
    ramRoleArn: process.env.OSS_RAM_ROLE_ARN || '',
    stsEndpoint: process.env.OSS_STS_ENDPOINT || 'sts.cn-hangzhou.aliyuncs.com',
    stsDurationSeconds: parseInt(process.env.OSS_STS_DURATION_SECONDS || '900', 10),
  };
}

// 调用 STS AssumeRole
async function callStsApi(cfg: OssConfig): Promise<{
  accessKeyId: string;
  accessKeySecret: string;
  securityToken: string;
  expiration: string;
}> {
  const params: Record<string, string> = {
    Action: 'AssumeRole',
    Version: '2015-04-01',
    RoleArn: cfg.ramRoleArn,
    RoleSessionName: `upload-${Date.now()}`,
    DurationSeconds: String(cfg.stsDurationSeconds),
    Format: 'JSON',
    Timestamp: new Date().toISOString().replace(/\.\d{3}/, 'Z'),
    SignatureMethod: 'HMAC-SHA1',
    SignatureVersion: '1.0',
    SignatureNonce: Math.random().toString(36).substring(2),
    AccessKeyId: cfg.accessKeyId,
  };

  // 按 key 排序
  const sortedKeys = Object.keys(params).sort();
  const canonicalizedQueryString = sortedKeys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
  const stringToSign = `POST&${encodeURIComponent('/')}&${encodeURIComponent(canonicalizedQueryString)}`;
  const signature = crypto.createHmac('sha1', `${cfg.accessKeySecret}&`).update(stringToSign).digest('base64');

  const url = `https://${cfg.stsEndpoint}/?${canonicalizedQueryString}&Signature=${encodeURIComponent(signature)}`;

  const resp = await fetch(url, { method: 'POST' });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OSS STS call failed: ${resp.status} ${text}`);
  }

  const data = await resp.json() as any;
  if (data.Code && data.Code !== '200') {
    throw new Error(`OSS STS error: ${data.Code} ${data.Message}`);
  }

  const cred = data.Credentials;
  return {
    accessKeyId: cred.AccessKeyId,
    accessKeySecret: cred.AccessKeySecret,
    securityToken: cred.SecurityToken,
    expiration: cred.Expiration,
  };
}

export class OssAdapter implements IStorageAdapter {
  readonly provider = 'aliyun_oss';

  private get cfg(): OssConfig {
    return getConfig();
  }

  private buildHost(): string {
    const ep = this.cfg.endpoint.replace(/^https?:\/\//, '');
    return `${this.cfg.bucket}.${ep}`;
  }

  async upload(key: string, body: Buffer, contentType: string, _options?: UploadOptions): Promise<UploadResult> {
    const cfg = this.cfg;
    const host = this.buildHost();
    const date = new Date().toUTCString();

    // OSS Signature V2
    const verb = 'PUT';
    const md5 = '';
    const resource = `/${cfg.bucket}/${key}`;
    const stringToSign = `${verb}\n${md5}\n${contentType}\n${date}\nx-oss-security-token:${''}\n${resource}`;

    const signature = crypto.createHmac('sha1', cfg.accessKeySecret).update(stringToSign).digest('base64');
    const auth = `OSS ${cfg.accessKeyId}:${signature}`;

    const url = `${cfg.endpoint}/${key}`;
    const resp = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Date': date,
        'Authorization': auth,
        'Host': host,
      },
      body,
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`OSS putObject failed: ${resp.status} ${text}`);
    }

    const etag = resp.headers.get('etag') || '';
    const cdn = cfg.cdnDomain || cfg.endpoint;
    return {
      url: `${cfg.endpoint}/${key}`,
      cdnUrl: `${cdn.replace(/\/$/, '')}/${key}`,
      etag,
    };
  }

  async uploadLarge(key: string, stream: NodeJS.ReadableStream, contentType: string, size: number, _options?: UploadOptions): Promise<UploadResult> {
    const cfg = this.cfg;
    const host = this.buildHost();
    const date = new Date().toUTCString();
    const verb = 'PUT';
    const resource = `/${cfg.bucket}/${key}`;
    const stringToSign = `${verb}\n\n${contentType}\n${date}\nx-oss-security-token:${''}\n${resource}`;
    const signature = crypto.createHmac('sha1', cfg.accessKeySecret).update(stringToSign).digest('base64');
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Date': date,
      'Authorization': `OSS ${cfg.accessKeyId}:${signature}`,
      'Host': host,
    };
    if (size > 0) headers['Content-Length'] = String(size);

    const resp = await fetch(`${cfg.endpoint}/${key}`, {
      method: 'PUT',
      headers,
      body: stream as any,
      duplex: 'half',
    } as any);

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`OSS putObject failed: ${resp.status} ${text}`);
    }

    const cdn = cfg.cdnDomain || cfg.endpoint;
    return {
      url: `${cfg.endpoint}/${key}`,
      cdnUrl: `${cdn.replace(/\/$/, '')}/${key}`,
      etag: resp.headers.get('etag') || '',
    };
  }

  async delete(key: string): Promise<void> {
    const cfg = this.cfg;
    const host = this.buildHost();
    const date = new Date().toUTCString();
    const verb = 'DELETE';
    const resource = `/${cfg.bucket}/${key}`;
    const stringToSign = `${verb}\n\n\n${date}\n${resource}`;
    const signature = crypto.createHmac('sha1', cfg.accessKeySecret).update(stringToSign).digest('base64');

    const url = `${cfg.endpoint}/${key}`;
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Date': date,
        'Authorization': `OSS ${cfg.accessKeyId}:${signature}`,
        'Host': host,
      },
    });
    if (!resp.ok && resp.status !== 204) {
      const text = await resp.text();
      throw new Error(`OSS delete failed: ${resp.status} ${text}`);
    }
  }

  getAccessUrl(key: string): string {
    return `${this.cfg.endpoint}/${key}`;
  }

  getCdnUrl(key: string): string {
    const cdn = this.cfg.cdnDomain || this.cfg.endpoint;
    return `${cdn.replace(/\/$/, '')}/${key}`;
  }

  async generateCredential(options: CredentialOptions): Promise<CredentialResult> {
    const cfg = this.cfg;
    const stsCred = await callStsApi(cfg);
    const expireAt = Math.floor(new Date(stsCred.expiration).getTime() / 1000);

    return {
      provider: 'aliyun_oss',
      storageKey: options.storageKey,
      uploadUrl: `${cfg.endpoint}/${options.storageKey}`,
      cdnUrl: this.getCdnUrl(options.storageKey),
      credential: {
        accessKeyId: stsCred.accessKeyId,
        accessKeySecret: stsCred.accessKeySecret,
        securityToken: stsCred.securityToken,
        expiration: stsCred.expiration,
      },
      expireAt,
    };
  }
}
