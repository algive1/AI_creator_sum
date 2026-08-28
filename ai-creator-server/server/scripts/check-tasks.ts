import { createImageTask, createVideoTask } from '../src/services/task.service';
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
    'empty prompt',
    () => createImageTask({ userId: 1, subType: 'text2img', prompt: '', tierKey: 'image_standard' }),
    /提示词不能为空/,
  );

  await expectFail(
    'image missing tier',
    () => createImageTask({ userId: 1, subType: 'text2img', prompt: 'test' }),
    /tierKey|tierId|档位/,
  );

  await expectFail(
    'image modelId blocked',
    () => createImageTask({ userId: 1, subType: 'text2img', prompt: 'test', modelId: 1, tierKey: 'image_standard' }),
    /真实模型/,
  );

  await expectFail(
    'video missing tier',
    () => createVideoTask({ userId: 1, subType: 'text2video', prompt: 'test' }),
    /tierKey|tierId|档位/,
  );

  const custom = resolveImageSize({ prompt: '做成 16:9', ratio: '1:1', customWidth: 320, customHeight: 100 });
  if (custom.source !== 'custom' || custom.width !== 320 || custom.height !== 100 || !custom.conflict) {
    throw new Error('customWidth/customHeight 优先级检查失败');
  }

  const pixels = resolveImageSize({ prompt: '生成一张 320x100 像素的电商横幅', ratio: '9:16', tierDefaultRatio: '1:1' });
  if (pixels.width !== 864 || pixels.height !== 1536 || pixels.source !== 'ui_ratio') {
    throw new Error('UI ratio 没有覆盖提示词像素尺寸');
  }
  if (!pixels.conflict || pixels.conflictType !== 'ui_ratio_overrides_prompt_pixel') {
    throw new Error('UI ratio 和提示词像素尺寸冲突未记录 warning');
  }

  const ratio = resolveImageSize({ prompt: '生成一张 16:9 横版海报', ratio: '9:16', tierDefaultRatio: '1:1' });
  if (ratio.ratio !== '9:16' || ratio.source !== 'ui_ratio' || !ratio.conflict) {
    throw new Error('UI ratio 没有优先于提示词比例');
  }

  const fallback = resolveImageSize({ prompt: '生成一张产品图', tierDefaultRatio: '1:1' });
  if (fallback.ratio !== '1:1' || fallback.source !== 'default') {
    throw new Error('默认比例检查失败');
  }

  console.log('check:tasks passed');
}

main().catch(err => {
  console.error('check:tasks failed:', err.message || err);
  process.exit(1);
});
