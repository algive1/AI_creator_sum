import fs from 'fs';
import path from 'path';

function read(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
}

function assertContains(label: string, content: string, pattern: string | RegExp): void {
  const ok = typeof pattern === 'string' ? content.includes(pattern) : pattern.test(content);
  if (!ok) throw new Error(`${label} missing ${pattern.toString()}`);
}

function main(): void {
  const adminTiers = read('src/routes/admin-tiers.ts');
  const providerModelsPage = fs.readFileSync(path.resolve(__dirname, '../../admin-web/src/pages/ProviderModels.tsx'), 'utf8');
  const modelTestPage = fs.readFileSync(path.resolve(__dirname, '../../admin-web/src/pages/ModelTest.tsx'), 'utf8');

  assertContains('real model test endpoint', adminTiers, "router.post('/real-models/:id(\\\\d+)/test'");
  assertContains('real model list test status', adminTiers, 'lastTestStatus');
  assertContains('real model test state persistence', adminTiers, 'saveRealModelTestState');
  assertContains('real model adapter submit', adminTiers, 'adapter.submitTask');
  assertContains('real model async polling', adminTiers, 'adapter.queryTask');
  assertContains('real model provider key decrypt', adminTiers, 'decryptApiKey(model.api_key)');
  assertContains('provider model test page button', providerModelsPage, 'runModelTest');
  assertContains('provider model test page endpoint', providerModelsPage, '/real-models/${model.id}/test');
  assertContains('provider model test result modal', providerModelsPage, 'title={`测试模型');
  assertContains('model test page endpoint', modelTestPage, '/real-models/${model.id}/test');
  assertContains('model test supported types', modelTestPage, 'BACKEND_SUPPORTED_TEST_TYPES');

  console.log('check:real-model-test passed');
}

try {
  main();
} catch (err: any) {
  console.error('check:real-model-test failed:', err.message || err);
  process.exit(1);
}
