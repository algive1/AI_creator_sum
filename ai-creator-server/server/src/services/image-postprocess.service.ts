import fs from 'fs';
import os from 'os';
import path from 'path';
import axios from 'axios';
import sharp from 'sharp';

export const DEFAULT_WATERMARK_TEXT = 'AI艺术生成工坊';

const WATERMARK_FONT_FAMILY = 'AiCreatorWatermark';
const WATERMARK_FONT_BASE64 =
  'AAEAAAARAQAABAAQR1BPU9/TxK8AAAN8AAAAfEdTVUJtIlkQAAACaAAAAEBPUy8ylBeAJAAAAqgAAABgU1RBVHmga0kAAAIEAAAA' +
  'KmNtYXAu80iwAAADCAAAAHRnYXNwAAAAEAAAASQAAAAIZ2x5ZgT/r2MAAAZYAAAEvmhlYWQi1SFfAAACMAAAADZoaGVhDAQIVgAA' +
  'AbwAAAAkaG10eAz0AQsAAAFcAAAAHmxvY2EFqATcAAABLAAAABZtYXhwAF8CSQAAAXwAAAAgbmFtZTCsUIoAAAP4AAACXnBvc3T/' +
  'hgAyAAABnAAAACBwcmVwaAaMhQAAARwAAAAHdmhlYQxqFwMAAAHgAAAAJHZtdHgIpgDSAAABRAAAABa4Af+FsASNAAABAAH//wAP' +
  'AAAAKwArAE0AWQDWAPEBhQHUAgkCXwAAA+gAAANwAIsAiwAUAIYAFQAfAB4AHgAAA+gAZADjAAACgf/8AUoAWwPoABkALQAZABYA' +
  'HgAyAAAAAQAAAAoCSABUAAAAAAABAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAA/4MAMgAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAASI' +
  '/uAAAAu4/Av9uAtuAAEAAAAAAAAAAAAAAAAAAAAFAAEQAAH0/gwAAAu4/wT9PgtuAAAAAQAAAAAAAAAAAAAAAAABAAEAAQAIAAEA' +
  'AAAUAAEAAAAcAAJ3Z2h0AQEAAAACAAEAAAAAARACvAAAAAAAAQAAAAIBBgNyksBfDzz1AAMD6AAAAADcsCSnAAAAAN+St9f8C/vq' +
  'C24HDgABAAYAAgAAAAAAAAABAAAACgA+AD4ABkRGTFQAKmN5cmwAJmdyZWsAJmhhbmkAJmthbmEAJmxhdG4AJgAAAAAABAAAAAD/' +
  '/wAAAAAABAPhArwABQAAAooCWAAAAEsCigJYAAABXgAyAUUAAAILAgAAAAAAAAAgAACDKt88EAAAABYAAAAAQURCTwAgACCCegNw' +
  '/4gAAASIASBgBgEHAAAAAAIfAt0AAAAgAAYAAAACAAAAAwAAABQAAwABAAAAFAAEAGAAAAAUABAAAwAEACAAQQBJV0pd5WIQZy91' +
  'H4J6//8AAAAgAEEASVdKXeViEGcvdR+Cev///+H/wf+6qLqiIJ32mNiK6X2PAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAACgA8' +
  'AEoABkRGTFQAJmN5cmwAJmdyZWsAJmhhbmkAJmthbmEAJmxhdG4AJgAEAAAAAP//AAEAAAABa2VybgAIAAAAAQAAAAEABAACAAAA' +
  'AQAIAAIAFAAEAAAAIgAaAAEAAgAA//gAAQABAAIAAQACAAEAAQACAAAAAAAKAH4AAwABBAkAAACcAUQAAwABBAkAAQAYASwAAwAB' +
  'BAkAAgAIASQAAwABBAkAAwA6AOoAAwABBAkABAAiAMgAAwABBAkABQBqAF4AAwABBAkABgAeAEAAAwABBAkADgA0AAwAAwABBAkB' +
  'AQAMAAAAAwABBAkBEAAIASQAVwBlAGkAZwBoAHQAaAB0AHQAcAA6AC8ALwBzAGMAcgBpAHAAdABzAC4AcwBpAGwALgBvAHIAZwAv' +
  'AE8ARgBMAE4AbwB0AG8AUwBhAG4AcwBTAEMALQBCAG8AbABkAFYAZQByAHMAaQBvAG4AIAAyAC4AMAAwADQALQBIADIAOwBoAG8A' +
  'dABjAG8AbgB2ACAAMQAuADAALgAxADEAOAA7AG0AYQBrAGUAbwB0AGYAZQB4AGUAIAAyAC4ANQAuADYANQA2ADAAMwBOAG8AdABv' +
  'ACAAUwBhAG4AcwAgAFMAQwAgAEIAbwBsAGQAMgAuADAAMAA0AC0ASAAyADsAQQBEAEIATwA7AE4AbwB0AG8AUwBhAG4AcwBTAEMA' +
  'LQBCAG8AbABkAEIAbwBsAGQATgBvAHQAbwAgAFMAYQBuAHMAIABTAEMAKABjACkAIAAyADAAMQA0AC0AMgAwADIAMQAgAEEAZABv' +
  'AGIAZQAgACgAaAB0AHQAcAA6AC8ALwB3AHcAdwAuAGEAZABvAGIAZQAuAGMAbwBtAC8AKQAsACAAdwBpAHQAaAAgAFIAZQBzAGUA' +
  'cgB2AGUAZAAgAEYAbwBuAHQAIABOAGEAbQBlACAAJwBTAG8AdQByAGMAZQAnAC4AAAAFAGT/iAOEA3AAAwAGAAkADAAPAAAXESER' +
  'AQEhAQERASEBAREBZAMg/nABPv2EAV4BPv1kAnz+wv6iAT54A+j8GAIdAZn+Pv5nAzL8pQGZAcL8zgGZAAL//AAAAoUC5QANABEA' +
  'ACMTMxMjAyYmJyMGBgcDJzUhFQTtr+2caREfEQQOIRBqAwFgAuX9GwGCOn07PHw6/n6+c3MAAQBbAAAA7wLlAAMAADMRMxFblALl' +
  '/RsACAAZ/6YDxwNcAAcACwAPAC0AMQA1AD4ATgAAATcWFhcHJiYHIRUhFyEVITczMAYUBw4DBwYGBwYGJyYmJxYWMzI2Nz4CNyUh' +
  'FSETMxEjJz4CNxcGBgcBMxUUDgIHJiYnPgM1Ak5xDh0HdwUa7QJZ/afQAQX+++N4AQEECg0RDBIpGxhKKQEVECZCEA4RCAsPCwX9' +
  'DAFD/r1udXWCLXN/PxdYtksBzXgUN2tYEDQXUF8xEQNBGyRVHSAdWXJzeW9vEhgIaJVlPA4XEwMEAQIaRBgDAgYIC1Kff7dyAU/9' +
  'YxENJi0XcCNFHAIysT+LjIM3EzAQM3J3cTIAAAMALf/sA78C6gADAAcACwAAEyEVIQMhFSEBMxEjZAMj/N03A5L8bgF/iYkC6n79' +
  '+XkCuf2PAAcAGf+aA8kDWwADACAAKgA1ADkASQBhAAATMxUjNzMwFBQVDgIHBgYHBgYnJiYnFhYzMjY3PgI3ATceAhcHLgIXFwYC' +
  'By4CJzYSASEVISczERQOAgcuAic+AjUBMwYeAzMyNjcWFhcOAiMiLgS25+e5dAIGDQsPIRYUPSQBEg0bLwwKDwUHBwQBASxJHD45' +
  'Ek0RNj5aej/alQggIg2QyP3eAwT8/FB+CBYrIgonJw4mIwoBln4CEiMwOh4REwQVORgJJDwvNldDMB8PAdltbRAVB2qHSw8TEAQE' +
  'AQEaQBYCAgUHCTl1YQFMSA4mJhJQESop8h3D/tVcDSUlDE4BCQFYdnb+2TiFi4AzDSAfBjyVmEEBu3vszZ1YUl4UJgldZSZKhLLQ' +
  '4QAABQAW/6YD0wNRAA4AHQAhACUALwAAAR4DFw4CBy4DJycXDgMHLgInPgMlIRUhATMRIxM3HgIXBy4CAlUfV2ZsNg8lIQw1a2RZ' +
  'I0xtJFpreUAKISEPPnZpVv60A2v8lQF4hISpWBxAPBNeETlAAg04cGpcIQwmKBEoaXuEQiQnSYp5ZiUQJyYNHllrdo93AWz8VQNZ' +
  'SRQzMhRTFTU3AAAFAB7/wwO7A1IAAwAHAAsADwAcAAATIRUhByEVIQchFSEBMxEjAxcOAgcuAic+AtACuP1IKgK7/UVzA4j8eAGE' +
  'fn7nfBU+SCcMJyoPKEM1Apx1sXTKdQOP/K0DRhxNloEwCxsaCCp0hgAABQAy/8MDuQNSAAMAKgAuADIANgAAEyEVISUzNxcGBgcO' +
  'BRUUFjMhMjY2NxYWFw4CIyEiJic0PgQBIRUhNzMRIwEzESOTAk79sgI9EhhVAw0IfbJ2RiILMisBgBofEgIaOxsHLFND/pVybwEK' +
  'IUh6u/3nA4H8f9R7ewFhe3sB+G9uBUIDCAQ+XUMvHxYKFRMUPUAPEwVcYCJOQxQnMDxQaAE9c9X+4AEg/uAAAAA=';

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

