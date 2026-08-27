import test from 'node:test';
import assert from 'node:assert/strict';

const { applyXiaomaRemoteMediaParams, applyXiaomaVideoParams } = await import('../src/services/adapters/xiaoma-video-param-mapper.ts');

test('xiaoma mapper keeps array and singular aliases for generic multimedia inputs', () => {
  const body = {};

  applyXiaomaVideoParams(body, {
    images: ['https://cdn.example.com/ref.png'],
    videoUrls: ['https://cdn.example.com/ref-a.mp4', 'https://cdn.example.com/ref-b.mp4'],
    audioUrls: ['https://cdn.example.com/ref.mp3'],
    duration: '5s',
  }, 'generic-video-model');

  assert.deepEqual(body.images, ['https://cdn.example.com/ref.png']);
  assert.equal(body.video_url, 'https://cdn.example.com/ref-a.mp4');
  assert.deepEqual(body.video_urls, ['https://cdn.example.com/ref-a.mp4', 'https://cdn.example.com/ref-b.mp4']);
  assert.equal(body.audio_url, 'https://cdn.example.com/ref.mp3');
  assert.deepEqual(body.audio_urls, ['https://cdn.example.com/ref.mp3']);
});

test('xiaoma mapper sends multi-video arrays to all-purpose reference models', () => {
  const body = {};

  applyXiaomaVideoParams(body, {
    images: ['https://cdn.example.com/1.png'],
    videoUrls: ['https://cdn.example.com/1.mp4', 'https://cdn.example.com/2.mp4'],
    audioUrls: ['https://cdn.example.com/voice.mp3'],
  }, 'kwvideo-v2-quannengcankao');

  assert.deepEqual(body.image_url, ['https://cdn.example.com/1.png']);
  assert.deepEqual(body.video_url, ['https://cdn.example.com/1.mp4', 'https://cdn.example.com/2.mp4']);
  assert.equal(body.audio_url, 'https://cdn.example.com/voice.mp3');
});

test('xiaoma mapper uses remote media parameter names instead of generic aliases', () => {
  const body = {
    images: ['https://cdn.example.com/ref-a.png', 'https://cdn.example.com/ref-b.png'],
    video_url: 'https://cdn.example.com/source.mp4',
    video_urls: ['https://cdn.example.com/source.mp4'],
    audio_url: 'https://cdn.example.com/voice.mp3',
    audio_urls: ['https://cdn.example.com/voice.mp3'],
  };

  applyXiaomaRemoteMediaParams(body, {
    remote_parameters: [
      { name: 'reference_urls', type: 'array', maxItems: 4 },
      { name: 'reference_video' },
      { name: 'sound_file' },
    ],
  });

  assert.deepEqual(body.reference_urls, ['https://cdn.example.com/ref-a.png', 'https://cdn.example.com/ref-b.png']);
  assert.equal(body.reference_video, 'https://cdn.example.com/source.mp4');
  assert.equal(body.sound_file, 'https://cdn.example.com/voice.mp3');
  assert.equal(body.images, undefined);
  assert.equal(body.video_url, undefined);
  assert.equal(body.video_urls, undefined);
  assert.equal(body.audio_url, undefined);
  assert.equal(body.audio_urls, undefined);
});
