// services/storage/cos.adapter.ts
// 腾讯云 COS 存储适配器

import * as crypto from "crypto";
import { IStorageAdapter, UploadResult, CredentialOptions, CredentialResult } from "./adapter.interface";
import { streamToBuffer } from "./stream-helpers";

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
    secretId: process.env.COS_SECRET_ID || "",
    secretKey: process.env.COS_SECRET_KEY || "",
    bucket: process.env.COS_BUCKET || "",
    region: process.env.COS_REGION || "ap-guangzhou",
    cdnDomain: process.env.COS_CDN_DOMAIN || "",
    stsEndpoint: process.env.COS_STS_ENDPOINT || "sts.tencentcloudapi.com",
    stsDurationSeconds: parseInt(process.env.COS_STS_DURATION_SECONDS || "1800", 10),
  };
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

// 腾讯云 COS Object PUT (使用临时密钥)
async function cosPutObject(
  cfg: CosConfig,
  key: string,
  body: Buffer,
  contentType: string,
  cred: { tmpSecretId: string; tmpSecretKey: string; sessionToken: string },
): Promise<string> {
  const host = `${cfg.bucket}.cos.${cfg.region}.myqcloud.com`;
  const url = `https://${host}/${encodeURIComponent(key)}`;
  const date = new Date().toUTCString();

  // COS 签名 (HMAC-SHA1)
  const signTime = `${Math.floor(Date.now() / 1000) - 60};${Math.floor(Date.now() / 1000) + 3600}`;
  const signKey = crypto.createHmac("sha1", cred.tmpSecretKey).update(signTime).digest();
  const httpString = `put\n/${encodeURIComponent(key)}\n\nhost=${host}\n`;
  const stringToSign = `sha1\n${signTime}\n${crypto.createHash("sha1").update(httpString).digest("hex")}\n`;
  const signature = crypto.createHmac("sha1", signKey).update(stringToSign).digest("hex");

  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Host": host,
      "Date": date,
      "Authorization": `q-sign-algorithm=sha1&q-ak=${cred.tmpSecretId}&q-sign-time=${signTime}&q-key-time=${signTime}&q-header-list=host&q-url-param-list=&q-signature=${signature}`,
      "x-cos-security-token": cred.sessionToken,
    },
    body,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`COS putObject failed: ${resp.status} ${text}`);
  }

  return resp.headers.get("etag") || "";
}

export class CosAdapter implements IStorageAdapter {
  readonly provider = "tencent_cos";

  private get cfg(): CosConfig {
    return getConfig();
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<UploadResult> {
    const cfg = this.cfg;
    // 获取临时密钥
    const cred = await callStsApi(cfg, {
      version: "2.0",
      statement: [{
        effect: "allow",
        action: ["name/cos:PutObject"],
        resource: [`qcs::cos:${cfg.region}:uid/*:${cfg.bucket}/${key}`],
      }],
    });

    const etag = await cosPutObject(cfg, key, body, contentType, cred);
    const cdn = cfg.cdnDomain || `https://${cfg.bucket}.cos.${cfg.region}.myqcloud.com`;
    const cdnUrl = `${cdn.replace(/\/$/, "")}/${key}`;
    return {
      url: `https://${cfg.bucket}.cos.${cfg.region}.myqcloud.com/${key}`,
      cdnUrl,
      etag,
    };
  }

  async uploadLarge(
    key: string,
    stream: NodeJS.ReadableStream,
    contentType: string,
    _size: number,
  ): Promise<UploadResult> {
    const buffer = await streamToBuffer(stream, contentType);
    return this.upload(key, buffer, contentType);
  }

  async delete(key: string): Promise<void> {
    const cfg = this.cfg;
    const host = `${cfg.bucket}.cos.${cfg.region}.myqcloud.com`;
    const url = `https://${host}/${encodeURIComponent(key)}`;
    const date = new Date().toUTCString();

    const signTime = `${Math.floor(Date.now() / 1000) - 60};${Math.floor(Date.now() / 1000) + 3600}`;
    const signKey = crypto.createHmac("sha1", cfg.secretKey).update(signTime).digest();
    const httpString = `delete\n/${encodeURIComponent(key)}\n\nhost=${host}\n`;
    const stringToSign = `sha1\n${signTime}\n${crypto.createHash("sha1").update(httpString).digest("hex")}\n`;
    const signature = crypto.createHmac("sha1", signKey).update(stringToSign).digest("hex");

    const resp = await fetch(url, {
      method: "DELETE",
      headers: {
        "Host": host,
        "Date": date,
        "Authorization": `q-sign-algorithm=sha1&q-ak=${cfg.secretId}&q-sign-time=${signTime}&q-key-time=${signTime}&q-header-list=host&q-url-param-list=&q-signature=${signature}`,
      },
    });
    if (!resp.ok && resp.status !== 204) {
      const text = await resp.text();
      throw new Error(`COS delete failed: ${resp.status} ${text}`);
    }
  }

  getAccessUrl(key: string): string {
    const cfg = this.cfg;
    return `https://${cfg.bucket}.cos.${cfg.region}.myqcloud.com/${key}`;
  }

  getCdnUrl(key: string): string {
    const cdn = this.cfg.cdnDomain || this.getAccessUrl(key);
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
        resource: [`qcs::cos:${cfg.region}:uid/*:${cfg.bucket}/${options.storageKey}`],
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
