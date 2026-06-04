import fs from 'fs';
import path from 'path';
import os from 'os';

/** 超过此大小的流将先写入临时文件，而不是全部缓存在内存中 */
const MAX_MEMORY_BUFFER_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * 将 ReadableStream 收集为 Buffer。
 * 对于小于 50MB 的流直接使用内存缓冲区；对于更大的流，先写入临时文件再读取，
 * 以避免内存溢出。
 */
export async function streamToBuffer(
  stream: NodeJS.ReadableStream,
  _contentType?: string,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalSize = 0;

  for await (const chunk of stream as AsyncIterable<Buffer>) {
    const buf = Buffer.from(chunk);
    totalSize += buf.length;

    if (totalSize <= MAX_MEMORY_BUFFER_BYTES) {
      chunks.push(buf);
      continue;
    }

    // 回退到临时文件以避免 OOM
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `ai-creator-upload-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`);
    try {
      // 将之前缓存的块写入临时文件
      const ws = fs.createWriteStream(tmpFile);
      for (const c of chunks) {
        ws.write(c);
      }
      ws.write(buf);

      // 继续将剩余块流式写入临时文件
      for await (const remaining of stream as AsyncIterable<Buffer>) {
        ws.write(Buffer.from(remaining));
      }
      ws.end();

      await new Promise<void>((resolve, reject) => {
        ws.on('finish', resolve);
        ws.on('error', reject);
      });

      const result = fs.readFileSync(tmpFile);
      return result;
    } finally {
      // 清理临时文件
      try { fs.unlinkSync(tmpFile); } catch { /* ignore cleanup errors */ }
    }
  }

  return Buffer.concat(chunks);
}
