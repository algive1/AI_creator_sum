import { createVideoTask } from '../src/services/task.service';
import { resolveImageSize } from '../src/utils/image-size';

async function expectFail(label: string, fn: () => Promise<any>, pattern: RegExp) {
  try {
    await fn();
    throw new Error(`${label} 未按预期失败`);
  } catch (err: any) {
    if (!pattern.test(err.message || '')) throw err;
  }
}

async function main() {
  await expectFail(
    'video empty prompt',
    () => createVideoTask({ userId: 1, videoMode: 'text_to_video', prompt: '', tierKey: 'video_standard' }),
    /提示词|prompt|不能为空/,
  );

  await expectFail(
    'video missing tier',
    () => createVideoTask({ userId: 1, videoMode: 'text_to_video', prompt: 'test' }),
    /tierKey|tierId|档位/,
  );

  await expectFail(
    'video modelId blocked',
    () => createVideoTask({ userId: 1, videoMode: 'text_to_video', prompt: 'test', modelId: 1, tierKey: 'video_standard' }),
    /真实模型/,
  );

  await expectFail(
    'unsupported video mode',
    () => createVideoTask({ userId: 1, videoMode: 'bad_mode', prompt: 'test', tierKey: 'video_standard' }),
    /视频生成模式/,
  );

  const custom = resolveImageSize({ prompt: '做成 16:9', ratio: '1:1', customWidth: 1280, customHeight: 720 });
  if (custom.source !== 'custom' || custom.width !== 1280 || custom.height !== 720) {
    throw new Error('video custom size priority failed');
  }

  const pixels = resolveImageSize({ prompt: '生成 1280x720 的视频', ratio: '9:16', tierDefaultRatio: '1:1' });
  if (pixels.source !== 'prompt_pixel' || pixels.width !== 1280 || pixels.height !== 720) {
    throw new Error('video prompt pixel priority failed');
  }

  const ratio = resolveImageSize({ prompt: '生成 16:9 电影感视频', ratio: '9:16', tierDefaultRatio: '1:1' });
  if (ratio.source !== 'prompt_ratio' || ratio.ratio !== '16:9') {
    throw new Error('video prompt ratio priority failed');
  }

  const fallback = resolveImageSize({ prompt: '生成产品展示视频', tierDefaultRatio: '9:16' });
  if (fallback.source !== 'default' || fallback.ratio !== '9:16') {
    throw new Error('video default ratio failed');
  }

  console.log('check:video-task passed');
}

main().catch(err => {
  console.error('check:video-task failed:', err.message || err);
  process.exit(1);
});
