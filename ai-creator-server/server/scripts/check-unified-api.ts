import { spawnSync } from 'node:child_process';

const command = process.platform === 'win32' ? 'cmd' : 'npm';
const args = process.platform === 'win32'
  ? ['/c', 'npm', 'run', '--silent', 'check:architecture-unified']
  : ['run', '--silent', 'check:architecture-unified'];

const result = spawnSync(command, args, {
  cwd: process.cwd(),
  encoding: 'utf8',
  shell: false,
});

const output = `${result.stdout || ''}${result.stderr || ''}${result.error ? result.error.message : ''}`.trim();
if (output) console.log(output);

if (result.status !== 0) {
  console.error('check:unified-api failed; see check:architecture-unified output above');
  process.exit(result.status || 1);
}

console.log('check:unified-api passed');