export interface PlatformWatermarkSvgInput {
  imageWidth: number;
  imageHeight: number;
}

export interface TextWatermarkSvgInput {
  width: number;
  height: number;
  text?: string;
  fontSize: number;
  opacity: number;
  yPercent?: number;
}

export async function postprocessImage(input: ImagePostprocessInput): Promise<ImagePostprocessResult> {
  const sourcePath = input.sourcePath || await downloadToTemp(input.sourceUrl || '');
  let meta: sharp.Metadata;
  try {
    meta = await sharp(sourcePath).metadata();
  } catch {
    throw new Error('模型返回内容不是有效图片，无法执行图片后处理');
  }
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

  const layout = platformWatermarkLayout(width, height);
  const svg = createPlatformWatermarkSvg({ imageWidth: width, imageHeight: height });
  const output = await sharp(buffer)
    .composite([{ input: svg, left: layout.margin, top: Math.max(layout.margin, height - layout.boxHeight - layout.margin) }])
    .png()
    .toBuffer();
  return { buffer: output, width, height, contentType: 'image/png' };
}

export function createPlatformWatermarkSvg(input: PlatformWatermarkSvgInput): Buffer {
  const layout = platformWatermarkLayout(input.imageWidth, input.imageHeight);
  return Buffer.from(`
<svg width="${layout.boxWidth}" height="${layout.boxHeight}" viewBox="0 0 ${layout.boxWidth} ${layout.boxHeight}" xmlns="http://www.w3.org/2000/svg">
  ${embeddedFontStyle()}
  <rect x="0" y="0" width="${layout.boxWidth}" height="${layout.boxHeight}" rx="${Math.round(layout.boxHeight / 2)}" fill="rgba(15,23,42,0.62)"/>
  <text x="${layout.padX}" y="${Math.round(layout.boxHeight / 2 + layout.fontSize * 0.36)}" fill="#ffffff" font-size="${layout.fontSize}" font-family="${WATERMARK_FONT_FAMILY}, sans-serif" font-weight="700">${DEFAULT_WATERMARK_TEXT}</text>
</svg>`);
}

