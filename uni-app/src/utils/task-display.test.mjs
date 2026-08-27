import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatUserDateTime,
  taskOutputList,
  taskThumbnailOf,
} from './task-display.ts';

test('taskOutputList normalizes common backend media fields', () => {
  const outputs = taskOutputList({
    type: 'image',
    outputs: [
      { id: 1, imageUrl: 'https://cdn.example.com/a.png' },
      { id: 2, resultUrl: 'https://cdn.example.com/b.jpg', coverUrl: 'https://cdn.example.com/b-cover.jpg' },
      { id: 3, videoUrl: 'https://cdn.example.com/c.mp4', thumbnailUrl: 'https://cdn.example.com/c.jpg' },
    ],
  });

  assert.equal(outputs.length, 3);
  assert.equal(outputs[0].image, 'https://cdn.example.com/a.png');
  assert.equal(outputs[1].image, 'https://cdn.example.com/b.jpg');
  assert.equal(outputs[1].thumbnail, 'https://cdn.example.com/b-cover.jpg');
  assert.equal(outputs[2].video, 'https://cdn.example.com/c.mp4');
  assert.equal(outputs[2].thumbnail, 'https://cdn.example.com/c.jpg');
});

test('taskOutputList falls back to top-level task media when outputs are absent', () => {
  const outputs = taskOutputList({
    id: 9,
    type: 'video',
    title: '成片',
    videoUrl: 'https://cdn.example.com/final.mp4',
    coverUrl: 'https://cdn.example.com/final.jpg',
  });

  assert.equal(outputs.length, 1);
  assert.equal(outputs[0].video, 'https://cdn.example.com/final.mp4');
  assert.equal(outputs[0].thumbnail, 'https://cdn.example.com/final.jpg');
  assert.equal(taskThumbnailOf({ coverUrl: 'https://cdn.example.com/final.jpg' }), 'https://cdn.example.com/final.jpg');
});

test('formatUserDateTime returns a full user-readable date time', () => {
  assert.equal(formatUserDateTime('2026-06-09 08:30'), '2026-06-09 08:30:00');

  const iso = formatUserDateTime('2026-06-14T14:04:18.330Z');
  assert.match(iso, /^2026-06-\d{2} \d{2}:04:18$/);
  assert.equal(iso.includes('T'), false);
  assert.equal(iso.includes('Z'), false);
});
