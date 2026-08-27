import assert from 'node:assert/strict';
import test from 'node:test';

const service = await import('../src/services/provider-result-metadata.ts');

test('provider result metadata keeps only trimmed HTTP URLs', () => {
  assert.equal(
    service.persistableProviderResultUrl('  https://provider.example/result.png  '),
    'https://provider.example/result.png',
  );
  assert.equal(service.persistableProviderResultUrl('data:image/png;base64,abc'), undefined);
  assert.equal(service.persistableProviderResultUrl('/static/ai_output/result.png'), undefined);
  assert.equal(service.persistableProviderResultUrl(''), undefined);
});
