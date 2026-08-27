import test from 'node:test';
import assert from 'node:assert/strict';

test('platform watermark SVG embeds a Chinese-capable font for AI艺术生成工坊', async () => {
  const postprocess = await import('../src/services/image-postprocess.service');
  const createPlatformWatermarkSvg = (postprocess as {
    createPlatformWatermarkSvg?: (input: { imageWidth: number; imageHeight: number }) => Buffer;
  }).createPlatformWatermarkSvg;

  assert.equal(typeof createPlatformWatermarkSvg, 'function');

  const svg = createPlatformWatermarkSvg({ imageWidth: 960, imageHeight: 640 }).toString('utf8');
  assert.match(svg, /AI艺术生成工坊/);
  assert.match(svg, /@font-face/);
  assert.match(svg, /AiCreatorWatermark/);
});
