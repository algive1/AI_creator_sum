import test from 'node:test';
import assert from 'node:assert/strict';

import { choosePublicFileDeliveryUrl } from '../dist/utils/public-media-url.helpers.js';

test('choosePublicFileDeliveryUrl prefers backend proxy when file number exists', () => {
  const url = choosePublicFileDeliveryUrl({
    apiBaseUrl: 'https://mini.thtapi.com',
    fileNo: 'ABC123XYZ',
    cdnUrl: 'https://ai-creator-1301433202.cos.ap-chengdu.myqcloud.com/template_cover/2026-06/test.png',
    preferProxy: true,
  });

  assert.equal(url, 'https://mini.thtapi.com/api/v1/files/ABC123XYZ/content');
});

test('choosePublicFileDeliveryUrl falls back to cdn url when file number is missing', () => {
  const url = choosePublicFileDeliveryUrl({
    apiBaseUrl: 'https://mini.thtapi.com',
    cdnUrl: 'https://cdn.example.com/file.png',
    preferProxy: true,
  });

  assert.equal(url, 'https://cdn.example.com/file.png');
});
