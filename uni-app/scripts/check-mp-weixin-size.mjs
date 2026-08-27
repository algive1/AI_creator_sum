import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/build/mp-weixin/', import.meta.url));
const maxBytes = 1_850_000;

function collectSize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += collectSize(fullPath);
    } else if (entry.isFile()) {
      total += statSync(fullPath).size;
    }
  }
  return total;
}

const total = collectSize(root);
if (total > maxBytes) {
  const kb = (total / 1024).toFixed(2);
  const limitKb = (maxBytes / 1024).toFixed(2);
  throw new Error(`mp-weixin package is ${kb}KB, above the ${limitKb}KB preview budget`);
}

console.log(`[check-mp-weixin-size] ${(total / 1024).toFixed(2)}KB <= ${(maxBytes / 1024).toFixed(2)}KB`);
