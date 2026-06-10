import fs from 'fs';
import path from 'path';
import { ensurePm2AppStarted } from '../services/pm2-runtime.service';

interface RebindContext {
  appRoot: string;
  serverDir: string;
  appName: string;
  port: number;
  delayMs?: number;
  logPath?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function appendLog(logPath: string | undefined, message: string): void {
  if (!logPath) return;
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
  } catch {
    // Rebind must not fail just because its best-effort log cannot be written.
  }
}

function readContext(filePath: string): RebindContext {
  if (!filePath) throw new Error('missing PM2 rebind context path');
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as RebindContext;
  if (!raw.appRoot || !raw.serverDir || !raw.appName || !raw.port) {
    throw new Error('invalid PM2 rebind context');
  }
  return raw;
}

async function main(): Promise<void> {
  const contextPath = process.argv[2] || '';
  const ctx = readContext(contextPath);
  await sleep(Math.max(0, Number(ctx.delayMs || 0)));
  appendLog(ctx.logPath, `starting PM2 rebind: app=${ctx.appName}, serverDir=${ctx.serverDir}, port=${ctx.port}`);

  const result = await ensurePm2AppStarted({
    appRoot: ctx.appRoot,
    serverDir: ctx.serverDir,
    appName: ctx.appName,
    port: ctx.port,
    onOutput: line => appendLog(ctx.logPath, line),
    onWarning: warning => appendLog(ctx.logPath, `WARNING: ${warning}`),
  });

  if (!result.ok) {
    throw new Error(`PM2 rebind failed: ${result.manualCommand || result.action}`);
  }
  appendLog(ctx.logPath, `PM2 rebind completed: action=${result.action}, status=${result.processStatus || ''}`);
}

main()
  .then(() => process.exit(0))
  .catch((err: any) => {
    const message = err?.message || String(err);
    try {
      const ctx = readContext(process.argv[2] || '');
      appendLog(ctx.logPath, message);
    } catch {
      // No usable context; stderr is enough for manual runs.
    }
    console.error(message);
    process.exit(1);
  });
