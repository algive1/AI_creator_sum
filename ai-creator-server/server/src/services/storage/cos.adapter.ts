// services/storage/cos.adapter.ts
// 腾讯云 COS 存储适配器

import * as crypto from "crypto";
import { Stream } from "stream";
import COS from "cos-nodejs-sdk-v5";
import { IStorageAdapter, UploadResult, CredentialOptions, CredentialResult } from "./adapter.interface";

interface CosConfig {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  cdnDomain: string;
  stsEndpoint: string;
  stsDurationSeconds: number;
}

function getConfig(): CosConfig {
  return {
    secretId: String(process.env.COS_SECRET_ID || "").trim(),
    secretKey: String(process.env.COS_SECRET_KEY || "").trim(),
    bucket: String(process.env.COS_BUCKET || "").trim(),
    region: String(process.env.COS_REGION || "ap-guangzhou").trim(),
    cdnDomain: String(process.env.COS_CDN_DOMAIN || "").trim(),
    stsEndpoint: String(process.env.COS_STS_ENDPOINT || "sts.tencentcloudapi.com").trim(),
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

function getBucketAppId(bucket: string): string {
  const match = bucket.match(/-(\d+)$/);
  if (!match) {
    throw new Error("COS_BUCKET must include the APPID suffix, for example my-bucket-1250000000");
  }
  return match[1];
}

function getObjectResource(cfg: CosConfig, key: string): string {
  return `qcs::cos:${cfg.region}:uid/${getBucketAppId(cfg.bucket)}:${cfg.bucket}/${key}`;
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

// 简易的腾讯云 API 调用（STS GetFederationToken）
async function callStsApi(cfg: CosConfig, policy: object, durationSeconds = cfg.stsDurationSeconds): Promise<{
  tmpSecretId: string;
  tmpSecretKey: string;
  sessionToken: string;
  expiredTime: number;
}> {
  const host = cfg.stsEndpoint;
  const service = "sts";
  const action = "GetFederationToken";
  const version = "2018-08-13";
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().split("T")[0];
  const payload = JSON.stringify({
    Name: "upload-credential",
    Policy: JSON.stringify(policy),
    DurationSeconds: durationSeconds,
  });

  // 腾讯云 API v3 签名
  const hashedPayload = crypto.createHash("sha256").update(payload).digest("hex");
  const httpRequestMethod = "POST";
  const canonicalUri = "/";
  const canonicalQueryString = "";
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`;
  const signedHeaders = "content-type;host";

  const canonicalRequest = [
    httpRequestMethod,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join("\n");

  const algorithm = "TC3-HMAC-SHA256";
  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonicalRequest = crypto.createHash("sha256").update(canonicalRequest).digest("hex");
  const stringToSign = [algorithm, timestamp, credentialScope, hashedCanonicalRequest].join("\n");

  const kDate = crypto.createHmac("sha256", `TC3${cfg.secretKey}`).update(date).digest();
  const kService = crypto.createHmac("sha256", kDate).update(service).digest();
  const kSigning = crypto.createHmac("sha256", kService).update("tc3_request").digest();
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  const authorization = `${algorithm} Credential=${cfg.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const resp = await fetch(`https://${host}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Host": host,
      "X-TC-Action": action,
      "X-TC-Region": cfg.region,
      "X-TC-Version": version,
      "X-TC-Timestamp": String(timestamp),
      "Authorization": authorization,
    },
    body: payload,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`COS STS call failed: ${resp.status} ${text}`);
  }

  const data = await resp.json() as any;
  if (data.Response?.Error) {
    throw new Error(`COS STS error: ${data.Response.Error.Code} ${data.Response.Error.Message}`);
  }

  const cred = data.Response.Credentials;
  return {
    tmpSecretId: cred.TmpSecretId,
    tmpSecretKey: cred.TmpSecretKey,
    sessionToken: cred.Token,
    expiredTime: data.Response.ExpiredTime,
  };
}

export class CosAdapter implements IStorageAdapter {
  readonly provider = "tencent_cos";

  private get cfg(): CosConfig {
    return getConfig();
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<UploadResult> {
    const cfg = this.cfg;
    const result = await putObject(createClient(cfg), {
      Bucket: cfg.bucket,
      Region: cfg.region,
      Key: key,
      Body: body,
      ContentType: contentType,
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
  ): Promise<UploadResult> {
    const cfg = this.cfg;
    const result = await putObject(createClient(cfg), {
      Bucket: cfg.bucket,
      Region: cfg.region,
      Key: key,
      Body: stream as unknown as Stream,
      ContentType: contentType,
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
    const cred = await callStsApi(cfg, {
      version: "2.0",
      statement: [{
        effect: "allow",
        action: ["name/cos:PutObject"],
        resource: [getObjectResource(cfg, options.storageKey)],
      }],
    }, expireSeconds);

    return {
      provider: "tencent_cos",
      storageKey: options.storageKey,
      uploadUrl: `https://${cfg.bucket}.cos.${cfg.region}.myqcloud.com`,
      cdnUrl: this.getCdnUrl(options.storageKey),
      credential: {
        tmpSecretId: cred.tmpSecretId,
        tmpSecretKey: cred.tmpSecretKey,
        sessionToken: cred.sessionToken,
        expiredTime: String(cred.expiredTime),
      },
      expireAt: cred.expiredTime,
    };
  }
}
