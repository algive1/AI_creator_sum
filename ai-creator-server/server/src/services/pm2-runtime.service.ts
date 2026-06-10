import fs from 'fs';
import http from 'http';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import dotenv from 'dotenv';

export interface Pm2RuntimeOptions {
  appRoot: string;
  serverDir: string;
  appName: string;
  port: number;
  timeoutMs?: number;
  onOutput?: (line: string) => void;
  onWarning?: (message: string) => void;
}

export interface Pm2CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface Pm2StartResult {
  ok: boolean;
  action: 'start' | 'missing_pm2' | 'missing_server_dist' | 'health_failed';
  pm2Home: string;
  warnings: string[];
  processStatus?: string;
  manualCommand?: string;
}

interface Pm2ProcessInfo {
  name?: string;
  pm2_env?: {
    status?: string;
    pm_cwd?: string;
    pm_exec_path?: string;
  };
}

export interface Pm2ProcessDetails {
  status: string | null;
  cwd: string;
  scriptPath: string;
}

function commandName(command: string): string {
  if (process.platform !== 'win32') return command;
  if (command === 'pm2') return 'pm2.cmd';
  return command;
}

function commandInvocation(command: string, args: string[]): { command: string; args: string[] } {
  const executable = commandName(command);
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(executable)) {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/c', executable, ...args],
    };
  }
  return { command: executable, args };
}

function normalizeCommandOutput(output: string): string {
  if (!/Unreachable code/i.test(output)) return output;
  return [
    'Node.js/PM2 运行环境异常：检测到 Node 内部错误 "Unreachable code"。',
    '请切换到 Node.js 20 LTS 或稳定的 Node.js 22 LTS，重新执行 npm ci --include=dev && npm run build 后再启动 PM2。',
    `原始输出：${output}`,
  ].join(' ');
}

export function pm2Home(appRoot: string): string {
  return path.join(path.resolve(appRoot), '.pm2');
}

export function pm2RuntimeEnv(options: Pick<Pm2RuntimeOptions, 'appRoot' | 'port'>): NodeJS.ProcessEnv {
  const root = path.resolve(options.appRoot);
  const envFile = path.join(root, 'current', 'server', '.env');
  const fileEnv = fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile, 'utf8')) : {};
  return {
    ...process.env,
    ...fileEnv,
    HOME: root,
    PM2_HOME: pm2Home(root),
    NODE_ENV: 'production',
    PORT: String(fileEnv.PORT || options.port),
  };
}

function runFixedCommand(command: string, args: string[], env: NodeJS.ProcessEnv): Pm2CommandResult {
  const invocation = commandInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    env,
  });
  return {
    code: result.status,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || result.error?.message || ''),
  };
}

function chmodRecursive(target: string, env: NodeJS.ProcessEnv): void {
  if (process.platform === 'win32') return;
  const result = runFixedCommand('chmod', ['-R', '755', target], env);
  if (result.code !== 0) {
    throw new Error(`chmod -R 755 ${target} 执行失败：${(result.stderr || result.stdout).trim()}`);
  }
}

function chownRecursive(target: string, env: NodeJS.ProcessEnv): string | null {
  if (process.platform === 'win32') return null;
  const result = runFixedCommand('chown', ['-R', 'www:www', target], env);
  if (result.code !== 0) return (result.stderr || result.stdout || 'chown failed').trim();
  return null;
}

export function preparePm2RuntimeDirs(options: Pm2RuntimeOptions): string[] {
  const env = pm2RuntimeEnv(options);
  const warnings: string[] = [];
  const dirs = [
    pm2Home(options.appRoot),
    path.join(options.appRoot, 'uploads'),
    path.join(options.serverDir, 'logs'),
  ].map(item => path.resolve(item));

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
    chmodRecursive(dir, env);
    const chownError = chownRecursive(dir, env);
    if (chownError) {
      const warning = `chown www:www ${dir} 失败：${chownError}`;
      warnings.push(warning);
      options.onWarning?.(warning);
    }
  }

  return warnings;
}

export function checkPm2Version(options: Pick<Pm2RuntimeOptions, 'appRoot' | 'port'>): { exists: boolean; version?: string; error?: string } {
  const invocation = commandInvocation('pm2', ['--version']);
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 8000,
    env: pm2RuntimeEnv(options),
  });
  if (result.error) return { exists: false, error: result.error.message };
  if (result.status !== 0) {
    return { exists: false, error: String(result.stderr || result.stdout || `pm2 exited with ${result.status}`).trim() };
  }
  return { exists: true, version: String(result.stdout || result.stderr || '').trim().split(/\r?\n/)[0] };
}

