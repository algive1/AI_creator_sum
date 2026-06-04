import fs from 'fs';
import os from 'os';
import path from 'path';
import axios from 'axios';
import sharp from 'sharp';

export interface ImagePostprocessInput {
  sourceUrl?: string;
  sourcePath?: string;
  targetWidth: number;
  targetHeight: number;
  mode: 'cover' | 'contain' | 'resize';
}

export interface ImagePostprocessResult {
  outputPath: string;
  originalWidth: number;
  originalHeight: number;
  targetWidth: number;
  targetHeight: number;
}

export interface ImageWatermarkResult {
  buffer: Buffer;
  width: number;
  height: number;
  contentType: string;
}

export async function postprocessImage(input: ImagePostprocessInput): Promise<ImagePostprocessResult> {
  const sourcePath = input.sourcePath || await downloadToTemp(input.sourceUrl || '');
  const meta = await sharp(sourcePath).metadata();
  const outputPath = path.join(os.tmpdir(), `ai-output-${Date.now()}-${Math.random().toString(16).slice(2)}.png`);

  let pipeline = sharp(sourcePath);
  if (input.mode === 'resize') {
    pipeline = pipeline.resize(input.targetWidth, input.targetHeight, { fit: 'fill' });
  } else {
    pipeline = pipeline.resize(input.targetWidth, input.targetHeight, {
      fit: input.mode === 'contain' ? 'contain' : 'cover',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    });
  }
  await pipeline.png().toFile(outputPath);

  return {
    outputPath,
    originalWidth: meta.width || 0,
    originalHeight: meta.height || 0,
    targetWidth: input.targetWidth,
    targetHeight: input.targetHeight,
  };
}

export async function addPlatformWatermark(buffer: Buffer): Promise<ImageWatermarkResult> {
  const image = sharp(buffer);
  const meta = await image.metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (!width || !height) throw new Error('图片水印处理失败：无法识别图片尺寸');

  const fontSize = Math.max(16, Math.min(36, Math.round(width / 34)));
  const padX = Math.round(fontSize * 0.75);
  const padY = Math.round(fontSize * 0.45);
  const boxWidth = Math.round(fontSize * 8.4 + padX * 2);
  const boxHeight = Math.round(fontSize + padY * 2);
  const margin = Math.max(18, Math.round(Math.min(width, height) * 0.025));
  const svg = `
<svg width="${boxWidth}" height="${boxHeight}" viewBox="0 0 ${boxWidth} ${boxHeight}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${boxWidth}" height="${boxHeight}" rx="${Math.round(boxHeight / 2)}" fill="rgba(15,23,42,0.62)"/>
  <text x="${padX}" y="${Math.round(boxHeight / 2 + fontSize * 0.36)}" fill="#ffffff" font-size="${fontSize}" font-family="Arial, 'Microsoft YaHei', sans-serif" font-weight="700">AI艺术生成工坊</text>
</svg>`;
  const output = await sharp(buffer)
    .composite([{ input: Buffer.from(svg), left: margin, top: Math.max(margin, height - boxHeight - margin) }])
    .png()
    .toBuffer();
  return { buffer: output, width, height, contentType: 'image/png' };
}

async function downloadToTemp(url: string): Promise<string> {
  if (!url) throw new Error('缺少待处理图片地址');
  const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
  const filePath = path.join(os.tmpdir(), `ai-source-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.writeFileSync(filePath, Buffer.from(resp.data));
  return filePath;
}
