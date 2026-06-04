import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { postprocessImage } from '../src/services/image-postprocess.service';
import { resolveImageSize } from '../src/utils/image-size';

function assertPlan(name: string, actual: ReturnType<typeof resolveImageSize>, expected: Partial<ReturnType<typeof resolveImageSize>>) {
  for (const [key, value] of Object.entries(expected)) {
    const got = actual[key as keyof typeof actual];
    if (JSON.stringify(got) !== JSON.stringify(value)) {
      throw new Error(`${name}: expected ${key}=${JSON.stringify(value)}, got ${JSON.stringify(got)}`);
    }
  }
}

async function main() {
  assertPlan(
    'custom width/height first',
    resolveImageSize({ prompt: '请做成 16:9 海报', ratio: '1:1', customWidth: 320, customHeight: 100 }),
    { width: 320, height: 100, ratio: '16:5', source: 'custom', conflict: true },
  );

  assertPlan(
    'prompt pixel before ui ratio',
    resolveImageSize({ prompt: '电商横幅 320x100', ratio: '1:1' }),
    { width: 320, height: 100, ratio: '16:5', source: 'prompt_pixel', conflict: true },
  );

  assertPlan(
    'prompt ratio before ui ratio',
    resolveImageSize({ prompt: '做成 16:9 横版', ratio: '1:1' }),
    { width: 1536, height: 864, ratio: '16:9', source: 'prompt_ratio', conflict: true },
  );

  assertPlan(
    'default ratio',
    resolveImageSize({ prompt: '一只可爱的橘猫', tierDefaultRatio: '9:16' }),
    { width: 864, height: 1536, ratio: '9:16', source: 'default' },
  );

  const input = path.join(os.tmpdir(), `ai-check-source-${Date.now()}.png`);
  await sharp({
    create: {
      width: 1536,
      height: 1024,
      channels: 3,
      background: { r: 40, g: 120, b: 220 },
    },
  }).png().toFile(input);

  const result = await postprocessImage({
    sourcePath: input,
    targetWidth: 320,
    targetHeight: 100,
    mode: 'cover',
  });

  const meta = await sharp(result.outputPath).metadata();
  fs.rmSync(input, { force: true });
  fs.rmSync(result.outputPath, { force: true });

  if (meta.width !== 320 || meta.height !== 100) {
    throw new Error(`图片后处理尺寸错误: ${meta.width}x${meta.height}`);
  }

  console.log('check:image-size passed');
}

main().catch(err => {
  console.error('check:image-size failed:', err.message || err);
  process.exit(1);
});
