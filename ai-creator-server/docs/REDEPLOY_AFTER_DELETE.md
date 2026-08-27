# 删除数据库和代码后的重新部署命令

本文适用于生产服务器已经删除数据库和代码，准备重新上传发布包并全新安装的场景。

如果要保留旧用户、订单、任务、积分、会员、支付记录或后台配置，不要按本文全新安装，先恢复数据库备份。

## 0. 替换变量

本地 WSL 终端先执行：

```bash
DOMAIN="你的后端域名，例如 mini.thtapi.com"
SERVER_IP="你的服务器IP"
RELEASE_VERSION="1.0.18"
```

SSH 登录服务器后，再执行：

```bash
DOMAIN="你的后端域名，例如 mini.thtapi.com"
RELEASE_VERSION="1.0.18"
DB_NAME="ai_creator"
DB_USER="ai_creator"
DB_PASSWORD="换成强密码"
APP_ROOT="/www/wwwroot/ai-creator"
PM2_APP_NAME="ai-creator"
```

## 1. 本地打服务端发布包

在 Windows 的 WSL 里执行：

```bash
cd /mnt/i/AI_creator_sum/ai-creator-server
bash scripts/build-release.sh "$RELEASE_VERSION"
ls -lh "ai-creator-release-${RELEASE_VERSION}.tar.gz"
```

如果本次上线真实微信收款，用严格支付检查：

```bash
cd /mnt/i/AI_creator_sum/ai-creator-server
REQUIRE_WECHAT_PAY_READY=1 bash scripts/build-release.sh "$RELEASE_VERSION"
ls -lh "ai-creator-release-${RELEASE_VERSION}.tar.gz"
```

## 2. 上传发布包到服务器

先在本地 WSL 创建服务器目录：

```bash
ssh "root@${SERVER_IP}" "mkdir -p /www/wwwroot/ai-creator/update-packages"
```

再上传发布包：

```bash
cd /mnt/i/AI_creator_sum/ai-creator-server
scp "ai-creator-release-${RELEASE_VERSION}.tar.gz" "root@${SERVER_IP}:/www/wwwroot/ai-creator/update-packages/"
```

## 3. 服务器准备基础环境

SSH 登录服务器：

```bash
ssh "root@${SERVER_IP}"
```

重新设置服务器变量：

```bash
DOMAIN="你的后端域名，例如 mini.thtapi.com"
RELEASE_VERSION="1.0.18"
DB_NAME="ai_creator"
DB_USER="ai_creator"
DB_PASSWORD="换成强密码"
APP_ROOT="/www/wwwroot/ai-creator"
PM2_APP_NAME="ai-creator"
```

检查基础命令：

```bash
node -v
npm -v
pm2 -v
mysql --version
tar --version
curl --version
mysqldump --version
```

如果没有 PM2：

```bash
npm install -g pm2
pm2 startup
```

`pm2 startup` 会输出一条需要复制执行的命令，按终端提示执行一次。

创建运行目录：

```bash
mkdir -p "$APP_ROOT/update-packages"
mkdir -p "$APP_ROOT/uploads"
mkdir -p "$APP_ROOT/backups"
mkdir -p "$APP_ROOT/logs"
```

## 4. 停止旧进程

如果旧 PM2 进程还在，先停掉：

```bash
pm2 list
pm2 delete "$PM2_APP_NAME" || true
pm2 save
```

确认 3000 端口没有旧服务占用：

```bash
ss -lntp | grep ':3000' || true
```

## 5. 可选：清理旧运行态

只有确认不要旧数据、旧代码、旧安装状态时才执行。

先看目录：

```bash
ls -la "$APP_ROOT"
ls -la "$APP_ROOT/shared" || true
```

清理旧安装状态和旧代码残留：

```bash
rm -rf "$APP_ROOT/server"
rm -rf "$APP_ROOT/admin-web"
rm -rf "$APP_ROOT/current"
rm -rf "$APP_ROOT/releases"
rm -rf "$APP_ROOT/shared"
rm -rf "$APP_ROOT/.pm2"
mkdir -p "$APP_ROOT/update-packages" "$APP_ROOT/uploads" "$APP_ROOT/backups" "$APP_ROOT/logs"
```

说明：

- `shared/.env`、`shared/.env.installed` 是安装状态，不要从旧服务器复制到新部署。
- `current` 是当前运行版本软链接，旧链接会导致 PM2 指向旧路径。
- `.pm2` 是运行态残留，不属于发布包。

## 6. 重建空数据库

如果数据库已经删除，只需要创建新库和用户：

```bash
mysql -u root -p
```

进入 MySQL 后执行：

