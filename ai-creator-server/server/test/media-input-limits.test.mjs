import test from 'node:test';
import assert from 'node:assert/strict';

const {
  getModelMediaInputMax,
  inspectModelMediaInputParameters,
} = await import('../src/services/media-input-limits.service.ts');
const { buildImageSizeCapabilities } = await import('../src/services/image-size-options.service.ts');

test('media input limits read nested remote parameters without an extra provider request', () => {
  const config = {
    param_names: ['prompt', 'images', 'videoUrls', 'audioUrls'],
    remote_parameters: [{
      taskKind: 'video.generate',
      parameters: [
        { name: 'images', type: 'array', maxItems: 9 },
        { name: 'videoUrls', type: 'array', maxItems: 3 },
        { name: 'audioUrls', type: 'array', maxItems: 2 },
      ],
    }],
  };

  const inspection = inspectModelMediaInputParameters(config);
  assert.equal(inspection.hasImageParam, true);
  assert.equal(inspection.hasVideoParam, true);
  assert.equal(inspection.hasAudioParam, true);
  assert.equal(getModelMediaInputMax(config, 'image'), 9);
  assert.equal(getModelMediaInputMax(config, 'video'), 3);
  assert.equal(getModelMediaInputMax(config, 'audio'), 2);
});

test('image capabilities expose the bound model reference-image limit', () => {
  const caps = buildImageSizeCapabilities({
    maxImages: 1,
    maxReferenceImages: 4,
    modelConfig: {
      max_reference_images: 9,
      remote_parameters: [{ name: 'images', type: 'array', maxItems: 9 }],
    },
  });

  assert.equal(caps.maxReferenceImages, 9);
});

test('image capability contract still derives image-edit limits from the bound model config', () => {
  const edit = buildImageSizeCapabilities({
    maxReferenceImages: 1,
    modelConfig: {
      remote_parameters: [{ name: 'images', type: 'array', maxItems: 3 }],
    },
  });

  assert.equal(edit.maxReferenceImages, 3);
});
