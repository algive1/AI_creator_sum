import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import multer from 'multer';

const TEMP_UPLOAD_ROOT = path.join(os.tmpdir(), 'ai-creator-uploads');
export const DEFAULT_MAGIC_READ_BYTES = 512;

export function createDiskUpload(maxFileSize: number) {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        try {
          fs.mkdirSync(TEMP_UPLOAD_ROOT, { recursive: true });
          cb(null, TEMP_UPLOAD_ROOT);
        } catch (err: any) {
          cb(err, TEMP_UPLOAD_ROOT);
        }
      },
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '').replace(/[^a-zA-Z0-9.]/g, '').slice(0, 16);
        cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
      },
    }),
    limits: { fileSize: maxFileSize },
  });
}

export async function readFileHead(filePath: string, bytes = DEFAULT_MAGIC_READ_BYTES): Promise<Buffer> {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const result = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
}

export function readUploadForValidation(file: Express.Multer.File, bytes = DEFAULT_MAGIC_READ_BYTES): Promise<Buffer> {
  return readFileHead(file.path, bytes);
}

export function readUploadForImageMetadata(file: Express.Multer.File, bytes = 256 * 1024): Promise<Buffer> {
  return readFileHead(file.path, bytes);
}

export async function md5File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export function md5Buffer(buffer: Buffer): string {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

export async function cleanupTempUpload(file?: Express.Multer.File | null): Promise<void> {
  const filePath = String(file?.path || '');
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // ignore cleanup errors
  }
}
