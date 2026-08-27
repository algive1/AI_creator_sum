import test from 'node:test';
import assert from 'node:assert/strict';

import { buildUploadResponse } from '../src/services/storage/upload-response';

test('buildUploadResponse returns existing file data when upload is reused', () => {
  const response = buildUploadResponse({
    reqBaseUrl: 'https://mini.thtapi.com',
    fileId: 12,
    fileNo: 'ABC123XYZ',
    cdnUrl: 'https://cdn.example.com/ref.png',
    accessUrl: 'https://private.example.com/ref.png',
    mimeType: 'image/png',
    fileSize: 1024,
    width: 800,
    height: 600,
    reused: true,
  });

  assert.equal(response.fileId, 12);
  assert.equal(response.fileNo, 'ABC123XYZ');
  assert.equal(response.url, 'https://mini.thtapi.com/api/v1/files/ABC123XYZ/content');
  assert.equal(response.deliveryUrl, response.url);
  assert.equal(response.publicUrl, response.url);
  assert.equal(response.cdnUrl, 'https://cdn.example.com/ref.png');
  assert.equal(response.accessUrl, 'https://private.example.com/ref.png');
  assert.equal(response.reused, true);
});
