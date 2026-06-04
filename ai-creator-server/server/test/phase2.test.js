const BASE = 'http://localhost:3000';

async function test(path, method, body, token) {
  var headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  var res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  var data = await res.json();
  console.log(path + '  Status=' + res.status + '  code=' + data.code);
  if (data.code !== 0) console.log('  message=' + data.message);
  return data;
}

async function main() {
  console.log('=== Phase 1+2 测试: 登录+积分 ===\n');

  // 登录
  var r1 = await test('/api/v1/auth/wechat-login', 'POST', { code: 'dev_test_phase2' });
  var token = r1?.data?.token;
  if (!token) { console.error('登录失败'); return; }
  console.log('新用户积分:', r1?.data?.points?.balance, '\n');

  // 查询积分余额
  console.log('--- 积分余额 ---');
  await test('/api/v1/points/balance', 'GET', undefined, token);

  // 签到状态
  console.log('\n--- 签到状态 ---');
  var signStatus = await test('/api/v1/checkin/status', 'GET', undefined, token);
  console.log('今日签到:', signStatus?.data?.signedToday);
  console.log('连续天数:', signStatus?.data?.streak);

  // 执行签到
  console.log('\n--- 执行签到 ---');
  await test('/api/v1/checkin', 'POST', {}, token);

  // 再次签到（应报错）
  console.log('\n--- 重复签到（应报1001） ---');
  await test('/api/v1/checkin', 'POST', {}, token);

  // 签到后余额
  console.log('\n--- 签到后余额 ---');
  await test('/api/v1/points/balance', 'GET', undefined, token);

  // 广告状态
  console.log('\n--- 广告状态 ---');
  await test('/api/v1/ads/status', 'GET', undefined, token);

  // 广告会话
  console.log('\n--- 创建广告会话 ---');
  var adSession = await test('/api/v1/ads/session', 'POST', {}, token);
  var sessionId = adSession?.data?.sessionId;

  // 领取广告奖励
  if (sessionId) {
    console.log('\n--- 领取广告奖励 ---');
    await test('/api/v1/ads/reward', 'POST', { sessionId, isCompleted: true }, token);
  }

  // 积分流水
  console.log('\n--- 积分流水 ---');
  await test('/api/v1/points/transactions?page=1&pageSize=10', 'GET', undefined, token);

  // 邀请码
  console.log('\n--- 获取邀请码 ---');
  await test('/api/v1/invite/code', 'GET', undefined, token);

  console.log('\n=== 测试完成 ===');
}

main().catch(console.error);
