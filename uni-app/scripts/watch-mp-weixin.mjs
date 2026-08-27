import { accessSync, constants } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputDir = resolve(root, 'dist/build/mp-weixin');
const uniBin = process.platform === 'win32'
  ? resolve(root, 'node_modules/.bin/uni.cmd')
  : resolve(root, 'node_modules/.bin/uni');

try {
  accessSync(uniBin, constants.X_OK);
} catch {
  console.error('[watch-mp-weixin] Missing local uni CLI. Run npm install in uni-app first.');
  process.exit(1);
}

console.log('[watch-mp-weixin] Starting mp-weixin watch build...');
console.log(`[watch-mp-weixin] Open this folder in WeChat DevTools: ${outputDir}`);

const child = spawn(uniBin, ['-p', 'mp-weixin'], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});

const forwardSignal = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.on('SIGINT', forwardSignal);
process.on('SIGTERM', forwardSignal);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
