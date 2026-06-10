// services/storage/eos.adapter.ts
// 移动云 EOS 存储适配器 (S3 兼容)

import * as crypto from 'crypto';
import { IStorageAdapter, UploadResult, CredentialOptions, CredentialResult } from './adapter.interface';

interface EosConfig {
  accessKey: string;
  secretKey: string;
  bucket: string;
  endpoint: string;
  region: string;
  cdnDomain: string;
  presignExpireSeconds: number;
}

function getConfig(): EosConfig {
  return {
    accessKey: process.env.EOS_ACCESS_KEY || '',
    secretKey: process.env.EOS_SECRET_KEY || '',
    bucket: process.env.EOS_BUCKET || '',
    endpoint: process.env.EOS_ENDPOINT || 'https://eos-wuxi-1.cmecloud.cn',
    region: process.env.EOS_REGION || 'wuxi-1',
    cdnDomain: process.env.EOS_CDN_DOMAIN || '',
    presignExpireSeconds: parseInt(process.env.EOS_PRESIGN_EXPIRE_SECONDS || '900', 10),
  };
}

function sha256Hex(msg: string | Buffer): string {
  if (Buffer.isBuffer(msg)) return crypto.createHash('sha256').update(msg).digest('hex');
  return crypto.createHash('sha256').update(msg).digest('hex');
}

function hmacSha256(key: Buffer | string, msg: string): Buffer {
  return crypto.createHmac('sha256', key).update(msg).digest();
}

function getSignatureKey(key: string, date: string, region: string, service: string): Buffer {
  const kDate = hmacSha256('AWS4' + key, date);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

function awsSignRequest(
  cfg: EosConfig,
  method: string,
  key: string,
  body: Buffer | null,
  contentType: string,
  additionalSignedHeaders: Record<string, string> = {},
): { authorization: string; date: string; contentSha256: string } {
  const region = cfg.region;
  const service = 's3';
  const host = new URL(cfg.endpoint).host;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const dateStamp = amzDate.substring(0, 8);

  const payloadHash = body ? sha256Hex(body) : 'UNSIGNED-PAYLOAD';
  const canonicalUri = '/' + key;
  const canonicalQueryString = '';

  const headers: Record<string, string> = {
    'host': host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...additionalSignedHeaders,
  };
  if (contentType) headers['content-type'] = contentType;

  const sortedHeaders = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaders.map(function(k) { return k + ':' + headers[k]; }).join('\n') + '\n';
  const signedHeaders = sortedHeaders.join(';');

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = dateStamp + '/' + region + '/' + service + '/aws4_request';
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = getSignatureKey(cfg.secretKey, dateStamp, region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorization = 'AWS4-HMAC-SHA256 Credential=' + cfg.accessKey + '/' + credentialScope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;

  return { authorization, date: amzDate, contentSha256: payloadHash };
}

export class EosAdapter implements IStorageAdapter {
  readonly provider = 'chinamobile_eos';

  private get cfg(): EosConfig {
    return getConfig();
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<UploadResult> {
    const cfg = this.cfg;
    const host = new URL(cfg.endpoint).host;
    const signResult = awsSignRequest(cfg, 'PUT', key, body, contentType);
    const url = cfg.endpoint.replace(/\/$/, '') + '/' + key;

    const resp = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Host': host,
        'x-amz-content-sha256': signResult.contentSha256,
        'x-amz-date': signResult.date,
        'Authorization': signResult.authorization,
      },
      body,
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error('EOS putObject failed: ' + resp.status + ' ' + text);
    }

    const etag = resp.headers.get('etag') || '';
    const cdn = cfg.cdnDomain || cfg.endpoint;
    const baseAccess = cfg.endpoint.replace(/\/$/, '');
    const baseCdn = cdn.replace(/\/$/, '');
    return {
      url: baseAccess + '/' + key,
      cdnUrl: baseCdn + '/' + key,
      etag,
    };
  }

  async uploadLarge(key: string, stream: NodeJS.ReadableStream, contentType: string, _size: number): Promise<UploadResult> {
    const cfg = this.cfg;
    const host = new URL(cfg.endpoint).host;
    const signResult = awsSignRequest(cfg, 'PUT', key, null, contentType);
    const url = cfg.endpoint.replace(/\/$/, '') + '/' + key;

    const resp = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Host': host,
        'x-amz-content-sha256': signResult.contentSha256,
        'x-amz-date': signResult.date,
        'Authorization': signResult.authorization,
      },
      body: stream as any,
      duplex: 'half',
    } as any);

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error('EOS putObject failed: ' + resp.status + ' ' + text);
    }

    const etag = resp.headers.get('etag') || '';
    const cdn = cfg.cdnDomain || cfg.endpoint;
    const baseAccess = cfg.endpoint.replace(/\/$/, '');
    const baseCdn = cdn.replace(/\/$/, '');
    return {
      url: baseAccess + '/' + key,
      cdnUrl: baseCdn + '/' + key,
      etag,
    };
  }

  async delete(key: string): Promise<void> {
    const cfg = this.cfg;
    const host = new URL(cfg.endpoint).host;
    const signResult = awsSignRequest(cfg, 'DELETE', key, null, '');
    const url = cfg.endpoint.replace(/\/$/, '') + '/' + key;

    const resp = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Host': host,
        'x-amz-date': signResult.date,
        'Authorization': signResult.authorization,
      },
    });
    if (!resp.ok && resp.status !== 204) {
      const text = await resp.text();
      throw new Error('EOS delete failed: ' + resp.status + ' ' + text);
    }
  }

  getAccessUrl(key: string): string {
    return this.cfg.endpoint.replace(/\/$/, '') + '/' + key;
  }

  getCdnUrl(key: string): string {
    const cdn = this.cfg.cdnDomain || this.cfg.endpoint;
    return cdn.replace(/\/$/, '') + '/' + key;
  }

  async generateCredential(options: CredentialOptions): Promise<CredentialResult> {
    const cfg = this.cfg;
    const region = cfg.region;
    const service = 's3';
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const dateStamp = amzDate.substring(0, 8);
    const expireSeconds = options.expireSeconds ?? cfg.presignExpireSeconds;
    const expiration = new Date(now.getTime() + expireSeconds * 1000).toISOString();

    const credential = cfg.accessKey + '/' + dateStamp + '/' + region + '/' + service + '/aws4_request';
    const conditions: any[] = [
      { bucket: cfg.bucket },
      { key: options.storageKey },
      { 'content-type': options.contentType },
      ['content-length-range', 0, options.maxFileSize],
      { 'x-amz-algorithm': 'AWS4-HMAC-SHA256' },
      { 'x-amz-credential': credential },
      { 'x-amz-date': amzDate },
    ];

    const policy = Buffer.from(JSON.stringify({ expiration, conditions })).toString('base64');
    const signingKey = getSignatureKey(cfg.secretKey, dateStamp, region, service);
    const signature = crypto.createHmac('sha256', signingKey).update(policy).digest('hex');

    const fields: Record<string, string> = {
      key: options.storageKey,
      'content-type': options.contentType,
      'x-amz-algorithm': 'AWS4-HMAC-SHA256',
      'x-amz-credential': credential,
      'x-amz-date': amzDate,
      policy,
      'x-amz-signature': signature,
    };

    return {
      provider: 'chinamobile_eos',
      storageKey: options.storageKey,
      uploadUrl: cfg.endpoint.replace(/\/$/, '') + '/' + options.storageKey,
      cdnUrl: this.getCdnUrl(options.storageKey),
      credential: fields,
      expireAt: Math.floor(now.getTime() / 1000) + expireSeconds,
    };
  }
}
