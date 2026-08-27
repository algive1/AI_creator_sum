import test from 'node:test';
import assert from 'node:assert/strict';

const {
  DEFAULT_ALLOWED_MIME,
  DEFAULT_AUDIO_MAX,
  validateFileSize,
  validateMimeType,
} = await import('../src/services/storage/upload-validator.ts');

test('upload validation accepts common audio MIME types', () => {
  assert.equal(validateMimeType('audio/mpeg').valid, true);
  assert.equal(validateMimeType('audio/wav').valid, true);
  assert.equal(validateMimeType('audio/x-wav').valid, true);
  assert.equal(validateMimeType('audio/mp4').valid, true);
  assert.equal(validateMimeType('audio/aac').valid, true);
  assert.equal(validateMimeType('audio/ogg').valid, true);
  assert.deepEqual(DEFAULT_ALLOWED_MIME.audio, [
    'audio/mpeg',
    'audio/wav',
    'audio/x-wav',
    'audio/mp4',
    'audio/aac',
    'audio/ogg',
  ]);
});

test('upload validation enforces a separate audio size limit', () => {
  const maxAudio = 50 * 1024 * 1024;

  assert.equal(DEFAULT_AUDIO_MAX, maxAudio);
  assert.equal(validateFileSize(maxAudio, 'audio/mpeg', { audio: maxAudio }).valid, true);
  assert.equal(validateFileSize(maxAudio + 1, 'audio/mpeg', { audio: maxAudio }).valid, false);
  assert.match(validateFileSize(maxAudio + 1, 'audio/mpeg', { audio: maxAudio }).reason || '', /音频大小超过限制/);
});
