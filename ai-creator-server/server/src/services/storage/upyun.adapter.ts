// services/storage/upyun.adapter.ts
// Upyun USS storage adapter

import * as crypto from 'crypto';
import { IStorageAdapter, UploadResult, CredentialOptions, CredentialResult } from './adapter.interface';
import { streamToBuffer } from './stream-helpers';

interface UpyunConfig {
  bucket: string;
  operator: string;
  password: string;
  cdnDomain: string;
  returnUrl: string;
}

function getConfig(): UpyunConfig {
  return {
    bucket: process.env.UPYUN_BUCKET || '',
    operator: process.env.UPYUN_OPERATOR || '',
    password: process.env.UPYUN_PASSWORD || '',
    cdnDomain: process.env.UPYUN_CDN_DOMAIN || '',
    returnUrl: process.env.UPYUN_RETURN_URL || '',
  };
}

function md5(str: string): string {
  return crypto.createHash('md5').update(str).digest('hex');
}

function signPolicy(policy: string, password: string): string {
  return md5(policy + md5(password));
}

function restAuth(cfg: UpyunConfig, method: string, uri: string, date: string, contentMd5: string): string {
  const signStr = method + '&' + uri + '&' + date + '&' + contentMd5 + '&' + md5(cfg.password);
  const hmac = crypto.createHmac('sha1', md5(cfg.password)).update(signStr).digest('base64');
  return 'UPYUN ' + cfg.operator + ':' + hmac;
}

export class UpyunAdapter implements IStorageAdapter {
  readonly provider = 'upyun_uss';

  private get cfg(): UpyunConfig { return getConfig(); }

  async upload(key: string, body: Buffer, contentType: string): Promise<UploadResult> {
    const cfg = this.cfg;
    const uri = '/' + cfg.bucket + '/' + key;
    const date = new Date().toUTCString();
    const contentMd5 = crypto.createHash('md5').update(body).digest('hex');
    const auth = restAuth(cfg, 'PUT', uri, date, contentMd5);

    const url = 'https://v0.api.upyun.com' + uri;
    const resp = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType, 'Date': date, 'Content-MD5': contentMd5, 'Authorization': auth },
      body,
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error('Upyun upload failed: ' + resp.status + ' ' + text);
    }

    const cdn = cfg.cdnDomain || 'https://' + cfg.bucket + '.b0.upaiyun.com';
    const baseCdn = cdn.replace(/\/$/, '');
    return { url: baseCdn + '/' + key, cdnUrl: baseCdn + '/' + key };
  }

  async uploadLarge(key: string, stream: NodeJS.ReadableStream, contentType: string, _size: number): Promise<UploadResult> {
    const buffer = await streamToBuffer(stream, contentType);
    return this.upload(key, buffer, contentType);
  }

  async delete(key: string): Promise<void> {
    const cfg = this.cfg;
    const uri = '/' + cfg.bucket + '/' + key;
    const date = new Date().toUTCString();
    const auth = restAuth(cfg, 'DELETE', uri, date, '');
    const url = 'https://v0.api.upyun.com' + uri;
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: { 'Date': date, 'Authorization': auth },
    });
    if (!resp.ok && resp.status !== 204) {
      const text = await resp.text();
      throw new Error('Upyun delete failed: ' + resp.status + ' ' + text);
    }
  }

  getAccessUrl(key: string): string {
    const cdn = this.cfg.cdnDomain || 'https://' + this.cfg.bucket + '.b0.upaiyun.com';
    return cdn.replace(/\/$/, '') + '/' + key;
  }

  getCdnUrl(key: string): string { return this.getAccessUrl(key); }

  async generateCredential(options: CredentialOptions): Promise<CredentialResult> {
    const cfg = this.cfg;
    const expireSeconds = options.expireSeconds ?? 1800;
    const expiration = Math.floor(Date.now() / 1000) + expireSeconds;

    const policyObj: any = {
      bucket: cfg.bucket,
      'save-key': options.storageKey,
      expiration: new Date(expiration * 1000).toISOString(),
      'content-length-range': '0,' + options.maxFileSize,
      'content-type': options.contentType,
    };
    if (cfg.returnUrl) { policyObj['return-url'] = cfg.returnUrl; }

    const policy = Buffer.from(JSON.stringify(policyObj)).toString('base64');
    const signature = signPolicy(policy, cfg.password);
    const uploadUrl = 'https://v0.api.upyun.com/' + cfg.bucket;

    return {
      provider: 'upyun_uss',
      storageKey: options.storageKey,
      uploadUrl,
      cdnUrl: this.getCdnUrl(options.storageKey),
      credential: { saveKey: options.storageKey, policy, signature, bucket: cfg.bucket },
      expireAt: expiration,
    };
  }
}
