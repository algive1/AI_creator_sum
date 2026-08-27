import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

const checks = [
  {
    file: 'src/pages/WechatToolsSettings.tsx',
    snippets: [
      '本次操作只会暂存到当前页面',
      '已暂存，请点击右上角“保存配置”后生效',
    ],
  },
  {
    file: 'src/pages/WechatSettings.tsx',
    snippets: [
      '导航项已暂存，请点击“保存配置”后生效',
      '删除已暂存，请点击“保存配置”后生效',
    ],
  },
  {
    file: 'src/pages/ContentManagement.tsx',
    snippets: ['保存失败，请检查内容配置'],
  },
  {
    file: 'src/pages/InspirationSquare.tsx',
    snippets: ['保存失败，请检查灵感内容'],
  },
  {
    file: 'src/pages/TemplateCategories.tsx',
    snippets: ['保存失败，请检查分类配置'],
  },
  {
    file: 'src/pages/StorageSettings.tsx',
    snippets: ['配置已保存，如需切换平台请点击“启用此平台”'],
  },
];

const missing = [];

for (const check of checks) {
  const source = readFileSync(resolve(root, check.file), 'utf8');
  for (const snippet of check.snippets) {
    if (!source.includes(snippet)) {
      missing.push(`${check.file}: ${snippet}`);
    }
  }
}

if (missing.length) {
  console.error('Missing save/confirm feedback:');
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}

console.log('Save/confirm feedback checks passed.');
