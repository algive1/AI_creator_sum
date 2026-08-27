import test from 'node:test';
import assert from 'node:assert/strict';

const { splitVideoInputAssets } = await import('../src/services/video-input-assets.service.ts');

test('splits inputAssets by media type and preserves file references and URLs', () => {
  const result = splitVideoInputAssets([
    { mediaType: 'image', fileId: 11, uploadKey: 'IMGNO' },
    { mediaType: 'video', url: 'https://cdn.example.com/ref.mp4' },
    { mediaType: 'audio', fileNo: 'AUDNO' },
  ]);

  assert.deepEqual(result.imageRefs, [{ mediaType: 'image', fileId: 11, uploadKey: 'IMGNO' }]);
  assert.deepEqual(result.videoRefs, [{ mediaType: 'video', url: 'https://cdn.example.com/ref.mp4' }]);
  assert.deepEqual(result.audioRefs, [{ mediaType: 'audio', fileNo: 'AUDNO' }]);
});

test('rejects non-http inputAsset URLs before provider submission', () => {
  assert.throws(
    () => splitVideoInputAssets([{ mediaType: 'audio', url: 'data:audio/mp3;base64,AAAA' }]),
    /素材链接必须以 http 或 https 开头/,
  );
  assert.throws(
    () => splitVideoInputAssets([{ mediaType: 'video', url: 'C:\\temp\\ref.mp4' }]),
    /素材链接必须以 http 或 https 开头/,
  );
});
