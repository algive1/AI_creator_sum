import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/utils/share.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false
});

const source = bundle.outputFiles[0].text;
const tempUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { createShareMessage, enableShareMenu, pathToTimelineQuery, shareMenuItems, withQuery } = await import(tempUrl || pathToFileURL('src/utils/share.ts').href);

assert.equal(withQuery('/pages/home/index'), '/pages/home/index');
assert.equal(
  withQuery('/pages/invite/index', { inviteCode: 'AI 2026', empty: '', skip: undefined }),
  '/pages/invite/index?inviteCode=AI%202026'
);
assert.equal(
  pathToTimelineQuery('/pages/tools/run/index?key=compress'),
  'key=compress'
);
assert.equal(pathToTimelineQuery('/pages/home/index'), '');
assert.deepEqual(createShareMessage({ title: '测试', path: '/pages/inspiration/index' }), {
  title: '测试',
  path: '/pages/inspiration/index',
  imageUrl: '/static/home/home_banner.jpg'
});
assert.deepEqual(shareMenuItems(), ['shareAppMessage', 'shareTimeline']);
assert.deepEqual(shareMenuItems(false), ['shareAppMessage']);
assert.equal(typeof enableShareMenu, 'function');

console.log('share utils tests passed');