export function runPm2Command(args: string[], options: Pm2RuntimeOptions): Promise<Pm2CommandResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const invocation = commandInvocation('pm2', args);
    const child = spawn(invocation.command, invocation.args, {
      cwd: path.resolve(options.serverDir),
      shell: false,
      windowsHide: true,
      env: pm2RuntimeEnv(options),
    });
    let stdout = '';
    let stderr = '';
    const timeoutMs = options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : 0;
    const timer = timeoutMs
      ? setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGTERM');
        resolve({ code: -1, stdout, stderr: `${stderr}\npm2 ${args.join(' ')} 执行超时`.trim() });
      }, timeoutMs)
      : null;

    child.stdout.on('data', chunk => {
      const text = chunk.toString();
      stdout += text;
      for (const line of text.split(/\r?\n/).filter(Boolean)) options.onOutput?.(line);
    });
    child.stderr.on('data', chunk => {
      const text = chunk.toString();
      stderr += text;
      for (const line of text.split(/\r?\n/).filter(Boolean)) options.onOutput?.(line);
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

async function runPm2Checked(args: string[], options: Pm2RuntimeOptions): Promise<Pm2CommandResult> {
  const result = await runPm2Command(args, options);
  if (result.code !== 0) {
    const output = normalizeCommandOutput(`${result.stdout}\n${result.stderr}`.trim());
    throw new Error(`pm2 ${args.join(' ')} 执行失败，退出码 ${result.code}${output ? `：${output}` : ''}`);
  }
  return result;
}

async function pm2List(options: Pm2RuntimeOptions): Promise<Pm2ProcessInfo[]> {
  const result = await runPm2Command(['jlist'], {
    ...options,
    onOutput: undefined,
    timeoutMs: options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : 5000,
  });
  if (result.code !== 0) return [];
  try {
    return JSON.parse(result.stdout || '[]') as Pm2ProcessInfo[];
  } catch {
    return [];
  }
}

export async function getPm2ProcessStatus(options: Pm2RuntimeOptions): Promise<string | null> {
  const list = await pm2List(options);
  const item = list.find(processInfo => processInfo.name === options.appName);
  return item?.pm2_env?.status || null;
}

export async function getPm2ProcessDetails(options: Pm2RuntimeOptions): Promise<Pm2ProcessDetails> {
  const list = await pm2List(options);
  const item = list.find(processInfo => processInfo.name === options.appName);
  const env = item?.pm2_env || {};
  return {
    status: env.status || null,
    cwd: env.pm_cwd || '',
    scriptPath: env.pm_exec_path || '',
  };
}

export async function checkLocalHealth(port: number, timeoutMs = 1500): Promise<boolean> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;

  return new Promise((resolve) => {
    const req = http.get({
      hostname: '127.0.0.1',
      port,
      path: '/health',
      timeout: timeoutMs,
    }, (res) => {
      res.resume();
      resolve(res.statusCode != null && res.statusCode >= 200 && res.statusCode < 300);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

async function waitForOnlineHealth(options: Pm2RuntimeOptions, attempts = 15): Promise<{ status: string | null; healthy: boolean }> {
  let status: string | null = null;
  let healthy = false;
  for (let i = 0; i < attempts; i += 1) {
    status = await getPm2ProcessStatus(options);
    healthy = await checkLocalHealth(options.port, 2000);
    if (status === 'online' && healthy) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return { status, healthy };
}

export async function ensurePm2AppStarted(options: Pm2RuntimeOptions): Promise<Pm2StartResult> {
  const warnings = preparePm2RuntimeDirs(options);
  const pm2 = checkPm2Version(options);
  const entry = path.join(options.serverDir, 'dist', 'index.js');
  const home = pm2Home(options.appRoot);

  if (!pm2.exists) {
    return { ok: false, action: 'missing_pm2', pm2Home: home, warnings, manualCommand: 'npm install -g pm2' };
  }
  if (!fs.existsSync(entry)) {
    return {
      ok: false,
      action: 'missing_server_dist',
      pm2Home: home,
      warnings,
      manualCommand: '请使用包含 server/dist/index.js 的 release 包，或在高级操作中重新构建。',
    };
  }

  const existingStatus = await getPm2ProcessStatus(options);
  if (existingStatus) {
    const deleted = await runPm2Command(['delete', options.appName], options);
    if (deleted.code !== 0) {
      const warning = `pm2 delete ${options.appName} 失败，继续尝试启动：${(deleted.stderr || deleted.stdout).trim()}`;
      warnings.push(warning);
      options.onWarning?.(warning);
    }
  }

  await runPm2Checked(['start', 'dist/index.js', '--name', options.appName, '--update-env', '--max-restarts', '30', '--restart-delay', '3000'], options);
  await runPm2Checked(['save'], options);

  const { status, healthy } = await waitForOnlineHealth(options);
  if (status !== 'online' || !healthy) {
    return {
      ok: false,
      action: 'health_failed',
      pm2Home: home,
      warnings,
      processStatus: status || 'not_found',
      manualCommand: `PM2_HOME=${home} pm2 logs ${options.appName}`,
    };
  }

  return { ok: true, action: 'start', pm2Home: home, warnings, processStatus: status };
}
