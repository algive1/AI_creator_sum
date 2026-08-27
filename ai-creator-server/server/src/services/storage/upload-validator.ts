// services/storage/upload-validator.ts
// Upload validation: size, MIME, magic bytes

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

interface SizeLimits {
  image: number;
  video: number;
  audio: number;
}

const DEFAULT_IMAGE_MAX = 10 * 1024 * 1024;
const DEFAULT_VIDEO_MAX = 200 * 1024 * 1024;
const DEFAULT_AUDIO_MAX = 50 * 1024 * 1024;

const DEFAULT_ALLOWED_MIME: Record<string, string[]> = {
  image: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'],
  video: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/ogg'],
};

const MAGIC_BYTES: Record<string, number[]> = {
  'image/png':       [0x89, 0x50, 0x4E, 0x47],
  'image/jpeg':      [0xFF, 0xD8, 0xFF],
  'image/webp':      [0x52, 0x49, 0x46, 0x46],
  'image/gif':       [0x47, 0x49, 0x46, 0x38],
  'image/svg+xml':   [0x3C],
  'video/mp4':       [0x00, 0x00, 0x00],
  'video/quicktime': [0x00, 0x00, 0x00],
  'video/webm':      [0x1A, 0x45, 0xDF, 0xA3],
  'video/x-msvideo': [0x52, 0x49, 0x46, 0x46],
};

export function validateMimeType(mimeType: string): ValidationResult {
  for (const list of Object.values(DEFAULT_ALLOWED_MIME)) {
    if (list.includes(mimeType)) return { valid: true };
  }
  return { valid: false, reason: 'Unsupported file type: ' + mimeType };
}

export function validateFileSize(fileSize: number, mimeType: string, limits?: Partial<SizeLimits>): ValidationResult {
  const maxImage = (limits && limits.image) ? limits.image : DEFAULT_IMAGE_MAX;
  const maxVideo = (limits && limits.video) ? limits.video : DEFAULT_VIDEO_MAX;
  const maxAudio = (limits && limits.audio) ? limits.audio : DEFAULT_AUDIO_MAX;
  if (mimeType.startsWith('video/')) {
    if (fileSize > maxVideo) {
      return { valid: false, reason: '视频大小超过限制，最大 ' + Math.round(maxVideo / 1024 / 1024) + 'MB' };
    }
  } else if (mimeType.startsWith('audio/')) {
    if (fileSize > maxAudio) {
      return { valid: false, reason: '音频大小超过限制，最大 ' + Math.round(maxAudio / 1024 / 1024) + 'MB' };
    }
  } else {
    if (fileSize > maxImage) {
      return { valid: false, reason: '图片大小超过限制，最大 ' + Math.round(maxImage / 1024 / 1024) + 'MB' };
    }
  }
  return { valid: true };
}

export function validateMagicBytes(buffer: Buffer, declaredMime: string): ValidationResult {
  if (declaredMime === 'video/mp4' || declaredMime === 'video/quicktime') {
    if (buffer.length < 12) return { valid: false, reason: 'File too small to validate' };
    const ftyp = buffer.toString('ascii', 4, 8);
    if (ftyp !== 'ftyp') return { valid: false, reason: 'Invalid MP4/MOV header' };
    return { valid: true };
  }
  if (declaredMime === 'audio/mp4') {
    if (buffer.length < 12) return { valid: false, reason: 'File too small to validate' };
    const ftyp = buffer.toString('ascii', 4, 8);
    if (ftyp !== 'ftyp') return { valid: false, reason: 'Invalid M4A/MP4 audio header' };
    return { valid: true };
  }
  if (declaredMime === 'audio/mpeg') {
    if (buffer.length < 3) return { valid: false, reason: 'File too small to validate as MP3' };
    const hasId3 = buffer.toString('ascii', 0, 3) === 'ID3';
    const hasFrameSync = buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0;
    return hasId3 || hasFrameSync ? { valid: true } : { valid: false, reason: 'Invalid MP3 header' };
  }
  if (declaredMime === 'audio/wav' || declaredMime === 'audio/x-wav') {
    if (buffer.length < 12) return { valid: false, reason: 'File too small to validate as WAV' };
    if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
      return { valid: false, reason: 'Invalid WAV header' };
    }
    return { valid: true };
  }
  if (declaredMime === 'audio/ogg') {
    if (buffer.length < 4) return { valid: false, reason: 'File too small to validate as OGG' };
    if (buffer.toString('ascii', 0, 4) !== 'OggS') return { valid: false, reason: 'Invalid OGG header' };
    return { valid: true };
  }
  if (declaredMime === 'audio/aac') {
    if (buffer.length < 2) return { valid: false, reason: 'File too small to validate as AAC' };
    const hasAdts = buffer[0] === 0xFF && (buffer[1] & 0xF0) === 0xF0;
    return hasAdts ? { valid: true } : { valid: false, reason: 'Invalid AAC header' };
  }
  // SVG 额外检查：仅第一个字节为 '<' 不足以防止 webshell（如 <?php）。
  // 验证前几个字节必须包含合法的 XML/SVG 开头。
  if (declaredMime === 'image/svg+xml') {
    if (buffer.length < 5) return { valid: false, reason: 'File too small to validate as SVG' };
    const head = buffer.toString('ascii', 0, Math.min(buffer.length, 256)).trimStart();
    if (!/^<(\?xml|svg|!DOCTYPE\s+svg)/i.test(head)) {
      return { valid: false, reason: 'SVG file must start with <?xml, <svg, or <!DOCTYPE svg' };
    }
    return { valid: true };
  }
  const expectedMagic = MAGIC_BYTES[declaredMime];
  if (!expectedMagic) return { valid: true };
  for (let i = 0; i < expectedMagic.length; i++) {
    if (buffer[i] !== expectedMagic[i]) {
      return { valid: false, reason: 'File magic bytes do not match ' + declaredMime };
    }
  }
  return { valid: true };
}

export function getImageDimensions(buffer: Buffer): { width: number; height: number } {
  try {
    if (buffer[0] === 0x89 && buffer[1] === 0x50) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
      let offset = 2;
      while (offset < buffer.length - 9) {
        if (buffer[offset] === 0xFF) {
          const marker = buffer[offset + 1];
          if (marker === 0xC0 || marker === 0xC2) {
            return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
          }
          offset += 2 + buffer.readUInt16BE(offset + 2);
        } else { break; }
      }
    }
  } catch { /* ignore */ }
  return { width: 0, height: 0 };
}

export { DEFAULT_IMAGE_MAX, DEFAULT_VIDEO_MAX, DEFAULT_AUDIO_MAX, DEFAULT_ALLOWED_MIME };
