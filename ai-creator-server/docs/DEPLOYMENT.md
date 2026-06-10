# 部署指南

本文是服务端和后台的唯一主部署文档。旧的 `DEPLOYMENT_GUIDE.md` 不再维护，小白快速顺序见 `BEGINNER_GUIDE.md`。

适用范围：

- 后端 `server`
- 管理后台 `admin-web`
- 后台在线更新

不包含：

- `uni-app` 小程序发布。小程序需要单独构建和上传微信开发者工具。

---

## 1. 准备

服务器建议：

- Linux 服务器，建议 2 核 4G 以上
- 宝塔面板
- Nginx
- MySQL 8
- Node.js 20.x LTS，或稳定的 Node.js 22.x LTS
- PM2
- `tar`、`curl`、`mysqldump`

宝塔终端确认：

```bash
node -v
npm -v
pm2 -v
tar --version
curl --version
mysqldump --version
```

如果缺 PM2：

```bash
npm install -g pm2
pm2 startup
```

`pm2 startup` 会输出一条需要复制执行的命令，按终端提示执行即可。安装完成后系统会自动 `pm2 save` 当前进程列表。

创建运行目录：

```bash
mkdir -p /www/wwwroot/ai-creator/update-packages
mkdir -p /www/wwwroot/ai-creator/uploads
mkdir -p /www/wwwroot/ai-creator/backups
mkdir -p /www/wwwroot/ai-creator/logs
```

创建数据库：

- 数据库名：`ai_creator`
- 用户名：`ai_creator`
- 字符集：`utf8mb4`
- 访问权限：`localhost`

Nginx 反向代理：

```text
https://你的域名 -> http://127.0.0.1:3000
```

后台静态资源缓存建议：

```nginx
location = /index.html {
  proxy_pass http://127.0.0.1:3000;
  add_header Cache-Control "no-cache, no-store, must-revalidate" always;
}

location /assets/ {
  proxy_pass http://127.0.0.1:3000;
  add_header Cache-Control "public, max-age=31536000, immutable" always;
}

location / {
  proxy_pass http://127.0.0.1:3000;
}
```

视频上传默认允许到 200MB，Nginx/宝塔反向代理需要配置：

```nginx
client_max_body_size 200m;
proxy_connect_timeout 60s;
proxy_send_timeout 300s;
proxy_read_timeout 300s;
```

后端文件内容代理默认读取超时为 `FILE_CONTENT_PROXY_TIMEOUT_MS=120000`。如果生产环境跨地域 COS 或大视频预览容易超时，可在 `/www/wwwroot/ai-creator/current/server/.env` 和共享 `.env` 中调大后重启 PM2。

服务器安全组只需要开放 80、443 和宝塔面板端口。后端只监听 `127.0.0.1:3000`，不要对公网开放 3000。

---

## 2. 打包

在 Windows 的 WSL 里执行：

```bash
cd /mnt/i/AI_creator_sum/ai-creator-server
bash scripts/build-release.sh <版本号>
```

如果本次发布要上线真实微信收款，使用严格模式：

```bash
REQUIRE_WECHAT_PAY_READY=1 bash scripts/build-release.sh <版本号>
```

成功后，压缩包生成在 `ai-creator-server/` 目录：

```text
ai-creator-release-<版本号>.tar.gz
```

打包脚本会执行：

- `admin-web` 依赖安装、build、lint，并把全新 `admin-web/dist` 放入发布包
- `server` 依赖安装、lint、`check:architecture-unified`、`check:payment`、`check:encoding`、`check:migrations-idempotent`、`check:video-pricing`、`check:xiaoma-video-params`、build
- 发布包结构检查 `scripts/inspect-release.sh`

发布包包含：

- `server` 源码、迁移、脚本
- `admin-web` 源码
- `admin-web/dist` 全新构建产物
- `docs`
- `scripts`
- `release.json`

发布包不包含：

- `server/dist` 或其他运行时 `dist`
- `node_modules`
- 真实 `.env`
- 上传文件
- 日志
- 备份
- 小程序 `uni-app`

WSL 打包默认临时目录是 `/tmp/ai-creator-release`。不要把 `RELEASE_STAGING_ROOT` 指到 `/mnt/c/...`，否则 `tsx` 可能出现 IPC socket 错误。

---

## 3. 首次部署

上传发布包：

```bash
scp ai-creator-release-<版本号>.tar.gz root@你的服务器IP:/www/wwwroot/ai-creator/update-packages/
```

或用宝塔文件管理上传到：

```text
/www/wwwroot/ai-creator/update-packages/
```

解压到运行根目录：

```bash
cd /www/wwwroot/ai-creator
tar -xzf update-packages/ai-creator-release-<版本号>.tar.gz
```

构建后端和后台：

```bash
cd /www/wwwroot/ai-creator/server
npm ci --include=dev
npm run build

cd /www/wwwroot/ai-creator/admin-web
npm ci --include=dev
npm run build
```

首次打开安装入口需要先临时启动服务：

```bash
cd /www/wwwroot/ai-creator/server
pm2 start dist/index.js --name ai-creator --update-env
pm2 save
```

