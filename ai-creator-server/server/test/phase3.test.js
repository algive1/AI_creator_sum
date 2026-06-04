const BASE = 'http://localhost:3000';

async function test(path, method, body, token) {
  var headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  var res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  var data = await res.json();
  console.log(method + ' ' + path + ' -> code=' + data.code);
  if (data.code !== 0) console.log('  msg=' + data.message);
  return { code: data.code, data: data.data };
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('========================================');
  console.log('Phase 3 测试: AI生图任务管线');
  console.log('========================================\n');

  // 登录
  var r1 = await test('/api/v1/auth/wechat-login', 'POST', { code: 'dev_test_phase3' });
  var token = r1.data?.token;
  if (!token) { console.error('登录失败'); return; }
  console.log('已登录, 积分:', r1.data?.points?.balance);

  // 1. 获取配置
  console.log('\n--- 1. 获取全局配置 ---');
  await test('/api/v1/config/app', 'GET', undefined, token);

  // 2. 获取模型列表
  console.log('\n--- 2. 可用模型列表 ---');
  await test('/api/v1/models?type=image', 'GET', undefined, token);

  // 3. 预估积分消耗
  console.log('\n--- 3. 预估积分消耗 ---');
  await test('/api/v1/tasks/estimate-cost?taskType=image&subType=text2img', 'GET', undefined, token);

  // 4. 创建生图任务
  console.log('\n--- 4. 创建文生图任务 ---');
  var taskRes = await test('/api/v1/tasks/image', 'POST', {
    subType: 'text2img',
    prompt: '高清商业广告摄影风格，冰爽饮品作为主体，冷凝水细节清晰，橙色阳光背景',
    systemPrompt: '主体清晰，真实材质',
    aiOptimize: true,
    formData: { brand: '青柚饮品', sellingPoint: '低糖健康', scene: '门店活动' },
    params: { ratio: '1:1', style: '高级感', quality: '高清' },
  }, token);
  var taskId = taskRes.data?.taskId;

  if (taskId) {
    console.log('任务已创建 taskId=' + taskId + ' taskNo=' + taskRes.data?.taskNo);

    // 5. 轮询任务进度
    console.log('\n--- 5. 轮询任务进度 ---');
    for (var i = 0; i < 10; i++) {
      await sleep(1500);
      var t = await test('/api/v1/tasks/' + taskId, 'GET', undefined, token);
      console.log('  进度=' + t.data?.progress + '% 状态=' + t.data?.status + ' 步骤=' + t.data?.currentStep);
      if (t.data?.status === 'completed' || t.data?.status === 'failed') {
        console.log('  输出数=' + (t.data?.outputs?.length || 0));
        break;
      }
    }

    // 6. 任务列表
    console.log('\n--- 6. 任务列表 ---');
    await test('/api/v1/tasks?page=1&pageSize=10', 'GET', undefined, token);

    // 7. 首页聚合
    console.log('\n--- 7. 首页聚合 ---');
    await test('/api/v1/home', 'GET', undefined, token);
  }

  // 8. 积分不足测试
  console.log('\n--- 8. 积分不足测试（连续提交消耗积分） ---');
  await test('/api/v1/tasks/image', 'POST', {
    subType: 'text2img',
    prompt: 'test',
    params: { ratio: '1:1', style: '写实', quality: '标准' },
  }, token);

  console.log('\n=== Phase 3 测试完成 ===');
}

main().catch(console.error);
