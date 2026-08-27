import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '../..');
const localTestScriptPath = path.join(projectRoot, 'scripts/local-test.ps1');
const localTestDocPath = path.join(projectRoot, 'docs/LOCAL_PORT_TESTING.md');

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function readRequired(filePath: string): string {
  assert(fs.existsSync(filePath), `Missing required local test artifact: ${path.relative(projectRoot, filePath)}`);
  return fs.readFileSync(filePath, 'utf8');
}

const script = readRequired(localTestScriptPath);
const doc = readRequired(localTestDocPath);

assert(script.includes("[ValidateSet('start', 'stop', 'status')]"), 'local test script should expose start/stop/status actions');
assert(script.includes('$BackendPort = 3137'), 'local test script should default backend to port 3137');
assert(script.includes('$AdminPort = 5173'), 'local test script should default admin web to port 5173');
assert(script.includes("$AdminUsername = 'local_admin'"), 'local test script should publish a stable local admin username');
assert(script.includes("$AdminPassword = 'LocalTest#2026'"), 'local test script should publish a stable local admin password');
assert(script.includes('VITE_API_PROXY_TARGET'), 'local test script should point admin dev proxy at the local backend port');
assert(script.includes('ensure local admin'), 'local test script should ensure the documented local admin account exists');
assert(script.includes('server/runtime/local-test'), 'local test script should keep pid/log files in ignored runtime state');
assert(script.includes('Resolve-LocalPort'), 'local test script should automatically choose a free fallback port when defaults are occupied');

assert(doc.includes('http://127.0.0.1:3137/health'), 'local test doc should document the backend health URL');
assert(doc.includes('http://127.0.0.1:5173/login'), 'local test doc should document the admin login URL');
assert(doc.includes('local_admin'), 'local test doc should document the local admin username');
assert(doc.includes('LocalTest#2026'), 'local test doc should document the local admin password');
assert(doc.includes('.\\scripts\\local-test.ps1'), 'local test doc should document the one-command script entry');
assert(doc.includes('.\\scripts\\local-test.ps1 stop'), 'local test doc should document how to stop local ports');
assert(doc.includes('自动寻找下一个空闲端口'), 'local test doc should explain automatic fallback ports');

console.log('check:local-test-workflow passed');
