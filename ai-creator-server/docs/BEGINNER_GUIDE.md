# 小白部署速查

这是给第一次部署时看的短清单。完整命令、排障和更新细节以 [DEPLOYMENT.md](DEPLOYMENT.md) 为准。

---

## 最短顺序

1. 准备 Linux 服务器、宝塔、域名、MySQL 8、Node.js 20.x LTS、PM2。
2. 创建数据库 `ai_creator`，字符集 `utf8mb4`。
3. 宝塔网站反向代理到 `http://127.0.0.1:3000`，并配置 HTTPS。
4. 在 WSL 里打服务端发布包。
5. 把 `ai-creator-release-<版本号>.tar.gz` 上传到 `/www/wwwroot/ai-creator/update-packages/`。
6. 在服务器解压、安装依赖、构建 `server` 和 `admin-web`；`user-web/dist` 使用发布包内预构建产物。
7. 临时启动 PM2，打开 `https://你的域名/install`。
8. 跟着安装向导填写数据库、管理员和系统配置。
9. 登录后台 `/login`，配置微信、模型、功能开关、支付和模板。
10. 单独构建小程序 `uni-app/dist/build/mp-weixin`，导入微信开发者工具。

---

## 必备信息

- 服务器 IP 和宝塔账号
- 已解析到服务器的 HTTPS 域名
- 数据库名、用户名、密码
- 微信小程序 AppID / AppSecret
- 至少一个 AI 供应商 Base URL / API Key
- 如果真实收款：微信支付商户号、API v3 Key、商户私钥、证书序列号、HTTPS 回调地址

---

## 服务端打包

在 WSL 里：

```bash
cd /mnt/i/AI_creator_sum/ai-creator-server
bash scripts/build-release.sh <版本号>
```

生成位置：

```text
ai-creator-server/ai-creator-release-<版本号>.tar.gz
```

发布包不包含小程序。小程序要单独构建。

---

## 服务器首次安装

```bash
cd /www/wwwroot/ai-creator
tar -xzf update-packages/ai-creator-release-<版本号>.tar.gz

cd server
npm ci --include=dev
npm run build

cd ../admin-web
npm ci --include=dev
npm run build

cd ../server
pm2 start dist/index.js --name ai-creator --update-env
pm2 save
```

然后打开：

```text
https://你的域名/install
```

安装完成后，系统会自动切换到统一运行结构：

```text
/www/wwwroot/ai-creator/current/server/dist/index.js
```

---

## 安装向导顺序

1. 环境检测
2. 数据库配置
3. 管理员配置
4. 系统配置
5. 执行安装
6. 完成

完成后打开：

```text
https://你的域名/login
```

---

## 小程序

生产接口地址：

```text
uni-app/.env.production
```

必须有：

```text
VITE_API_BASE_URL=https://你的域名/api/v1
```

构建：

```bash
cd /mnt/i/AI_creator_sum/uni-app
npm ci
npm run build:mp-weixin
```

导入微信开发者工具：

```text
uni-app/dist/build/mp-weixin
```

---

## 上线前检查

```bash
cd /www/wwwroot/ai-creator/current/server
npm run check:runtime
npm run check:launch
npm run check:payment
```

真实收款前：

```bash
npm run check:payment -- --strict-real-collection
```

Linux 生产环境：

```bash
npm run check:deploy
```

不能有 `FAIL`。`WARN` 要看内容后再决定是否上线。

---

## 更新

后续发版不要重新安装，走后台：

```text
后台 -> 系统更新 -> 扫描 -> 预检查 -> 输入目标版本号 -> 开始安装
```

更新包仍然放：

```text
/www/wwwroot/ai-creator/update-packages/
```

更新会切换 `current`，并从 `current/server/dist/index.js` 重启 PM2。

---

## 常见判断

- `/install` 自动跳到 `/login`：安装完成。
- `/install` 仍显示向导：安装未完成或需要修复。
- 后台登录后看不到模型档位：先检查供应商 API Key 和档位绑定。
- 小程序请求失败：先检查 `VITE_API_BASE_URL`、HTTPS、微信合法域名。
- 找不到压缩包：看 `ai-creator-server/` 目录，不在仓库根目录外层。