这个临时启动只用于打开 `/install`。安装向导执行完成后，会创建统一运行结构，并把 PM2 重新绑定到：

```text
/www/wwwroot/ai-creator/current/server/dist/index.js
```

生产环境不需要手工写 `server/.env`。安装向导会生成 `server/.env`，同步到 `shared/.env`，并写入强 `JWT_SECRET` 和 `ENCRYPTION_KEY`。

---

## 4. 安装向导

浏览器打开：

```text
https://你的域名/install
```

真实步骤顺序：

1. 环境检测
2. 数据库配置
3. 管理员配置
4. 系统配置
5. 执行安装
6. 完成

环境检测必须通过：

- Node.js
- PM2
- MySQL 驱动
- `server` 目录可写
- `server/dist/index.js`
- `admin-web/dist/index.html`

执行安装会自动完成：

1. 写入 `server/.env`
2. 同步 `shared/.env`
3. 捕获当前平铺部署为 `releases/initial-<version>-<time>`
4. 创建 `current` 指向初始版本
5. 测试数据库连接
6. 建表、执行迁移、导入种子数据
7. 初始化系统配置
8. 创建管理员账号
9. 从 `current/server/dist/index.js` 启动 PM2
10. 写入 `shared/.env.installed`

安装向导写入安装锁后，当前后端进程会自动进入已安装运行态并启动后台任务，包括会员定时任务、备份检查、广告清理和图片/视频异步轮询。PM2 启动时会显式加载 `current/server/.env`，不要用旧环境变量手工覆盖 `JWT_SECRET`、`ENCRYPTION_KEY`、数据库或端口配置。

安装完成后访问：

```text
https://你的域名/login
```

---

## 5. 运行结构

安装完成后应是：

```text
/www/wwwroot/ai-creator/
  server/
  admin-web/
  shared/.env
  shared/.env.installed
  releases/
  current -> releases/initial-<version>-<time> 或 releases/<version>
  update-packages/
  uploads/
  backups/
  logs/
```

关键规则：

- `shared/.env` 是后续更新复用的运行配置。
- `shared/.env.installed` 是统一安装锁。
- `current` 是当前运行版本。
- PM2 应从 `current/server/dist/index.js` 启动，并使用 `current/server/.env` 中的运行配置。
- 旧的 `server/.env.installed` 只作为兼容读取来源，不要再手工维护。
- 不要把旧服务器的 `current`、`shared/.env`、`shared/.env.installed`、`.pm2` 混到新部署里。

---

## 6. 登录后台后配置

后台地址：

```text
https://你的域名/login
```

建议按顺序配置：

1. 微信配置：小程序 AppID / AppSecret
2. AI 模型管理：供应商 Base URL / API Key
3. AI 模型管理：同步模型、绑定图片/视频档位
4. 功能开关：确认需要的功能已开启
5. 微信支付：只有真实收款时才配置
6. 积分管理、会员套餐
7. 模板分类、图片模板、视频模板、灵感模板
8. 备份管理：备份目录、保留天数、SMTP 通知
9. 对象存储：生产小程序必须使用 COS/OSS/七牛/又拍云/移动云 EOS 等对象存储，并配置公网 HTTPS CDN 域名；`local` 只适合本地开发或内网自测
10. 上线配置检查

腾讯云 COS 配置必须使用完整 Bucket 名（例如 `examplebucket-1250000000`），`Region` 必须与存储桶所在地域一致。服务端 COS 上传和删除依赖官方 `cos-nodejs-sdk-v5`，生产更新后需重新安装依赖、构建并重启服务。

没有可用供应商 API Key 时，小程序不会展示对应模型档位。

---

## 7. 小程序发布

小程序不在服务端发布包里，必须单独构建。

生产接口地址在：

```text
uni-app/.env.production
```

必须配置：

```text
VITE_API_BASE_URL=https://你的域名/api/v1
```

生产构建会强制检查 `VITE_API_BASE_URL`，为空会直接失败。

构建：

```bash
cd /mnt/i/AI_creator_sum/uni-app
npm ci
npm run build:mp-weixin
```

生成目录：

```text
uni-app/dist/build/mp-weixin
```

微信公众平台需要配置：

- request 合法域名：`https://你的后端域名`
- uploadFile 合法域名：`https://你的后端域名`
- downloadFile 合法域名：`https://你的后端域名` 和对象存储 CDN 域名

真机至少确认：

1. 能登录
2. 首页能打开
3. 能进入生图/生视频页
4. 能看到模型档位
5. 生成图片或视频成功后，结果地址是公网 `https://`，不是相对路径、`localhost` 或 `http://`

---

## 8. 后续更新

打包新版本：

```bash
cd /mnt/i/AI_creator_sum/ai-creator-server
bash scripts/build-release.sh <新版本号>
```

上传到：

```text
/www/wwwroot/ai-creator/update-packages/
```

后台操作：

```text
后台 -> 系统更新 -> 扫描 -> 预检查 -> 输入目标版本号 -> 开始安装
```

真实更新流程：