export function createTextWatermarkSvg(input: TextWatermarkSvgInput): Buffer {
  const text = escapeXml(String(input.text || DEFAULT_WATERMARK_TEXT).slice(0, 40));
  const width = Math.max(1, Math.round(input.width || 800));
  const height = Math.max(1, Math.round(input.height || 800));
  const yPercent = Math.min(96, Math.max(4, input.yPercent ?? 88));
  return Buffer.from(`
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  ${embeddedFontStyle()}
  <text x="50%" y="${yPercent}%" text-anchor="middle" font-family="${WATERMARK_FONT_FAMILY}, sans-serif" font-size="${input.fontSize}" font-weight="700" fill="#ffffff" fill-opacity="${input.opacity}" stroke="#111827" stroke-opacity="${input.opacity}" stroke-width="2">${text}</text>
</svg>`);
}

function platformWatermarkLayout(imageWidth: number, imageHeight: number) {
  const fontSize = Math.max(16, Math.min(36, Math.round(imageWidth / 34)));
  const padX = Math.round(fontSize * 0.75);
  const padY = Math.round(fontSize * 0.45);
  const boxWidth = Math.round(fontSize * 9.2 + padX * 2);
  const boxHeight = Math.round(fontSize + padY * 2);
  const margin = Math.max(18, Math.round(Math.min(imageWidth, imageHeight) * 0.025));
  return { fontSize, padX, boxWidth, boxHeight, margin };
}

function embeddedFontStyle(): string {
  return `<style>
    @font-face {
      font-family: '${WATERMARK_FONT_FAMILY}';
      src: url('data:font/truetype;base64,${WATERMARK_FONT_BASE64}') format('truetype');
      font-weight: 700;
      font-style: normal;
    }
  </style>`;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[char] || char));
}

async function downloadToTemp(url: string): Promise<string> {
  const source = String(url || '').trim();
  if (!source) throw new Error('缺少待处理图片地址');
  const inlineBuffer = decodeInlineBase64(source);
  if (inlineBuffer) return writeTempBuffer(inlineBuffer);
  const resp = await axios.get(source, { responseType: 'arraybuffer', timeout: 60000 });
  return writeTempBuffer(Buffer.from(resp.data));
}

function decodeInlineBase64(source: string): Buffer | null {
  if (source.startsWith('data:')) {
    const match = source.match(/^data:[^;,]*;base64,([\s\S]+)$/);
    if (!match) throw new Error('base64 图片格式不正确');
    return Buffer.from(match[1], 'base64');
  }
  if (!isProbablyBase64(source)) return null;
  return Buffer.from(source, 'base64');
}

function isProbablyBase64(value: string): boolean {
  const text = value.trim();
  if (text.length < 80 || text.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(text);
}

function writeTempBuffer(buffer: Buffer): string {
  const filePath = path.join(os.tmpdir(), `ai-source-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}
