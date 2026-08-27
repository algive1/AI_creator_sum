import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/api/upload.ts'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`Mini app direct upload check failed: ${message}`);
    process.exitCode = 1;
  }
}

assert(source.includes("get<") && source.includes("'/files/upload-config'"), 'uploadAsset should read upload config');
assert(source.includes("'/files/credential'"), 'uploadAsset should request an upload credential');
assert(source.includes("'/files/notify'"), 'uploadAsset should notify the backend after direct upload');
assert(source.includes('qiniu_kodo'), 'uploadAsset should support Qiniu Kodo direct upload');
assert(source.includes('tencent_cos'), 'uploadAsset should support Tencent COS direct upload');
assert(source.includes('uploadToCos'), 'uploadAsset should upload Tencent COS through signed POST form data');
assert(source.includes('uploadFile<'), 'uploadAsset should keep server relay fallback');
assert(source.includes('uni.uploadFile'), 'uploadAsset should upload directly to the provider URL');
assert(source.includes('timeout: isVideo ? 300000 : 120000'), 'uploadAsset should preserve video-friendly fallback timeout');
