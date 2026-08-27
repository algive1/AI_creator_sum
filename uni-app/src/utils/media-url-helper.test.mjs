import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { isOwnDownloadableMediaUrlByConfig } from './media-url-helpers.ts';

test('media-url import avoids dotted helper module names in mp-weixin', () => {
  const source = readFileSync(new URL('./media-url.ts', import.meta.url), 'utf8');
  assert.equal(source.includes('media-url.helpers'), false);
});

test('isOwnDownloadableMediaUrlByConfig trusts backend file proxy origins', () => {
  const allowed = isOwnDownloadableMediaUrlByConfig(
    'https://mini.thtapi.com/api/v1/files/ABC123XYZ/content',
    {
      storageOrigins: ['https://ai-creator-1301433202.cos.ap-chengdu.myqcloud.com'],
      fileProxyOrigins: ['https://mini.thtapi.com'],
    },
  );

  assert.equal(allowed, true);
});

test('isOwnDownloadableMediaUrlByConfig still rejects unknown third-party origins', () => {
  const allowed = isOwnDownloadableMediaUrlByConfig(
    'https://example.com/file.png',
    {
      storageOrigins: ['https://ai-creator-1301433202.cos.ap-chengdu.myqcloud.com'],
      fileProxyOrigins: ['https://mini.thtapi.com'],
    },
  );

  assert.equal(allowed, false);
});