```sql
CREATE DATABASE IF NOT EXISTS ai_creator CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'ai_creator'@'localhost' IDENTIFIED BY '换成强密码';
ALTER USER 'ai_creator'@'localhost' IDENTIFIED BY '换成强密码';
GRANT ALL PRIVILEGES ON ai_creator.* TO 'ai_creator'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

如果需要强制重建空库，确认不要旧数据后执行：

```bash
mysql -u root -p -e "DROP DATABASE IF EXISTS ${DB_NAME}; CREATE DATABASE ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}'; ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}'; GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost'; FLUSH PRIVILEGES;"
```

验证数据库账号：

```bash
mysql -u "$DB_USER" -p "$DB_NAME" -e "SELECT DATABASE();"
```

## 7. 解压发布包

确认发布包存在：

```bash
ls -lh "$APP_ROOT/update-packages/ai-creator-release-${RELEASE_VERSION}.tar.gz"
```

解压到运行根目录：

```bash
cd "$APP_ROOT"
tar -xzf "update-packages/ai-creator-release-${RELEASE_VERSION}.tar.gz"
ls -la
```

确认目录存在：

```bash
test -f "$APP_ROOT/server/package.json"
test -f "$APP_ROOT/admin-web/package.json"
test -f "$APP_ROOT/admin-web/dist/index.html"
```

## 8. 构建后端和后台

构建后端：

```bash
cd "$APP_ROOT/server"
npm ci --include=dev
npm run build
test -f "$APP_ROOT/server/dist/index.js"
```

构建后台：

```bash
cd "$APP_ROOT/admin-web"
npm ci --include=dev
npm run build
test -f "$APP_ROOT/admin-web/dist/index.html"
```

## 9. 临时启动安装入口

安装向导第一次打开前，需要临时启动后端：

```bash
cd "$APP_ROOT/server"
pm2 start dist/index.js --name "$PM2_APP_NAME" --update-env
pm2 save
pm2 list
```

检查健康接口：

```bash
curl -i "http://127.0.0.1:3000/health"
```

如果失败，看日志：

```bash
pm2 logs "$PM2_APP_NAME" --lines 80
```

## 10. 配置 Nginx 反向代理

宝塔网站反向代理目标：

```text
http://127.0.0.1:3000
```

Nginx 推荐配置片段：

```nginx
client_max_body_size 200m;

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

服务器安全组只需要开放 80、443 和宝塔面板端口，不要对公网开放 3000。

## 11. 打开安装向导

浏览器打开：

```text
https://你的后端域名/install
```

按页面顺序填写：

1. 环境检测
2. 数据库配置
3. 管理员配置
4. 系统配置
5. 执行安装
6. 完成

数据库配置填写：

```text
数据库地址：127.0.0.1
数据库端口：3306
数据库名：ai_creator
数据库用户：ai_creator
数据库密码：换成强密码
```

安装完成后，系统会自动创建：

```text
/www/wwwroot/ai-creator/shared/.env
/www/wwwroot/ai-creator/shared/.env.installed
/www/wwwroot/ai-creator/current
/www/wwwroot/ai-creator/releases/initial-...
```

PM2 会重新绑定到：

```text
/www/wwwroot/ai-creator/current/server/dist/index.js
```

## 12. 安装完成后验证

确认 `/install` 会跳到 `/login`：

```bash
curl -I "https://${DOMAIN}/install"
curl -I "https://${DOMAIN}/login"
```

检查 PM2：

```bash
pm2 list
pm2 logs "$PM2_APP_NAME" --lines 80
```

检查运行入口：

```bash
readlink -f "$APP_ROOT/current" || true
ls -la "$APP_ROOT/current/server/dist/index.js"
ls -la "$APP_ROOT/shared/.env"
ls -la "$APP_ROOT/shared/.env.installed"
```

检查数据库管理员：

```bash
mysql -u ai_creator -p ai_creator -e "SELECT username, role_key, status FROM admin_users;"
```

执行上线检查：

```bash
cd "$APP_ROOT/current/server"
npm run check:runtime
npm run check:launch
npm run check:payment
npm run check:deploy
```

真实微信收款上线前执行：

```bash
cd "$APP_ROOT/current/server"
npm run check:payment -- --strict-real-collection
```

## 13. 登录后台重新配置

打开：

```text
https://你的后端域名/login
```

后台需要重新配置：

1. 微信配置：小程序 AppID / AppSecret
2. AI 模型管理：供应商 Base URL / API Key
3. AI 模型管理：同步模型、绑定图片/视频档位
4. 功能开关：确认需要的功能已开启
5. 微信支付：真实收款时才配置
6. 积分管理、会员套餐
7. 模板分类、图片模板、视频模板、灵感模板
8. 备份管理：备份目录、保留天数、SMTP 通知
9. 对象存储：生产小程序必须使用 COS、OSS、七牛、又拍云、移动云 EOS 等公网 HTTPS 存储
10. 上线配置检查

