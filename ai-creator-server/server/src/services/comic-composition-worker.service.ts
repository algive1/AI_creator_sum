import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { query, queryOne } from '../utils/db';
import { StorageService } from './storage/storage.service';

function run(command: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = ''; child.stderr.on('data', chunk => { stderr += String(chunk).slice(-4000); });
    child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(new Error(command + ' exited ' + code + ': ' + stderr.slice(-1500))));
  });
}
async function download(url: string, target: string) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported media URL protocol');
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120000) });
  if (!response.ok || !response.body) throw new Error('download failed: HTTP ' + response.status);
  await pipeline(Readable.fromWeb(response.body as any), (await import('fs')).createWriteStream(target));
}
export async function assertFfmpegAvailable() { await run(process.env.FFMPEG_PATH || 'ffmpeg', ['-version']); }
export async function processComicCompositionJob(jobId: number) {
  const row = await queryOne<any>('SELECT * FROM comic_composition_jobs WHERE id = ? LIMIT 1', [jobId]);
  if (!row || row.status === 'completed') return;
  const shots = typeof row.shots === 'string' ? JSON.parse(row.shots) : row.shots;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comic-compose-'));
  try {
    await query("UPDATE comic_composition_jobs SET status='processing', error_message=NULL WHERE id=?", [jobId]);
    await assertFfmpegAvailable();
    const inputs: string[] = [];
    for (let i=0;i<shots.length;i++) { const file=path.join(tempDir, String(i).padStart(4,'0')+'.mp4'); await download(shots[i].url,file); inputs.push(file); }
    const listPath=path.join(tempDir,'concat.txt');
    await fs.writeFile(listPath, inputs.map(file => "file '" + file.replace(/'/g, "'\\''") + "'").join('\n'));
    const output=path.join(tempDir,'final.mp4');
    await run(process.env.FFMPEG_PATH || 'ffmpeg', ['-y','-f','concat','-safe','0','-i',listPath,'-c','copy','-movflags','+faststart',output], tempDir);
    const stat=await fs.stat(output); const adapter=StorageService.getActiveAdapter();
    const storageKey=StorageService.genStorageKey('ai_video','comic-final.mp4');
    const uploaded=await adapter.uploadLarge(storageKey,(await import('fs')).createReadStream(output),'video/mp4',stat.size,{publicRead:true});
    await query("UPDATE comic_composition_jobs SET status='completed', output_url=?, error_message=NULL WHERE id=?", [uploaded.cdnUrl || uploaded.url,jobId]);
  } catch (err:any) {
    await query("UPDATE comic_composition_jobs SET status='failed', error_message=? WHERE id=?", [String(err?.message || '合成失败').slice(0,500),jobId]);
    throw err;
  } finally { await fs.rm(tempDir,{recursive:true,force:true}); }
}
