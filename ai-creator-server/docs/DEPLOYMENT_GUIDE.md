# AI 创作工坊 — 宝塔面板部署教程

> 适用场景：新购 Linux 云服务器（CentOS 7+ / Ubuntu 20.04+ / Debian 11+），从零部署到上线。
> 本地打包通过 WSL（Windows Subsystem for Linux）完成。

---

## 目录

1. [服务器准备（宝塔面板 + 环境）](#1-服务器准备)
2. [数据库配置](#2-数据库配置)
3. [WSL 打包（Windows 端）](#3-wsl-打包)
4. [上传与安装](#4-上传与安装)
5. [通过安装向导完成初始化](#5-安装向导)
6. [验证上线](#6-验证上线)
7. [系统更新（后续发版）](#7-系统更新)
8. [常见问题](#8-常见问题)

---

## 1. 服务器准备

### 1.1 安装宝塔面板

```bash
# CentOS 7+
yum install -y wget && wget -O install.sh https://download.bt.cn/install/install_6.0.sh && bash install.sh

# Ubuntu / Debian
wget -O install.sh https://download.bt.cn/install/install_6.0.sh && bash install.sh
```

安装完成后记录终端输出的面板地址、用户名和密码。

### 1.2 登录宝塔面板

浏览器打开 `https://你的服务器IP:面板端口`，登录。

### 1.3 安装环境

在宝塔面板 → 软件商店，一键安装以下软件：

| 软件 | 推荐版本 | 用途 |
|------|---------|------|
| Nginx | 1.22+ | 反向代理 |
| MySQL | 8.0 | 数据库 |
| Node.js 版本管理器 | 最新 | 运行 Node.js |

在「Node.js 版本管理器」中安装 Node.js **18.x 或 20.x LTS**。

### 1.4 安装全局工具

```bash
# SSH 登录服务器
npm install -g pm2
```

### 1.5 创建项目目录

```bash
mkdir -p /www/wwwroot/ai-creator
mkdir -p /www/wwwroot/ai-creator/update-packages
mkdir -p /www/wwwroot/ai-creator/uploads
mkdir -p /www/wwwroot/ai-creator/backups
mkdir -p /www/wwwroot/ai-creator/logs
```

### 1.6 配置 Nginx 反向代理

宝塔面板 → 网站 → 添加站点，填写你的域名（如 `api.your-domain.com`）。

站点创建后，点击「设置」→「反向代理」，添加：

| 目标 URL | 发送域名 |
|----------|---------|
| `http://127.0.0.1:3000` | `$host` |

如果你的前端页面也通过这个域名访问，Nginx 会直接把请求转发给 Node.js 服务。Node.js 服务负责 API 接口 + 管理后台静态文件。

> **注意：** 不需要单独配置静态文件目录。Express 应用会 serve `admin-web/dist/` 目录并通过 SPA fallback 处理前端路由。

---

## 2. 数据库配置

### 2.1 创建数据库

宝塔面板 → 数据库 → 添加数据库：

| 字段 | 值 |
|------|-----|
| 数据库名 | `ai_creator` |
| 用户名 | `ai_creator` |
| 密码 | 点击「随机生成」，**记录下密码** |
| 访问权限 | `localhost` |

> 字符集选 `utf8mb4`，排序规则选 `utf8mb4_unicode_ci`。

### 2.2 放行端口

后端服务只监听 `127.0.0.1:3000`，不对外暴露。**无需放行 3000 端口**。

只需确保 80（HTTP）和 443（HTTPS）端口已放行。HTTPS 可在网站设置中配置 SSL 证书（宝塔面板支持一键申请 Let's Encrypt 免费证书）。

---

## 3. WSL 打包（Windows 端）

如果你的开发环境是 Windows，用 WSL 来执行构建脚本（因为 `build-release.sh` 是 bash 脚本）。

### 3.1 前置条件

确保 Windows 已安装 WSL（推荐 Ubuntu）：

```powershell
# PowerShell 管理员运行
wsl --install
```

第一次启动 WSL 后，在 WSL 终端中安装 Node.js：

```bash
# WSL 内
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
```

### 3.2 执行打包

在 WSL 终端中进入项目根目录，运行打包脚本：

```bash
# 进入项目目录（WSL 中 Windows 路径为 /mnt/盘符/路径）
cd /mnt/i/AI_creator_sum/ai-creator-server

# 打包（版本号按实际修改）
bash scripts/build-release.sh 1.0.2
```

脚本会自动完成：
1. 在临时目录安装依赖并验证 admin-web 和 server 都能正常构建
2. 组装发布包（不含 node_modules / dist / .env）
3. 运行安全检查（禁止敏感文件、危险路径）
4. 生成 `ai-creator-release-1.0.1.tar.gz`

打包成功后，脚本会输出文件路径和上传命令提示。

### 3.3 传输到服务器

```bash
# WSL 中用 scp 上传
scp ai-creator-release-1.0.1.tar.gz root@你的服务器IP:/www/wwwroot/ai-creator/update-packages/
```

或者在宝塔面板 → 文件管理中直接上传到 `/www/wwwroot/ai-creator/update-packages/`。

---

## 4. 上传与安装

### 4.1 解压到部署目录

```bash
# SSH 到服务器
cd /www/wwwroot/ai-creator

# 解压发布包
tar -xzf update-packages/ai-creator-release-1.0.1.tar.gz

# 解压后的结构：
# /www/wwwroot/ai-creator/
# ├── server/          # 后端源码
# ├── admin-web/       # 管理后台源码
# ├── scripts/         # 部署脚本
# ├── docs/            # 文档
# └── release.json     # 版本信息
```

### 4.2 安装依赖并构建

```bash
cd /www/wwwroot/ai-creator/server
npm ci --include=dev
npm run build

cd /www/wwwroot/ai-creator/admin-web
npm ci --include=dev
npm run build
```

> **不需要手动创建或编辑 `.env`。** 安装向导会在初始化步骤自动生成包含正确数据库信息和强密钥的 `.env` 文件。服务端使用内置默认值即可启动。

### 4.3 启动服务

```bash
cd /www/wwwroot/ai-creator
pm2 start server/dist/index.js --name ai-creator --update-env
pm2 save
pm2 startup   # 设置开机自启（按提示执行输出的命令）
```

---

## 5. 安装向导

服务启动后，浏览器访问 `https://你的域名/install`，进入安装向导。

### 步骤 1：环境检测

系统自动检测 Node.js、PM2、MySQL 驱动、磁盘空间、目录权限。全部通过后点击「下一步」。

如果提示「admin-web/dist/index.html 未找到」或「server/dist/index.js 未找到」，说明构建产物缺失。检查步骤 4.3 是否执行成功。

### 步骤 2：数据库配置

填写数据库连接信息（与 `.env` 中一致），点击「测试连接」。成功后点击「下一步」。

### 步骤 3：系统配置

填写站点名称（如「AI 创作工坊」）、时区（Asia/Shanghai）、存储类型（本地存储即可）。

### 步骤 4：创建管理员

填写后台管理员账号（至少 3 字符）和密码（至少 8 字符）。**记好这个密码。**

### 步骤 5：执行安装

点击「开始安装」，系统自动执行：
1. 写入 `.env` 配置（含自动生成的 JWT_SECRET 和 ENCRYPTION_KEY）
2. 建表 + 执行迁移 + 导入种子数据
3. 初始化系统配置（微信/支付/存储/安全等默认值）
4. 创建管理员账号
5. 写入安装锁 `.env.installed`
6. 启动 PM2 服务

安装完成后访问 `https://你的域名/login`，用管理员账号登录后台。

---

## 6. 验证上线

### 6.1 基础检查

```bash
# 健康检查
curl http://127.0.0.1:3000/health
# 返回 {"status":"ok","timestamp":"..."}

# 管理后台 API
curl http://127.0.0.1:3000/api/v1/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"你的管理员账号","password":"你的管理员密码"}'
# 返回 token 即正常
```

### 6.2 小程序配置检查清单

登录后台后，依次检查：

| 检查项 | 位置 |
|--------|------|
| 微信小程序 AppID / Secret 已配置 | 微信配置 → 微信小程序 |
| 微信支付商户号/密钥已配置 | 微信配置 → 微信支付 |
| 客服入口配置正确 | 微信配置 → 微信客服 |
| 底部导航栏配置正确 | 微信配置 → 底部导航 |
| AI 功能开关全部打开 | 功能开关 |
| 会员功能已启用 | 功能开关 |
| 模型档位已配置 | AI 模型管理 → 功能页配置 |
| 积分套餐已创建 | 积分管理 → 积分套餐 |
| 会员套餐已创建 | 会员套餐 |
| 模板数据已导入 | 灵感模板 → 图片模板 / 视频模板 |

### 6.3 HTTPS 配置

宝塔面板 → 网站设置 → SSL → 一键申请 Let's Encrypt 证书。

申请成功后，小程序后台的「合法域名」需配置 HTTPS 地址：
- request 合法域名：`https://你的域名`
- uploadFile 合法域名：`https://你的域名`
- downloadFile 合法域名：`https://你的CDN域名`

---

## 7. 系统更新

后续发版时，通过管理后台的「系统更新」页面在线升级。

### 7.1 打包新版本

```bash
# WSL 中
cd /mnt/i/AI_creator_sum/ai-creator-server
bash scripts/build-release.sh 1.0.2
```

### 7.2 上传更新包

```bash
scp ai-creator-release-1.0.2.tar.gz root@服务器IP:/www/wwwroot/ai-creator/update-packages/
```

或者通过宝塔面板文件管理上传。

### 7.3 后台执行更新

1. 登录管理后台 → 系统更新
2. 点击「扫描」按钮，看到刚上传的更新包
3. 点击「预检查」，确认所有检查项通过
4. 输入要安装的版本号确认，点击「开始安装」

系统会自动执行：
- 备份数据库（mysqldump）
- 备份旧代码（tar.gz）
- 解压新版本到 `releases/` 目录
- 安装依赖 → 编码检查 → 构建 → 迁移数据库 → 构建前端
- 原子切换 `current` 符号链接
- `pm2 reload` 重启服务（零停机）
- 健康检查（5 次重试）

如果安装过程中出现错误会**自动回滚**到旧版本。

---

## 8. 常见问题

### Q1：访问域名显示 502 Bad Gateway

- 检查 PM2 是否在运行：`pm2 list`
- 检查端口是否被占用：`netstat -tlnp | grep 3000`
- 查看 PM2 日志：`pm2 logs ai-creator`
- Nginx 反向代理是否配置正确

### Q2：安装向导提示「环境变量缺失」

检查 `server/.env` 文件是否存在，DB_* 配置是否正确。

### Q3：安装后无法登录后台

- 确认安装向导已完成（访问 /install 会重定向到 /login）
- 忘记管理员密码：SSH 到服务器，用 Node.js 生成新密码哈希：
  ```bash
  cd /www/wwwroot/ai-creator/server
  node -e "const b=require('bcryptjs');console.log(b.hashSync('新密码',10))"
  ```
  然后登录 MySQL 更新：
  ```sql
  UPDATE admin_users SET password_hash='上面生成的值' WHERE username='admin';
  ```

### Q4：WSL 打包时提示「tar：未找到命令」

```bash
apt-get install -y tar
```

### Q5：WSL 打包时 npm install 失败

检查 WSL 内 Node.js 版本 >= 18，然后：

```bash
# 删除 node_modules 重新安装
cd /mnt/i/AI_creator_sum/ai-creator-server
rm -rf server/node_modules admin-web/node_modules
bash scripts/build-release.sh 1.0.1
```

### Q6：宝塔面板防火墙/安全组

- 云服务器安全组需放行：80、443、宝塔面板端口
- 后端服务只监听 `127.0.0.1:3000`，不对外暴露，无需放行 3000
- MySQL 端口 3306 只需本地访问，不需要对外放行

### Q7：系统更新后小程序连不上

- 检查 PM2 状态：`pm2 list`
- 查看更新日志：`/www/wwwroot/ai-creator/logs/update-install/last.json`
- 需要时可手动回滚：
  ```bash
  cd /www/wwwroot/ai-creator
  # 查看所有 release
  ls -la releases/
  # 手动切换 current 符号链接到旧版本
  ln -sfn releases/旧版本目录 current
  pm2 reload ai-creator
  ```

---

> 更多技术细节参考 [AI 开发指南](AI_DEVELOPMENT_GUIDE.md) 和 [小程序接口文档](MINI_PROGRAM_API.md)。
