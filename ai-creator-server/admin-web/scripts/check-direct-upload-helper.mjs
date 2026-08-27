import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`Direct upload helper check failed: ${message}`);
    process.exitCode = 1;
  }
}

const helper = read('src/services/upload.ts');
assert(helper.includes('uploadAdminAsset'), 'src/services/upload.ts should export uploadAdminAsset');
assert(helper.includes('/files/upload-config'), 'helper should read upload config');
assert(helper.includes('/files/credential'), 'helper should request a direct upload credential');
assert(helper.includes('/files/notify'), 'helper should confirm direct uploads');
assert(helper.includes('qiniu_kodo'), 'helper should support Qiniu Kodo direct upload');
assert(helper.includes('tencent_cos'), 'helper should support Tencent COS direct upload');
assert(helper.includes('uploadCosPostForm'), 'helper should upload Tencent COS through signed POST form data');
assert(helper.includes('fallbackUploadUrl'), 'helper should keep a server relay fallback');

const resourcePages = [
  'src/pages/ImageTemplates.tsx',
  'src/pages/VideoTemplates.tsx',
  'src/pages/Files.tsx',
  'src/pages/WechatSettings.tsx',
  'src/pages/Membership.tsx',
];

for (const page of resourcePages) {
  const source = read(page);
  assert(source.includes('uploadAdminAsset'), `${page} should use uploadAdminAsset`);
  assert(!source.includes("api.post('/files/upload'"), `${page} should not call /files/upload directly`);
}
