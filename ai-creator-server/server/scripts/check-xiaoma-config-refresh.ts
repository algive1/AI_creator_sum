import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve(
  process.cwd(),
  'src/migrations/20260614_005_refresh_xiaoma_media_model_configs.sql',
);
const modelSyncServicePath = path.resolve(process.cwd(), 'src/services/model-sync.service.ts');

const expectedVideoModels = [
  'sora-2',
  'kwvideo-v2-ref',
  'grok-video-3',
  'grok-imagine-video-1.5-preview',
  'doubao-seedance-1-5-pro-251215',
  'kling-v3-omni-cankao',
  'happyhorse-r2v',
  'kwvideo-v2-quannengcankao',
  'veo3.1',
  'kwvideo-v2',
  'happyhorse-video-edit',
  'viduq3',
  'happyhorse-t2v',
  'viduq3-cankaosheng',
  'veo3.1-4k',
  'omni-flash',
  'pixverse-v6-shouweizhen',
  'happyhorse-i2v',
  'kling-motion-control-v3',
  'kling-v3-omni-shouweizhen',
  'vidu-mv',
  'wan2.6-cankaosheng',
  'kling-motion-control',
  'wan2.6-shouzheng',
  'kling-v3-video',
  'kling-avatar-image2video',
  'pixverse-c1-cankaosheng',
  'wan2.7-cankaosheng',
  'kling-v3-omni-videoref',
  'wan2.2-animate-mix',
  'viduq2-cankaosheng',
  'pixverse-c1-shouweizhen',
  'kling-v2-6',
  'pixverse-v5.6-r2v',
  'wan2.7-shouweizhen',
  'vidu-jieshuoman',
  'pixverse-v5.6-shouweizhen',
  'wan2.7-xuxie',
  'hailuo-2.3',
  'veo3.1-lite',
];

const expectedAudioModels = [
  'speech-2.8',
  'music-2.5+',
  'suno-v4.5',
  'doubao-tts-2.0',
  'music-2.5',
  'gemini-3.1-flash-tts-preview',
  'gemini-2.5-pro-preview-tts',
];

function rowFor(sql: string, modelName: string): string {
  const row = sql.split(/\r?\n/).find((line) => line.includes(`('${modelName}',`));
  assert.ok(row, `missing model refresh row for ${modelName}`);
  return row;
}

function assertIncludes(haystack: string, needle: string, message: string): void {
  assert.ok(haystack.includes(needle), message);
}

function main(): void {
  assert.ok(existsSync(migrationPath), `missing migration: ${migrationPath}`);
  const sql = readFileSync(migrationPath, 'utf8');

  assertIncludes(
    sql,
    '/v1/skills/task-status?task_id={task_id}',
    'Xiaoma media models must use the current task-status endpoint',
  );
  assert.ok(!sql.includes('/v1/media/status'), 'new migration must not seed the legacy media/status endpoint');
  assert.ok(!sql.includes("'7:3'"), '21:9 must stay 21:9 and must not be reduced to 7:3');
  assertIncludes(
    sql,
    "JSON_ARRAY('adaptive','16:9','4:3','1:1','3:4','9:16','21:9')",
    'SD 2.0 ratio options must preserve 21:9',
  );

  for (const modelName of expectedVideoModels) {
    const row = rowFor(sql, modelName);
    assertIncludes(row, `'video'`, `${modelName} must be refreshed as a video model`);
  }
  for (const modelName of expectedAudioModels) {
    const row = rowFor(sql, modelName);
    assertIncludes(row, `'audio'`, `${modelName} must be refreshed as an audio model`);
  }

  assert.ok(!/JSON_OBJECT\('version'/.test(sql), 'SD speed/reference configs must not inject a default version');

  const sdReference = rowFor(sql, 'kwvideo-v2-ref');
  assertIncludes(
    sdReference,
    "JSON_ARRAY('version','duration','aspect_ratio','resolution','images')",
    'SD reference should record upstream version as a supported field, but not default it',
  );
  assertIncludes(sdReference, "JSON_OBJECT('duration','auto'", 'SD reference should default duration only, not version');

  const sdAllReference = rowFor(sql, 'kwvideo-v2-quannengcankao');
  assertIncludes(
    sdAllReference,
    "JSON_ARRAY('_quan_neng_mode','duration','aspect_ratio','resolution','image_url','video_url','audio_url')",
    'SD all-reference must use image_url/video_url/audio_url fields',
  );

  const happyhorseEdit = rowFor(sql, 'happyhorse-video-edit');
  assertIncludes(
    happyhorseEdit,
    "JSON_ARRAY('prompt','video','images','resolution','audio_setting','watermark')",
    'HappyHorse video edit must use the source video field named video',
  );

  const speech = rowFor(sql, 'speech-2.8');
  assertIncludes(
    speech,
    "JSON_ARRAY('speed','pitch','emotion','sound_effects','quality')",
    'speech-2.8 must match the latest documented parameter list',
  );
  assert.ok(!speech.includes('voice_id'), 'speech-2.8 docs no longer list voice_id in model params');

  const gemini31 = rowFor(sql, 'gemini-3.1-flash-tts-preview');
  assertIncludes(gemini31, 'JSON_ARRAY()', 'Gemini 3.1 Flash TTS currently exposes no model-specific params');
  assert.ok(!gemini31.includes('model_version'), 'Gemini 3.1 Flash TTS must not inherit old model_version');

  const gemini25 = rowFor(sql, 'gemini-2.5-pro-preview-tts');
  assertIncludes(gemini25, "JSON_ARRAY('model_version')", 'Gemini 2.5 TTS still requires model_version');

  const modelSyncService = readFileSync(modelSyncServicePath, 'utf8');
  assertIncludes(
    modelSyncService,
    "['image', 'video', 'audio']",
    'Xiaoma model sync must fetch image, video, and audio media model lists',
  );
  assertIncludes(
    modelSyncService,
    'type: mediaType',
    'Xiaoma model sync must preserve mediaType so audio models are inserted as audio, not guessed as text',
  );
  assertIncludes(
    modelSyncService,
    'config: buildMediaModelConfig(mediaType',
    'Xiaoma model sync should seed basic media config for newly discovered models',
  );
  assertIncludes(
    modelSyncService,
    'query_task_url, request_template',
    'Xiaoma model sync insert must set query_task_url and request_template explicitly',
  );

  console.log('check:xiaoma-config-refresh passed');
}

try {
  main();
} catch (err: any) {
  console.error('check:xiaoma-config-refresh failed:', err?.message || err);
  process.exitCode = 1;
}
