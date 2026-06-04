// services/storage/local.adapter.ts
// 本地存储适配器（仅开发环境）

import * as fs from "fs";
import * as path from "path";
import { IStorageAdapter, UploadResult, CredentialOptions, CredentialResult } from "./adapter.interface";
import { buildLocalFileUrl, ensureLocalUploadDir, resolveLocalFilePath } from "./local-paths";

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export class LocalAdapter implements IStorageAdapter {
  readonly provider = "local";

  async upload(key: string, body: Buffer, _contentType: string): Promise<UploadResult> {
    ensureLocalUploadDir();
    const filePath = resolveLocalFilePath(key);
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, body);
    const url = buildLocalFileUrl(key);
    return { url, cdnUrl: url };
  }

  async uploadLarge(
    key: string,
    stream: NodeJS.ReadableStream,
    _contentType: string,
    _size: number,
  ): Promise<UploadResult> {
    ensureLocalUploadDir();
    const filePath = resolveLocalFilePath(key);
    ensureDir(path.dirname(filePath));
    const ws = fs.createWriteStream(filePath);
    return new Promise((resolve, reject) => {
      stream.pipe(ws);
      ws.on("finish", () => {
        const url = buildLocalFileUrl(key);
        resolve({ url, cdnUrl: url });
      });
      ws.on("error", reject);
      stream.on("error", reject);
    });
  }

  async delete(key: string): Promise<void> {
    const filePath = resolveLocalFilePath(key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  getAccessUrl(key: string): string {
    return buildLocalFileUrl(key);
  }

  getCdnUrl(key: string): string {
    return buildLocalFileUrl(key);
  }

  async generateCredential(options: CredentialOptions): Promise<CredentialResult> {
    const expireAt = Math.floor(Date.now() / 1000) + (options.expireSeconds ?? 3600);
    return {
      provider: "local",
      storageKey: options.storageKey,
      uploadUrl: "/api/v1/files/upload",
      cdnUrl: buildLocalFileUrl(options.storageKey),
      credential: { uploadToken: "dev-mode-local" },
      expireAt,
    };
  }
}
