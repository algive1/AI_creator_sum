const BASE = 'http://localhost:3000';

async function test(path, method, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  console.log('[' + method + '] ' + path);
  console.log('  Status:', res.status);
  console.log('  Response:', JSON.stringify(data, null, 2).substring(0, 500));
  console.log();
  return data;
}

async function main() {
  console.log('========================================');
  console.log('Phase 1 测试: 用户登录和用户资料模块');
  console.log('========================================\n');

  console.log('--- 1. 微信登录（新用户） ---');
  const r1 = await test('/api/v1/auth/wechat-login', 'POST', { code: 'dev_test_user_001' });
  const token = r1?.data?.token;
  if (!token) { console.error('登录失败，无法继续测试'); return; }

  console.log('--- 2. 同用户再次登录 ---');
  await test('/api/v1/auth/wechat-login', 'POST', { code: 'dev_test_user_001' });

  console.log('--- 3. 邀请注册 ---');
  const inviteCode = r1?.data?.user?.inviteCode;
  if (inviteCode) await test('/api/v1/auth/wechat-login', 'POST', { code: 'dev_test_user_002', inviteCode });

  console.log('--- 4. 获取用户信息 ---');
  await test('/api/v1/users/me', 'GET', undefined, token);

  console.log('--- 5. 更新昵称和偏好 ---');
  await test('/api/v1/users/me', 'PUT', { nickname: '测试用户', preferences: { defaultRatio: '16:9', defaultQuality: '超清', aiOptimize: true, systemPrompt: '' } }, token);

  console.log('--- 6. 我的页面聚合 ---');
  await test('/api/v1/users/me/full', 'GET', undefined, token);

  console.log('--- 7. 刷新Token ---');
  await test('/api/v1/auth/refresh-token', 'POST', {}, token);

  console.log('--- 8. 未登录访问（应返回401） ---');
  await test('/api/v1/users/me', 'GET');

  console.log('\n========================================');
  console.log('测试完成！');
}

main().catch(console.error);
