import { createReadStream, createWriteStream } from 'fs';
import fs from 'fs/promises';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { pipeline } from 'stream/promises';
import { Readable, Transform } from 'stream';
import { query, queryOne } from '../utils/db';
import { StorageService } from './storage/storage.service';
import { md5File } from './storage/upload-temp-file';
import { createUploadedMediaAsset } from './media-asset.service';

const MAX_SHOT_BYTES = positiveInt(process.env.COMIC_COMPOSITION_MAX_SHOT_BYTES, 250 * 1024 * 1024);
const MAX_TOTAL_BYTES = positiveInt(process.env.COMIC_COMPOSITION_MAX_TOTAL_BYTES, 4 * 1024 * 1024 * 1024);
const MAX_TOTAL_DURATION_SECONDS = positiveInt(process.env.COMIC_COMPOSITION_MAX_DURATION_SECONDS, 30 * 60);
const TARGET_FPS = positiveInt(process.env.COMIC_COMPOSITION_FPS, 30);
const MAX_DIMENSION = positiveInt(process.env.COMIC_COMPOSITION_MAX_DIMENSION, 1920);
const MAX_REDIRECTS = 5;

type MediaProbe = {
  width: number;
  height: number;
  duration: number;
  hasAudio: boolean;
};

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function run(command: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-8000); });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(command + ' exited ' + code + ': ' + stderr.slice(-2000))));
  });
}

function runCapture(command: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += String(chunk); if (stdout.length > 2_000_000) child.kill('SIGKILL'); });
    child.stderr.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-8000); });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(stdout) : reject(new Error(command + ' exited ' + code + ': ' + stderr.slice(-2000))));
  });
}

export function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^::ffff:/, '');
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
  if (isIP(normalized) !== 4) return false;
  const parts = normalized.split('.').map(Number);
  if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  return false;
}

async function assertPublicHttpUrl(value: string): Promise<URL> {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported media URL protocol');
  if (parsed.username || parsed.password) throw new Error('media URL credentials are not allowed');
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) throw new Error('private media URL is not allowed');
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('private media URL is not allowed');
    return parsed;
  }
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) throw new Error('private media URL is not allowed');
  return parsed;
}

async function fetchPublicMedia(url: string): Promise<Response> {
  let current = url;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const parsed = await assertPublicHttpUrl(current);
    const response = await fetch(parsed, { redirect: 'manual', signal: AbortSignal.timeout(120000) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('media redirect missing location');
      current = new URL(location, parsed).toString();
      continue;
    }
    return response;
  }
  throw new Error('too many media redirects');
}

async function download(url: string, target: string): Promise<number> {
  const response = await fetchPublicMedia(url);
  if (!response.ok || !response.body) throw new Error('download failed: HTTP ' + response.status);
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_SHOT_BYTES) throw new Error('shot media exceeds maximum download size');
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_SHOT_BYTES) callback(new Error('shot media exceeds maximum download size'));
      else callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body as any), limiter, createWriteStream(target));
  return bytes;
}

async function probeMedia(file: string): Promise<MediaProbe> {
  const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
  const raw = await runCapture(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]);
  const parsed = JSON.parse(raw || '{}');
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const video = streams.find((stream: any) => stream?.codec_type === 'video');
  if (!video) throw new Error('shot media has no video stream');
  const width = positiveInt(video.width, 0);
  const height = positiveInt(video.height, 0);
  if (!width || !height) throw new Error('shot media has invalid dimensions');
  const duration = Number.parseFloat(String(video.duration || parsed.format?.duration || 0));
  return {
    width,
    height,
    duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    hasAudio: streams.some((stream: any) => stream?.codec_type === 'audio'),
  };
}

export function targetDimensions(probe: MediaProbe) {
  const scale = Math.min(1, MAX_DIMENSION / Math.max(probe.width, probe.height));
  const width = Math.max(2, Math.floor((probe.width * scale) / 2) * 2);
  const height = Math.max(2, Math.floor((probe.height * scale) / 2) * 2);
  return { width, height };
}

async function normalizeShot(input: string, output: string, probe: MediaProbe, width: number, height: number) {
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  const videoCodec = process.env.COMIC_COMPOSITION_VIDEO_CODEC || 'libx264';
  const preset = process.env.COMIC_COMPOSITION_PRESET || 'medium';
  const crf = String(positiveInt(process.env.COMIC_COMPOSITION_CRF, 20));
  const filter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${TARGET_FPS}`;
  const base = ['-y', '-i', input];
  const audioInput = probe.hasAudio ? [] : ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000'];
  const maps = probe.hasAudio ? ['-map', '0:v:0', '-map', '0:a:0'] : ['-map', '0:v:0', '-map', '1:a:0'];
  await run(ffmpeg, [
    ...base,
    ...audioInput,
    ...maps,
    '-vf', filter,
    '-c:v', videoCodec,
    '-preset', preset,
    '-crf', crf,
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-ar', '48000',
    '-ac', '2',
    ...(probe.hasAudio ? ['-af', 'aresample=async=1:first_pts=0,apad'] : []),
    '-shortest',
    '-movflags', '+faststart',
    output,
  ]);
}

async function persistCompositionOutput(input: {
  jobId: number;
  userId: number;
  projectId: number;
  outputPath: string;
  probe: MediaProbe;
}) {
  const existing = await queryOne<any>(
    "SELECT id, cdn_url, access_url FROM files WHERE user_id = ? AND ref_type = 'comic_composition' AND ref_id = ? AND is_deleted = 0 ORDER BY id DESC LIMIT 1",
    [input.userId, String(input.jobId)],
  );
  if (existing?.id) {
    await createUploadedMediaAsset({ userId: input.userId, projectId: input.projectId, fileId: Number(existing.id), name: '漫剧成片' });
    return { fileId: Number(existing.id), outputUrl: String(existing.cdn_url || existing.access_url || '') };
  }

  const stat = await fs.stat(input.outputPath);
  const adapter = StorageService.getActiveAdapter();
  const storageKey = StorageService.genStorageKey('ai_video', 'comic-final.mp4');
  const uploaded = await adapter.uploadLarge(storageKey, createReadStream(input.outputPath), 'video/mp4', stat.size, { publicRead: true });
  const outputUrl = String(uploaded.cdnUrl || uploaded.url || '');
  const fileNo = StorageService.genFileNo();
  const md5Hash = await md5File(input.outputPath);
  let fileId = 0;
  try {
    const [result] = await query<any>(
      `INSERT INTO files
       (file_no, user_id, provider, storage_key, original_name, mime_type, file_size, width, height, duration,
        md5_hash, etag, access_url, cdn_url, file_category, visibility, ref_type, ref_id, created_at)
       VALUES (?, ?, ?, ?, 'comic-final.mp4', 'video/mp4', ?, ?, ?, ?, ?, ?, ?, ?, 'ai_video', 'public', 'comic_composition', ?, NOW(3))`,
      [
        fileNo,
        input.userId,
        adapter.provider,
        storageKey,
        stat.size,
        input.probe.width,
        input.probe.height,
        Math.round(input.probe.duration),
        md5Hash,
        uploaded.etag || '',
        uploaded.url || outputUrl,
        outputUrl,
        String(input.jobId),
      ],
    );
    fileId = Number(result.insertId || 0);
    if (!fileId) throw new Error('composition output file record was not created');
    await createUploadedMediaAsset({ userId: input.userId, projectId: input.projectId, fileId, name: '漫剧成片' });
    return { fileId, outputUrl };
  } catch (err) {
    if (fileId) {
      await query("UPDATE files SET is_deleted=1, deleted_at=NOW(3), updated_at=NOW(3) WHERE id=?", [fileId]).catch(() => undefined);
    }
    await adapter.delete(storageKey).catch(() => undefined);
    throw err;
  }
}

export async function assertFfmpegAvailable() {
  await run(process.env.FFMPEG_PATH || 'ffmpeg', ['-version']);
  await run(process.env.FFPROBE_PATH || 'ffprobe', ['-version']);
}

export async function processComicCompositionJob(jobId: number) {
  const row = await queryOne<any>('SELECT * FROM comic_composition_jobs WHERE id = ? LIMIT 1', [jobId]);
  if (!row || row.status === 'completed') return;
  const shots = typeof row.shots === 'string' ? JSON.parse(row.shots) : row.shots;
  if (!Array.isArray(shots) || !shots.length) throw new Error('composition job has no shots');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comic-compose-'));
  try {
    await query("UPDATE comic_composition_jobs SET status='processing', error_message=NULL WHERE id=?", [jobId]);
    await assertFfmpegAvailable();

    const downloaded: string[] = [];
    const probes: MediaProbe[] = [];
    let totalBytes = 0;
    let totalDuration = 0;
    for (let i = 0; i < shots.length; i += 1) {
      const file = path.join(tempDir, String(i).padStart(4, '0') + '-source.mp4');
      totalBytes += await download(String(shots[i].url || ''), file);
      if (totalBytes > MAX_TOTAL_BYTES) throw new Error('composition source media exceeds total download limit');
      const probe = await probeMedia(file);
      totalDuration += probe.duration;
      if (totalDuration > MAX_TOTAL_DURATION_SECONDS) throw new Error('composition duration exceeds configured limit');
      downloaded.push(file);
      probes.push(probe);
    }

    const target = targetDimensions(probes[0]);
    const normalized: string[] = [];
    for (let i = 0; i < downloaded.length; i += 1) {
      const file = path.join(tempDir, String(i).padStart(4, '0') + '-normalized.mp4');
      await normalizeShot(downloaded[i], file, probes[i], target.width, target.height);
      normalized.push(file);
    }

    const listPath = path.join(tempDir, 'concat.txt');
    await fs.writeFile(listPath, normalized.map(file => "file '" + file.replace(/'/g, "'\\''") + "'").join('\n'));
    const output = path.join(tempDir, 'final.mp4');
    await run(process.env.FFMPEG_PATH || 'ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-movflags', '+faststart', output], tempDir);

    const outputProbe = await probeMedia(output);
    const persisted = await persistCompositionOutput({
      jobId,
      userId: Number(row.user_id),
      projectId: Number(row.project_id),
      outputPath: output,
      probe: outputProbe,
    });
    await query(
      "UPDATE comic_composition_jobs SET status='completed', output_file_id=?, output_url=?, error_message=NULL WHERE id=?",
      [persisted.fileId, persisted.outputUrl, jobId],
    );
  } catch (err: any) {
    await query("UPDATE comic_composition_jobs SET status='failed', error_message=? WHERE id=?", [String(err?.message || '合成失败').slice(0, 500), jobId]);
    throw err;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
