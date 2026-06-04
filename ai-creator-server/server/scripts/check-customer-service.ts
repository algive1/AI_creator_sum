import fs from 'node:fs';
import path from 'node:path';
import '../src/utils/config';
import pool from '../src/utils/db';
import { SettingsService } from '../src/services/settings.service';

type Status = 'PASS' | 'WARN' | 'FAIL';

interface CheckItem {
  status: Status;
  name: string;
  message: string;
}

const serverRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverRoot, '..');
const results: CheckItem[] = [];
const requiredKeys = [
  'customer_service.enabled',
  'customer_service.title',
  'customer_service.subtitle',
  'customer_service.icon',
  'customer_service.show_in_profile',
  'customer_service.session_from',
  'customer_service.show_message_card',
  'customer_service.send_message_title',
  'customer_service.send_message_path',
  'customer_service.send_message_img',
];
const requiredPublicFields = [
  'enabled',
  'title',
  'subtitle',
  'icon',
  'showInProfile',
  'sessionFrom',
  'showMessageCard',
  'sendMessageTitle',
  'sendMessagePath',
  'sendMessageImg',
];

function add(status: Status, name: string, message: string): void {
  results.push({ status, name, message });
}

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function exists(relPath: string): boolean {
  return fs.existsSync(path.join(repoRoot, relPath));
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const ignored = new Set(['node_modules', 'dist', '.git', '.release-staging']);
  const output: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...walk(full));
    else output.push(full);
  }
  return output;
}

function checkDefaultConfigs(): void {
  const migration = exists('server/src/migrations/20260525_001_customer_service_configs.sql')
    ? read('server/src/migrations/20260525_001_customer_service_configs.sql')
    : '';
  const install = read('server/src/services/install.service.ts');
  const missing = requiredKeys.filter(key => !migration.includes(key) || !install.includes(key));
  if (missing.length) {
    add('FAIL', '默认配置', `缺少默认配置 key: ${missing.join(', ')}`);
    return;
  }
  if (!/INSERT IGNORE/i.test(migration) || !/INSERT IGNORE/i.test(install)) {
    add('FAIL', '默认配置', '默认配置必须使用 INSERT IGNORE，不能覆盖已有用户配置');
    return;
  }
  add('PASS', '默认配置', 'customer_service 默认配置已加入迁移和安装初始化');
}

function checkPublicApp(): void {
  const publicConfig = read('server/src/routes/public-config.ts');
  if (!/customerService/.test(publicConfig)) {
    add('FAIL', 'GET /api/v1/public/app', '未返回 customerService');
    return;
  }
  const missing = requiredPublicFields.filter(field => !publicConfig.includes(field));
  if (missing.length) {
    add('FAIL', 'GET /api/v1/public/app', `customerService 缺少字段: ${missing.join(', ')}`);
    return;
  }
  if (/api_key|secret|token|private_key/i.test(publicConfig.match(/getCustomerServiceConfig[\s\S]*?export default router/)?.[0] || '')) {
    add('FAIL', 'GET /api/v1/public/app', 'customerService 返回逻辑疑似包含敏感字段');
    return;
  }
  add('PASS', 'GET /api/v1/public/app', 'customerService 字段已按 camelCase 返回');
}

function checkAdminPage(): void {
  const settingsPage = read('admin-web/src/pages/settings/index.tsx');
  if (!settingsPage.includes('客服入口配置')) {
    add('FAIL', '后台配置页面', '未检测到“客服入口配置”区块');
    return;
  }
  const missing = requiredKeys.filter(key => !settingsPage.includes(key));
  if (missing.length) {
    add('FAIL', '后台配置页面', `缺少配置字段: ${missing.join(', ')}`);
    return;
  }
  add('PASS', '后台配置页面', '系统设置页包含客服入口配置区块和字段');
}

function findMiniProgramFiles(): string[] {
  const files = walk(repoRoot);
  const hasMiniProgramMarker = files.some(file => {
    const name = path.basename(file);
    return name === 'project.config.json' || name === 'app.json';
  });
  if (!hasMiniProgramMarker) return [];
  return files.filter(file => /\.(wxml|vue|tsx|jsx|ts|js)$/i.test(file));
}

function checkMiniProgramProfile(): void {
  const miniProgramFiles = findMiniProgramFiles();
  if (!miniProgramFiles.length) {
    add('WARN', '小程序个人中心', '未检测到小程序前端代码，请在小程序项目中按 MINIPROGRAM_INTEGRATION.md 实现 button open-type=contact。');
    return;
  }

  const contents = miniProgramFiles.map(file => ({ file, content: fs.readFileSync(file, 'utf8') }));
  const joined = contents.map(item => item.content).join('\n');
  if (!/open-type=["']contact["']|openType=["']contact["']/.test(joined)) {
    add('FAIL', '小程序个人中心', '未检测到 button open-type="contact"');
    return;
  }
  if (!/customerService\.enabled|customerService\?\.\s*enabled/.test(joined) || !/customerService\.showInProfile|customerService\?\.\s*showInProfile/.test(joined)) {
    add('FAIL', '小程序个人中心', '未检测到 enabled/showInProfile 隐藏条件');
    return;
  }
  if (/普通 view 直接模拟客服打开/.test(joined)) {
    add('FAIL', '小程序个人中心', '疑似使用普通 view 模拟客服入口');
    return;
  }
  add('PASS', '小程序个人中心', '检测到 button open-type="contact" 和隐藏条件');
}

async function checkConfigValues(): Promise<void> {
  try {
    const sendMessagePath = await SettingsService.getString('customer_service.send_message_path', '/pages/user/index');
    const sendMessageImg = await SettingsService.getString('customer_service.send_message_img', '');
    if (sendMessagePath && !sendMessagePath.startsWith('/')) {
      add('FAIL', 'sendMessagePath', '配置值非空时必须以 / 开头');
    } else {
      add('PASS', 'sendMessagePath', '路径配置合法');
    }
    if (sendMessageImg && !/^https:\/\//i.test(sendMessageImg)) {
      add('FAIL', 'sendMessageImg', '配置值非空时必须是 https:// URL');
    } else {
      add('PASS', 'sendMessageImg', '图片配置合法');
    }
  } catch (err: any) {
    add('WARN', '配置值校验', `无法读取数据库配置，已使用代码默认值兜底: ${err?.message || err}`);
  }
}

async function main(): Promise<void> {
  checkDefaultConfigs();
  checkPublicApp();
  checkAdminPage();
  checkMiniProgramProfile();
  await checkConfigValues();

  for (const item of results) {
    console.log(`[${item.status}] ${item.name}: ${item.message}`);
  }
  const failCount = results.filter(item => item.status === 'FAIL').length;
  const warnCount = results.filter(item => item.status === 'WARN').length;
  console.log('');
  console.log(`汇总: PASS=${results.filter(item => item.status === 'PASS').length} WARN=${warnCount} FAIL=${failCount}`);
  if (failCount > 0) process.exitCode = 1;
}

main()
  .catch(err => {
    console.error('[FAIL] check:customer-service crashed:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });
