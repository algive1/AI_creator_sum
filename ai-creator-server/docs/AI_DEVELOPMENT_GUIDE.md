# AI 创作工坊 · 小程序开发指南

> 本文档供微信小程序前端开发者使用。阅读前请先看 [MINI_PROGRAM_API.md](MINI_PROGRAM_API.md) 了解接口细节。

---

## 一、项目初始化

### 1.1 配置服务器域名

微信公众平台 → 开发管理 → 服务器域名，配置：

| 类型 | 域名 |
|------|------|
| request 合法域名 | `https://你的域名` |
| uploadFile 合法域名 | `https://你的域名` |
| downloadFile 合法域名 | 对象存储/CDN 域名；只有主动使用后端文件代理兜底时才额外加入后端域名 |

### 1.2 封装请求

```javascript
// utils/api.js
const BASE = 'https://你的域名/api/v1';

function request(path, options = {}) {
  const { method = 'GET', data, needAuth = true } = options;
  const header = { 'Content-Type': 'application/json' };
  if (needAuth) {
    const token = wx.getStorageSync('token');
    if (token) header['Authorization'] = 'Bearer ' + token;
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE + path,
      method,
      data,
      header,
      success(res) {
        if (res.data.code === 0) resolve(res.data.data);
        else if (res.data.code === 401) {
          wx.removeStorageSync('token');
          wx.reLaunch({ url: '/pages/login/login' });
          reject(new Error('登录已过期'));
        } else {
          wx.showToast({ title: res.data.message || '请求失败', icon: 'none' });
          reject(new Error(res.data.message));
        }
      },
      fail(err) {
        wx.showToast({ title: '网络连接失败', icon: 'none' });
        reject(err);
      }
    });
  });
}

// 便捷方法
const api = {
  get: (path, params) => request(path + '?' + Object.entries(params || {}).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&')),
  post: (path, data) => request(path, { method: 'POST', data }),
  put: (path, data) => request(path, { method: 'PUT', data }),
  del: (path) => request(path, { method: 'DELETE' }),
};
```

---

## 二、启动流程（App.onLaunch）

```javascript
App({
  async onLaunch() {
    // 1. 获取全局配置（缓存，减少请求）
    const appConfig = await api.get('/public/app');
    this.globalData.appConfig = appConfig;

    // 2. 检查登录
    const token = wx.getStorageSync('token');
    if (!token) await this.login();

    // 3. 检查协议
    const legal = await api.get('/legal/required-status');
    if (legal.required) {
      // 展示协议弹窗
      this.showLegalModal(legal.missing);
    }

    // 4. 获取首页数据
    const homeData = await api.get('/app/home');
    this.globalData.homeData = homeData;
  },

  async login() {
    const { code } = await wx.login();
    const result = await api.post('/auth/wechat-login', { code });
    wx.setStorageSync('token', result.token);
    wx.setStorageSync('refreshToken', result.refreshToken);
  },

  // Token 过期时调用
  async refreshToken() {
    const refreshToken = wx.getStorageSync('refreshToken');
    if (!refreshToken) return this.login();
    try {
      const result = await api.post('/auth/refresh-token', { refreshToken });
      wx.setStorageSync('token', result.token);
      wx.setStorageSync('refreshToken', result.refreshToken);
    } catch {
      this.login();
    }
  }
});
```

---

## 三、创作页开发

### 3.1 获取档位列表（切换 Tab 时无需重新请求）

```javascript
// 直接从全局配置取，不需要每次调接口
const tiers = app.globalData.appConfig.modelTiers['image_create'];
// 或单独请求
const tiers = await api.get('/public/model-tiers?feature=image_create');
```

常用默认档位：文生图 `image_standard`，图生图 `image_to_image_standard`，图片编辑 `image_edit_standard`，文生视频 `video_standard`。如果后台启用了 APIMart 迁移新增的专属档位，也可以选择 `apimart_*` 档位；前端仍只传业务档位，不传真实供应商模型 ID。

### 3.2 获取模板

```javascript
// 文生图 Tab 的模板（4 条，置顶优先）
const templates = await api.get('/public/templates', {
  type: 'image',
  feature: 'text_to_image',
  pageSize: 4
});

// 结果已按 displayConfig 排序：置顶在前，其余按 sort_order
```

### 3.3 提交文生图

```javascript
const result = await api.post('/tasks/image', {
  prompt: '一只可爱的橘猫在窗台上',
  tierKey: 'image_standard',     // 档位标识
  sizeKey: '1:1_2K',
  ratio: '1:1',
  resolutionPreset: '2K',
  style: '写实',
  platformWatermarkEnabled: true // 缺省 true，生成图片左下角添加平台水印
});
// result = { taskId, taskNo, status: 'queued', pointsCost, pointsFrozen }
```

图片页面应先读取 `capabilities.sizeOptions`，按 `ratio` 分组展示比例，再展示同一比例下的 `resolutionPreset`。GPT Image 2 的 `auto` 只展示自动分辨率；非自动尺寸按上游 `size` 枚举下发，`1K/2K/4K` 均支持 `1:1/2:3/3:2/3:4/4:3/9:16/16:9`，提交时后端会把 `sizeKey` 映射为 `1024x1024`、`3840x2160` 等真实 `size` 值。小马 Nano Banana Pro/2 使用 `aspectRatio + imageSize`，小程序仍只展示 `sizeOptions` 返回的比例和清晰度；Nano Banana 2 的 `thinkingLevel` 由后端固定为 `high`，不要在小程序增加控件。页面选择了固定比例时，提交前如发现提示词也写了不一致的比例或像素尺寸，应弹窗确认；继续生成后服务端以页面 `ratio/sizeKey` 为准，提示词尺寸只在自动比例时参与推断。

图片任务支持 `platformWatermarkEnabled`。不传时后端按 `true` 处理，并在最终图片左下角写入 `AI艺术生成工坊`；传 `false` 时不添加可见平台水印，并在文件记录中标记已关闭平台水印。图片编辑选择 `去水印` 时后端会强制不叠加平台水印。视频任务不支持该参数。

### 3.4 提交图生图

```javascript
// 1. 先上传主图和参考图
const mainImg = await uploadFile('/files/upload', 'ref_image', mainFile, 'public');
const refImg = await uploadFile('/files/upload', 'ref_image', refFile, 'public');

// 2. 提交任务
const result = await api.post('/tasks/image', {
  prompt: '把产品图换成白色背景',
  subType: 'img2img',
  tierKey: 'image_to_image_standard',
  uploadKeys: [mainImg.fileNo],       // 主图（必填，也可传 fileId 或 url）
  referenceKeys: [refImg.fileNo]      // 风格参考图（可选）
});
```

### 3.5 提交图片编辑

```javascript
const result = await api.post('/tasks/image', {
  prompt: '去除图片中的水印',
  subType: 'edit',
  tierKey: 'image_edit_standard',
  uploadKeys: [img.fileNo],      // 待编辑图（至少 1 张，最多以当前档位 maxReferenceImages 为准）
  editTool: 'eraser'            // 编辑工具（必填）
});
```

生成用参考图、图片编辑原图、图生视频首尾帧和视频编辑源视频必须能被第三方模型公网访问。小程序上传这些素材时传 `visibility=public`；后端提交模型前也会把对应素材兜底转为 `public`。不要直接传 `base64/data:`、本地路径、`localhost` 或内网地址。

### 3.6 提交视频

```javascript
const result = await api.post('/tasks/video', {
  prompt: '海浪拍打岩石的慢动作',
  tierKey: 'video_standard',
  subType: 'text_to_video',
  ratio: '16:9',
  duration: '5s',
  resolution: '1080p'
});
```

视频页面只展示 `capabilities.ratios/qualities/durations/audioModes` 返回的可用项，不要在前端追加默认比例、清晰度、时长或声音模式。单一能力项也要展示为锁定态，例如固定 `8秒`、固定 `1080p`、固定 `有声/无声`，让用户知道模型限制。`capabilities.referenceUploadMode` 决定上传 UI：`first_frame` 对应「图生视频」单首图，`reference_images` 对应「参考生视频」多参考素材，`first_last` 对应首尾帧，`source_video` 对应视频编辑；「图生视频」和「参考生视频」后端都走 `image_to_video`，提交时带 `referenceMode`。`capabilities.inputMediaTypes/maxVideoUrls/maxAudioUrls` 决定素材入口及各类型数量；参考生视频按 `maxReferenceImages/maxVideoUrls/maxAudioUrls` 允许图片、视频、音频，视频编辑在 `maxVideoUrls > 1` 时允许多个源视频。小程序应按 `minReferenceImages/maxReferenceImages/maxVideoUrls/maxAudioUrls` 做提交前校验，后端创建任务时会按同一档位能力二次校验。模型配置中的真实媒体上限优先于档位旧默认值；没有模型明示上限时才回退兼容配置。供应商专属镜头枚举等不可通用渲染的必填字段，应先在后台模型模板中配置默认值。

### 3.7 轮询任务结果

```javascript
async function pollTask(taskId, onProgress) {
  while (true) {
    const task = await api.get('/tasks/' + taskId);
    onProgress(task.progress || 0);
    if (task.status === 'completed') return task;
    if (task.status === 'failed') throw new Error(task.failReason || '生成失败');
    await sleep(2000); // 2 秒轮询一次
  }
}
```

### 3.8 智能优化提示词

```javascript
const result = await api.post('/tasks/optimize-prompt', {
  prompt: '一只猫',
  scene: 'image_create',
  style: '写实'
});
// result = { optimizedPrompt, styleSuggestions, charged: true, pointsCost }
```

---

## 四、文件上传

项目内小程序代码优先使用 `uni-app/src/api/upload.ts` 的 `uploadAsset(filePath, fileCategory, visibility)`。该封装会自动读取上传配置，七牛对象存储时走直传，配置不支持或上传失败时回退到 `/files/upload` 服务端中转。业务页面不要再手写 `wx.uploadFile(BASE + '/files/upload')`，否则会绕开直传性能路径。

### 4.1 服务端中转上传（最简单）

```javascript
function uploadFile(path, category, filePath) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: BASE + path,
      filePath,
      name: 'file',
      formData: { fileCategory: category },
      header: { 'Authorization': 'Bearer ' + wx.getStorageSync('token') },
      success(res) {
        const data = JSON.parse(res.data);
        if (data.code === 0) resolve(data.data);  // { fileId, fileNo, url }
        else reject(new Error(data.message));
      },
      fail: reject
    });
  });
}
```

上传分类约定：图片参考素材使用 `ref_image`，视频编辑/视频参考素材使用 `ref_video`，参考音频素材使用 `ref_audio`；`ai_output/ai_video` 只由后端保存 AI 生成结果时使用。图片默认最大 10MB，视频默认最大 200MB，音频默认最大 50MB，服务端会按 MIME 类型分别校验。

---

## 五、支付流程

```javascript
// 1. 创建订单
const order = await api.post('/orders', {
  orderType: 'points',  // 或 'membership'
  productId: 1
});

// 2. 获取支付参数
const payParams = await api.post('/payments/wechat/jsapi', {
  orderNo: order.orderNo
});

// 3. 拉起微信支付
wx.requestPayment({
  timeStamp: payParams.timeStamp,
  nonceStr: payParams.nonceStr,
  package: payParams.package,
  signType: payParams.signType,
  paySign: payParams.paySign,
  success() {
    // 支付成功，跳转结果页
  },
  fail(err) {
    if (err.errMsg.includes('cancel')) return; // 用户取消
    // 支付失败，主动查单
    api.post('/payments/wechat/query', { orderNo: order.orderNo });
  }
});
```

---

## 六、签到 + 广告

```javascript
// 签到状态
const status = await api.get('/checkin/status');
// { signedNormal, signedSuper, streakDays, canNormalSignin, canSuperSignin }

// 普通签到
const result = await api.post('/checkin');
// { rewardPoints, streakDays }

// 超级签到（需先看广告）
const session = await api.post('/checkin/super/session'); // 获取超级签到专用 sessionId 和 adUnitId
// ... 播放广告 ...
await api.post('/checkin/super', { sessionId: session.sessionId });
```

超级签到广告会话只校验播放和时长，不发放 `/ads/reward` 广告积分，也不占用后台配置的广告积分每日次数。

---

## 七、常用页面数据

### 个人中心

```javascript
const data = await api.get('/users/me/full');
// user / points / membership / invite / menus
```

### 首页

```javascript
const home = await api.get('/app/home');
// popupAnnouncement / featureEntries / recommendedTemplates / hotTemplates
// inspirationSections / userSummary / recentWorks / rewardCenter
```

### 订单列表

```javascript
const orders = await api.get('/orders', { orderType: 'points', payStatus: 'paid' });
```

### 积分流水

```javascript
const txns = await api.get('/points/transactions', { direction: 'income', category: 'recharge', pageSize: 20 });
```

---

## 八、环境切换

```javascript
// 开发环境
const BASE = 'http://localhost:3000/api/v1';

// 生产环境
const BASE = 'https://你的域名/api/v1';
```

开发时在微信开发者工具 → 详情 → 不校验合法域名，打勾即可请求 localhost。

---

## 九、常见错误处理

| 错误码 | 含义 | 处理 |
|--------|------|------|
| 401 | Token 过期 | 调用 refresh-token，失败则重新登录 |
| 429 | 请求太频繁 | 等待 2 秒重试 |
| 5102 | 积分不足 | 弹窗引导充值 |
| 5202 | 未完成合规确认 | 展示确认弹窗 |
| 1000 | 系统未安装 | 联系管理员 |

网络错误统一提示"网络不稳定，请重试"，不要显示技术细节给用户。
