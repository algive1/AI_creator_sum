// services/storage/cos.adapter.ts
// 腾讯云 COS 存储适配器

import * as crypto from "crypto";
import { Stream } from "stream";
import COS from "cos-nodejs-sdk-v5";
import { IStorageAdapter, UploadResult, CredentialOptions, CredentialResult, UploadOptions, FileVisibility } from "./adapter.interface";

interface CosConfig {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  cdnDomain: string;
  stsDurationSeconds: number;
}

function getConfig(): CosConfig {
  return {
    secretId: String(process.env.COS_SECRET_ID || "").trim(),
    secretKey: String(process.env.COS_SECRET_KEY || "").trim(),
    bucket: String(process.env.COS_BUCKET || "").trim(),
    region: String(process.env.COS_REGION || "ap-guangzhou").trim(),
    cdnDomain: String(process.env.COS_CDN_DOMAIN || "").trim(),
    stsDurationSeconds: parseInt(process.env.COS_STS_DURATION_SECONDS || "1800", 10),
  };
}

function createClient(cfg: CosConfig): COS {
  return new COS({
    SecretId: cfg.secretId,
    SecretKey: cfg.secretKey,
  });
}

function putObject(client: COS, params: COS.PutObjectParams): Promise<COS.PutObjectResult> {
  return new Promise((resolve, reject) => {
    client.putObject(params, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

function deleteObject(client: COS, params: COS.DeleteObjectParams): Promise<COS.DeleteObjectResult> {
  return new Promise((resolve, reject) => {
    client.deleteObject(params, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

function putObjectAcl(client: COS, params: COS.PutObjectAclParams): Promise<COS.PutObjectAclResult> {
  return new Promise((resolve, reject) => {
    client.putObjectAcl(params, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

function getDefaultCosBaseUrl(cfg: CosConfig): string {
  return `https://${cfg.bucket}.cos.${cfg.region}.myqcloud.com`;
}

function cosDownloadExpireSeconds(cfg: CosConfig): number {
  const configured = parseInt(String(process.env.COS_DOWNLOAD_EXPIRE_SECONDS || process.env.COS_PRESIGN_EXPIRE_SECONDS || ''), 10);
  if (Number.isFinite(configured) && configured > 0) return configured;
  if (Number.isFinite(cfg.stsDurationSeconds) && cfg.stsDurationSeconds > 0) return cfg.stsDurationSeconds;
  return 1800;
}

function normalizeHttpsBaseUrl(value: string, fallback: string): string {
  const text = String(value || '').trim().replace(/\/+$/, '');
  if (!text) return fallback;
  if (/^https:\/\//i.test(text)) return text;
  if (/^http:\/\//i.test(text)) return text.replace(/^http:/i, 'https:');
  if (text.startsWith('//')) return `https:${text}`;
  return `https://${text.replace(/^\/+/, '')}`;
}

function hmacSha1(key: string, message: string): string {
  return crypto.createHmac("sha1", key).update(message).digest("hex");
}

function sha1(message: string): string {
  return crypto.createHash("sha1").update(message).digest("hex");
}

function createPostPolicyCredential(cfg: CosConfig, options: CredentialOptions, expireSeconds: number): CredentialResult {
  const now = Math.floor(Date.now() / 1000);
  const expireAt = now + expireSeconds;
  const keyTime = `${now};${expireAt}`;
  const algorithm = "sha1";
  const contentType = options.contentType || "application/octet-stream";
  const policyText = JSON.stringify({
    expiration: new Date(expireAt * 1000).toISOString(),
    conditions: [
      { bucket: cfg.bucket },
      ["eq", "$key", options.storageKey],
      ["eq", "$Content-Type", contentType],
      ["content-length-range", 1, options.maxFileSize],
      { "q-sign-algorithm": algorithm },
      { "q-ak": cfg.secretId },
      { "q-sign-time": keyTime },
    ],
  });
  const signKey = hmacSha1(cfg.secretKey, keyTime);
  const signature = hmacSha1(signKey, sha1(policyText));

  return {
    provider: "tencent_cos",
    storageKey: options.storageKey,
    uploadUrl: `https://${cfg.bucket}.cos.${cfg.region}.myqcloud.com`,
    cdnUrl: normalizeHttpsBaseUrl(cfg.cdnDomain, getDefaultCosBaseUrl(cfg)).replace(/\/$/, "") + `/${options.storageKey}`,
    credential: {
      key: options.storageKey,
      "Content-Type": contentType,
      policy: Buffer.from(policyText).toString("base64"),
      "q-sign-algorithm": algorithm,
      "q-ak": cfg.secretId,
      "q-key-time": keyTime,
      "q-signature": signature,
      success_action_status: "200",
    },
    expireAt,
  };
}

export class CosAdapter implements IStorageAdapter {
  readonly provider = "tencent_cos";

  private get cfg(): CosConfig {
    return getConfig();
  }

  async upload(key: string, body: Buffer, contentType: string, options?: UploadOptions): Promise<UploadResult> {
    const cfg = this.cfg;
    const result = await putObject(createClient(cfg), {
      Bucket: cfg.bucket,
      Region: cfg.region,
      Key: key,
      Body: body,
      ContentType: contentType,
      ...(options?.publicRead ? { ACL: 'public-read' } : {}),
    });
    const cdn = normalizeHttpsBaseUrl(cfg.cdnDomain, getDefaultCosBaseUrl(cfg));
    const cdnUrl = `${cdn.replace(/\/$/, "")}/${key}`;
    return {
      url: `${getDefaultCosBaseUrl(cfg)}/${key}`,
      cdnUrl,
      etag: result.ETag,
    };
  }

  async uploadLarge(
    key: string,
    stream: NodeJS.ReadableStream,
    contentType: string,
    size: number,
    options?: UploadOptions,
  ): Promise<UploadResult> {
    const cfg = this.cfg;
    const result = await putObject(createClient(cfg), {
      Bucket: cfg.bucket,
      Region: cfg.region,
      Key: key,
      Body: stream as unknown as Stream,
      ContentType: contentType,
      ...(options?.publicRead ? { ACL: 'public-read' } : {}),
      ...(size > 0 ? { ContentLength: size } : {}),
    });
    const cdn = normalizeHttpsBaseUrl(cfg.cdnDomain, getDefaultCosBaseUrl(cfg));
    return {
      url: `${getDefaultCosBaseUrl(cfg)}/${key}`,
      cdnUrl: `${cdn.replace(/\/$/, "")}/${key}`,
      etag: result.ETag,
    };
  }

  async delete(key: string): Promise<void> {
    const cfg = this.cfg;
    await deleteObject(createClient(cfg), {
      Bucket: cfg.bucket,
      Region: cfg.region,
      Key: key,
    });
  }

  async setVisibility(key: string, visibility: FileVisibility): Promise<void> {
    const cfg = this.cfg;
    await putObjectAcl(createClient(cfg), {
      Bucket: cfg.bucket,
      Region: cfg.region,
      Key: key,
      ACL: visibility === 'public' ? 'public-read' : 'private',
    });
  }

  getAccessUrl(key: string): string {
    const cfg = this.cfg;
    const fallback = `${getDefaultCosBaseUrl(cfg)}/${key}`;
    try {
      return createClient(cfg).getObjectUrl({
        Bucket: cfg.bucket,
        Region: cfg.region,
        Key: key,
        Sign: true,
        Method: "GET",
        Expires: cosDownloadExpireSeconds(cfg),
        Protocol: "https:",
      }) || fallback;
    } catch {
      return fallback;
    }
  }

  getCdnUrl(key: string): string {
    const cfg = this.cfg;
    const cdn = normalizeHttpsBaseUrl(cfg.cdnDomain, getDefaultCosBaseUrl(cfg));
    const base = cdn.replace(/\/$/, "");
    return `${base}/${key}`;
  }

  async generateCredential(options: CredentialOptions): Promise<CredentialResult> {
    const cfg = this.cfg;
    const expireSeconds = options.expireSeconds ?? cfg.stsDurationSeconds;
    return createPostPolicyCredential(cfg, options, expireSeconds);
  }
}