注意：没有可用供应商 API Key 时，小程序不会展示对应模型档位。

## 14. 构建并上传小程序

小程序不在服务端发布包里，必须单独构建。

本地 Windows/WSL 配置生产接口：

```bash
cd /mnt/i/AI_creator_sum/uni-app
cp .env.production.example .env.production
```

编辑 `uni-app/.env.production`，内容应为：

```text
VITE_API_BASE_URL=https://你的后端域名/api/v1
```

构建小程序：

```bash
cd /mnt/i/AI_creator_sum/uni-app
npm ci
npm run build:mp-weixin
```

确认生产包使用生产环境：

```bash
grep -R "prodEnv" dist/build/mp-weixin/env/index.js
grep -R "https://你的后端域名/api/v1" dist/build/mp-weixin/env/index.js
```

微信开发者工具导入目录：

```text
I:\AI_creator_sum\uni-app\dist\build\mp-weixin
```

微信公众平台配置合法域名：

```text
request 合法域名：https://你的后端域名
uploadFile 合法域名：https://你的后端域名
downloadFile 合法域名：对象存储 CDN HTTPS 域名
如果主动使用后端文件代理兜底，再额外加入：https://你的后端域名
```

## 15. 真机验收

服务端：

```bash
curl -s "https://${DOMAIN}/health"
curl -s "https://${DOMAIN}/api/v1/public/model-tiers?feature=image_create"
curl -s "https://${DOMAIN}/api/v1/public/model-tiers?feature=video_create"
```

小程序真机确认：

1. 能微信登录
2. 首页能打开
3. 能进入生图页和生视频页
4. 能看到模型档位
5. 能提交图片或视频任务
6. 生成结果地址是公网 `https://`，不是 `localhost`、`127.0.0.1`、相对路径或 `http://`
7. 支付功能如果开启，支付成功后订单和权益到账

## 16. 常见问题命令

查看后端日志：

```bash
pm2 logs "$PM2_APP_NAME" --lines 120
```

重启后端：

```bash
pm2 delete "$PM2_APP_NAME" || true
pm2 start "$APP_ROOT/current/server/dist/index.js" --name "$PM2_APP_NAME" --update-env
pm2 save
```

检查 3000 端口：

```bash
ss -lntp | grep ':3000' || true
```

检查 Nginx 到后端是否通：

```bash
curl -i "http://127.0.0.1:3000/health"
curl -I "https://${DOMAIN}/health"
```

后台登录失败时检查管理员：

```bash
mysql -u ai_creator -p ai_creator -e "SELECT username, role_key, status FROM admin_users;"
```

忘记后台密码时生成新哈希：

```bash
cd "$APP_ROOT/current/server"
node -e "const b=require('bcryptjs');console.log(b.hashSync('你的新密码',10))"
```

更新管理员密码：

```bash
mysql -u ai_creator -p ai_creator -e "UPDATE admin_users SET password_hash='刚才复制的哈希' WHERE username='admin';"
```

小程序没有模型档位时检查：

```bash
curl -s "https://${DOMAIN}/api/v1/public/model-tiers?feature=image_create"
curl -s "https://${DOMAIN}/api/v1/public/model-tiers?feature=video_create"
```

如果返回空列表，回后台检查供应商 API Key、模型启用状态、档位绑定和功能开关。

## 17. 本次重装的影响范围

确定影响：

- 数据库：空库会重新建表和导入种子数据。
- 后台账号：需要重新创建管理员。
- 后台配置：微信、模型、支付、存储、模板、会员、积分、备份都需要重新配置。
- 上传文件：如果旧 `uploads` 已删除，旧任务结果和素材文件不可恢复。
- 小程序：需要重新构建并上传生产包。
- PM2：会重新绑定到 `current/server/dist/index.js`。

不应同步处理：

- 不需要改业务代码。
- 不需要手写生产 `.env`，安装向导会生成。
- 不需要把旧 `current`、`shared/.env`、`shared/.env.installed`、`.pm2` 复制回来。

风险：

- 没有数据库备份时，旧用户、订单、支付记录、任务记录、积分和会员不可恢复。
- 未配置对象存储时，生产小程序生成结果可能无法用公网 HTTPS 访问。
- 未配置供应商 API Key 或档位绑定时，小程序不会显示模型档位。
- 小程序生产包如果 `VITE_API_BASE_URL` 错误，会请求旧域名或本地地址。