1. 备份数据库
2. 备份当前代码
3. 解压新版本到 `releases/<version>`
4. 链接或复制 `shared/.env` 到新版本 `server/.env`
5. 安装后端依赖
6. 后端编码检查和 build
7. 安装后台依赖
8. 后台 build
9. 清理后台 `dist/assets` 中未被 `index.html` 引用的旧 hash 资源
10. Linux 生产环境执行 `npm run check:deploy`
11. 扫描危险 SQL
12. 执行 `npm run db:migrate`
13. 切换 `current` 到目标 release
14. 删除旧 PM2 记录并从 `current/server/dist/index.js` 重新启动
15. 校验 `/health.releaseVersion` 等于目标版本
16. 写入 `shared/.env.installed`
17. 清理生产依赖

注意：

- 不是 `pm2 reload` 零停机更新。
- 健康检查版本不一致会自动回滚 `current` 并重新绑定 PM2。
- 如果失败发生在切换 `current` 后，代码会自动回滚；数据库不会自动导回，需要在后台备份管理里人工确认恢复。
- 目标版本号必须大于当前版本。

---

## 9. 上线检查

安装或更新后执行：

```bash
cd /www/wwwroot/ai-creator/current/server
npm run check:runtime
npm run check:launch
npm run check:video-pricing
npm run check:xiaoma-video-params
npm run check:payment
```

涉及视频模型更新时，还要确认公开档位接口返回小马可用入口：

```bash
curl -s "https://你的域名/api/v1/public/model-tiers?feature=video_create"
curl -s "https://你的域名/api/v1/public/model-tiers?feature=image_to_video"
curl -s "https://你的域名/api/v1/public/model-tiers?feature=first_last_frame_video"
```

如需复核小马上游视频价格，先在服务器配置小马供应商 Key，再执行：

```bash
npm run sync:xiaoma-video-pricing -- --output ../../docs/xiaoma-video-pricing.snapshot.json
```

该脚本只写价格快照，不会修改后台平台售价。后台「AI 模型管理 -> 功能页配置」里的 `points_cost/pricing_rules` 仍是小程序展示和任务预扣的唯一生效价格来源；`token_preauth` 只做预扣，不做 token 自动结算。

真实微信收款上线前执行：

```bash
npm run check:payment -- --strict-real-collection
```

Linux 生产环境还要执行：

```bash
npm run check:deploy
```

判断原则：

- `FAIL` 必须处理。
- `WARN` 要看内容，确认是否可接受。

---

## 10. 常见问题

### 10.1 找不到发布包

发布包生成在：

```text
ai-creator-server/ai-creator-release-<版本号>.tar.gz
```

如果没有 `.tar.gz`，通常是 `build-release.sh` 在 lint、build、架构检查、支付检查、编码检查、迁移幂等检查或视频定价检查阶段失败，不能只看“开始打包”的日志。

### 10.2 `/install` 打不开或 502

检查：

```bash
pm2 list
pm2 logs ai-creator --lines 50
curl http://127.0.0.1:3000/health
```

常见原因：

- PM2 未安装
- `server/dist/index.js` 未构建
- 3000 端口被占用
- Nginx 反向代理配置错误

### 10.3 安装向导最后一步 PM2 失败

先看日志：

```bash
pm2 logs ai-creator --lines 50
```

如果看到 `Unreachable code This is caused by either a bug in Node.js...`，优先切换到 Node.js 20.x LTS 或稳定 22.x LTS，然后重新安装依赖和构建：

```bash
cd /www/wwwroot/ai-creator/server
npm ci --include=dev
npm run build
```

再回安装向导点击“重试启动服务”。

### 10.4 导入旧数据库后安装状态异常

如果旧库已有 `system.installed=true` 和管理员账号，不要重复建表。确认：

```text
/www/wwwroot/ai-creator/current
/www/wwwroot/ai-creator/shared/.env
/www/wwwroot/ai-creator/shared/.env.installed
/www/wwwroot/ai-creator/.pm2
```

这些都属于本次部署后，再在安装向导点击“重试启动服务/修复安装状态”。

### 10.5 登录后台失败

按顺序检查：

1. `/install` 是否自动跳到 `/login`
2. PM2 是否在线：`pm2 list`
3. 数据库是否有管理员：

```bash
mysql -u root -p ai_creator -e "SELECT username, role_key, status FROM admin_users;"
```

忘记密码时生成新哈希：

```bash
cd /www/wwwroot/ai-creator/current/server
node -e "const b=require('bcryptjs');console.log(b.hashSync('你的新密码',10))"
```

然后更新：

```bash
mysql -u root -p ai_creator -e "UPDATE admin_users SET password_hash='刚才复制的哈希' WHERE username='admin';"
```

### 10.6 小程序没有模型档位

检查：

1. 后台供应商 Base URL / API Key 是否填写
2. 图片/视频档位是否绑定可用模型
3. 功能开关是否打开
4. 小程序生产包是否指向正确 `VITE_API_BASE_URL`

### 10.7 微信支付成功但权益没到账

后台检查支付订单：

- `payStatus=paid`
- `grantStatus=granted`

如果 `grantStatus=pending`，在后台支付订单页补发权益。
